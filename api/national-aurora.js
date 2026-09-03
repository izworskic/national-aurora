const {
  parseCurrentKp,
  parseKpForecast,
  parseMoon,
  parseOvation,
  parseSkyCover,
  skyCoverAt,
} = require("../lib/aurora");
const {
  bestCloudWindow,
  finite,
  localDateKey,
  sourceMeta,
  utcOffsetHours,
} = require("@izworskic/national-outdoor-core");

const SWPC = Object.freeze({
  kpForecast: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
  kpCurrent: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
  ovation: "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
});
const UA = "ChrisIzworskiNationalAurora/2.0 (+https://chrisizworski.com/national-tools/aurora/)";

async function json(url) {
  const r = await fetch(url, {
    headers: { accept: "application/geo+json, application/json", "user-agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${new URL(url).hostname} returned ${r.status}`);
  return r.json();
}
async function nwsFor(lat, lon) {
  const points = await json(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  const gridUrl = points?.properties?.forecastGridData;
  const hourlyUrl = points?.properties?.forecastHourly;
  if (!gridUrl || !hourlyUrl) throw new Error("NWS point has no forecast endpoints");
  const [grid, hourly] = await Promise.all([json(gridUrl), json(hourlyUrl)]);
  return { points, grid, hourly };
}
function nightCandidates(hourly, skyCover, now = Date.now()) {
  return (hourly?.properties?.periods || [])
    .filter((p) => {
      const t = Date.parse(p.startTime);
      return Number.isFinite(t) && t >= now - 3600000 && t <= now + 30 * 3600000 && p.isDaytime === false;
    })
    .map((p) => ({
      time: p.startTime,
      temperature_f: p.temperature,
      cloud_percent: skyCoverAt(skyCover, p.startTime),
      short_forecast: p.shortForecast || null,
    }));
}
function moonUrl(lat, lon, timeZone, now = new Date()) {
  const date = localDateKey(now, timeZone || "UTC");
  const offset = utcOffsetHours(now, timeZone || "UTC");
  return {
    date,
    url: `https://aa.usno.navy.mil/api/rstt/oneday?date=${date}&coords=${lat.toFixed(3)},${lon.toFixed(3)}&tz=${offset}&dst=false&id=CIzw`,
  };
}
function verdict({ ovation, peakKp, nights, bestWindow }) {
  if (!nights.length) {
    return {
      level: "daylight",
      label: "No darkness in the near-term window",
      detail: "The aurora signal may exist, but this location does not have a dark viewing period in the next 30 hours.",
      confidence: "high",
    };
  }
  const signal = finite(ovation);
  const cloud = finite(bestWindow?.average_cloud_percent);
  let level = "low";
  let label = "Low viewing potential";
  let detail = "The local NOAA OVATION signal is limited right now.";

  if (signal != null && signal >= 10) {
    level = cloud != null && cloud > 70 ? "cloudy" : "strong";
    label = cloud != null && cloud > 70 ? "Strong aurora signal, poor sky" : "Strong short-term aurora signal";
    detail = cloud != null && cloud > 70
      ? "NOAA's aurora nowcast is elevated here, but the best nearby dark window is still cloud-heavy."
      : "NOAA's short-term aurora nowcast is elevated near this location and a usable dark-sky window exists.";
  } else if (signal != null && signal >= 5) {
    level = "watch";
    label = "Worth watching";
    detail = "NOAA's local OVATION signal is elevated enough to monitor as conditions evolve.";
  } else if (Number.isFinite(peakKp) && peakKp >= 6) {
    level = "watch";
    label = "Geomagnetic activity worth watching";
    detail = "The broader Kp outlook is elevated, but the local OVATION signal is not yet strong here.";
  }

  if (cloud != null && cloud > 85 && level !== "low") {
    level = "cloudy";
    label = "Clouds are the limiting factor";
  }
  return {
    level,
    label,
    detail,
    confidence: signal != null && cloud != null ? "medium-high" : "medium",
  };
}
function reasons({ signal, peakKp, bestWindow, moon }) {
  const out = [];
  if (signal != null) out.push({
    label: "Aurora signal",
    value: signal >= 10 ? "Elevated now" : signal >= 5 ? "Watchable" : "Limited",
    detail: `OVATION grid value ${Math.round(signal)}. This is a modeled signal, not a sighting probability.`,
  });
  if (bestWindow) out.push({
    label: "Sky",
    value: `${bestWindow.average_cloud_percent}% average cloud`,
    detail: "Best three-hour dark-weather window in the next 30 hours from the NWS sky-cover forecast.",
  });
  if (peakKp != null) out.push({
    label: "Geomagnetic outlook",
    value: `Peak Kp ${peakKp}`,
    detail: "Broad 24-hour space-weather context; Kp is not a local visibility forecast.",
  });
  if (moon?.illumination_percent != null) out.push({
    label: "Moon",
    value: `${Math.round(moon.illumination_percent)}% illuminated`,
    detail: moon.phase || "Moonlight is supporting context and can reduce contrast.",
  });
  return out.slice(0, 4);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const lat = finite(req.query?.lat, -90, 90), lon = finite(req.query?.lon, -180, 180);
  if (lat == null || lon == null) return res.status(400).json({ error: "Valid latitude and longitude are required" });

  const first = await Promise.allSettled([
    json(SWPC.kpForecast),
    json(SWPC.kpCurrent),
    json(SWPC.ovation),
    nwsFor(lat, lon),
  ]);
  const [kpF, kpC, ov, nws] = first;

  const forecast = kpF.status === "fulfilled"
    ? parseKpForecast(kpF.value)
    : { peak_24h: null, peak_24h_at: null, periods: [] };
  const current = kpC.status === "fulfilled" ? parseCurrentKp(kpC.value) : null;
  const parsedOv = ov.status === "fulfilled" ? parseOvation(ov.value) : null;
  const ovationValue = parsedOv ? parsedOv.valueAt(lat, lon) : null;

  let sky = { updated_at: null, periods: [] };
  let nights = [];
  let timeZone = "UTC";
  if (nws.status === "fulfilled") {
    sky = parseSkyCover(nws.value.grid);
    nights = nightCandidates(nws.value.hourly, sky);
    timeZone = nws.value.points?.properties?.timeZone || "UTC";
  }
  const bestWindow = bestCloudWindow(nights, 3);

  let moon = null;
  let moonAvailable = false;
  try {
    const moonRequest = moonUrl(lat, lon, timeZone);
    const payload = await json(moonRequest.url);
    moon = parseMoon(payload, moonRequest.date);
    moonAvailable = Boolean(moon);
  } catch {}

  const resultVerdict = verdict({
    ovation: ovationValue,
    peakKp: forecast.peak_24h,
    nights,
    bestWindow,
  });
  const retrievedAt = new Date().toISOString();

  return res.status(200).json({
    retrieved_at: retrievedAt,
    degraded: first.some((x) => x.status === "rejected"),
    location: {
      latitude: lat,
      longitude: lon,
      timeZone,
    },
    verdict: resultVerdict,
    reasons: reasons({
      signal: ovationValue,
      peakKp: forecast.peak_24h,
      bestWindow,
      moon,
    }),
    local_signal: {
      ovation_value: ovationValue,
      ovation_forecast_at: parsedOv?.forecast_time ? new Date(parsedOv.forecast_time).toISOString() : null,
      best_dark_window: bestWindow,
      night_hours: nights.slice(0, 18),
    },
    geomagnetic: {
      current_kp: current?.kp ?? null,
      current_observed_at: current?.observed_at ?? null,
      peak_24h_kp: forecast.peak_24h,
      peak_24h_at: forecast.peak_24h_at,
    },
    sky_cover_updated_at: sky.updated_at,
    moon,
    notes: {
      ovation: "OVATION is NOAA's 30–90 minute modeled aurora signal. The grid value is not a percent chance of seeing aurora.",
      kp: "Kp describes broad geomagnetic activity and is context, not a local visibility probability.",
      visibility: "Clouds, darkness, moonlight, light pollution and horizon quality can prevent a sighting even when space-weather signals are elevated.",
      best_window: "The best window ranks NWS cloud cover only among dark hours; it does not assume the current aurora signal will persist for the whole window.",
    },
    sources: [
      sourceMeta({
        name: "NOAA Space Weather Prediction Center — OVATION",
        url: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
        updatedAt: parsedOv?.forecast_time ? new Date(parsedOv.forecast_time).toISOString() : null,
        staleAfterMinutes: 120,
        available: ov.status === "fulfilled",
        status: "short-term modeled aurora signal",
      }),
      sourceMeta({
        name: "NOAA Space Weather Prediction Center — Kp",
        url: "https://www.swpc.noaa.gov/products/planetary-k-index",
        updatedAt: current?.observed_at || forecast.peak_24h_at || null,
        staleAfterMinutes: 180,
        available: kpF.status === "fulfilled" || kpC.status === "fulfilled",
        status: "geomagnetic context",
      }),
      sourceMeta({
        name: "National Weather Service forecast API",
        url: "https://www.weather.gov/documentation/services-web-API",
        updatedAt: sky.updated_at,
        staleAfterMinutes: 360,
        available: nws.status === "fulfilled",
        status: "local cloud and darkness context",
      }),
      sourceMeta({
        name: "U.S. Naval Observatory Astronomical Applications Department",
        url: "https://aa.usno.navy.mil/data/api",
        updatedAt: moon?.date || null,
        available: moonAvailable,
        status: "moon context",
      }),
    ],
  });
};

module.exports._test = { moonUrl, nightCandidates, reasons, verdict };
