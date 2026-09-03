const MICHIGAN_REGIONS = Object.freeze([
  {
    id: "keweenaw",
    label: "Keweenaw Peninsula",
    places: "Copper Harbor, Houghton, Hancock, and Brockway Mountain",
    latitude: 47.47,
    longitude: -87.89,
    planning_kp: 4,
  },
  {
    id: "marquette",
    label: "Marquette",
    places: "Marquette, Escanaba, and the central Upper Peninsula",
    latitude: 46.55,
    longitude: -87.4,
    planning_kp: 4,
  },
  {
    id: "munising",
    label: "Munising",
    places: "Munising and Pictured Rocks",
    latitude: 46.41,
    longitude: -86.65,
    planning_kp: 4,
  },
  {
    id: "sault-ste-marie",
    label: "Sault Ste. Marie",
    places: "Sault Ste. Marie, Paradise, and Whitefish Point",
    latitude: 46.5,
    longitude: -84.35,
    planning_kp: 5,
  },
  {
    id: "mackinaw-city",
    label: "Mackinaw City",
    places: "Mackinaw City, Petoskey, and the Straits",
    latitude: 45.78,
    longitude: -84.73,
    planning_kp: 5,
  },
  {
    id: "traverse-city",
    label: "Traverse City",
    places: "Traverse City, Gaylord, Alpena, and northern Michigan",
    latitude: 44.76,
    longitude: -85.62,
    planning_kp: 6,
  },
  {
    id: "bay-city",
    label: "Bay City",
    places: "Bay City, the Thumb, and Saginaw Bay",
    latitude: 43.59,
    longitude: -83.89,
    planning_kp: 7,
  },
  {
    id: "detroit",
    label: "Detroit",
    places: "Detroit, Lansing, Grand Rapids, and southeast and west Michigan",
    latitude: 42.33,
    longitude: -83.05,
    planning_kp: 7,
  },
]);

function parseNoaaTime(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const zoned = /(?:z|[+-]\d\d:?\d\d)$/i.test(text) ? text : `${text}Z`;
  const timestamp = Date.parse(zoned);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseIsoDuration(value) {
  const match = String(value || "").match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );
  if (!match) return null;
  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
  return (
    Number(days) * 86_400_000 +
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000
  );
}

function parseNwsValidTime(value) {
  const [startValue, durationValue] = String(value || "").split("/");
  const start = Date.parse(startValue);
  const duration = parseIsoDuration(durationValue);
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return null;
  return { start, end: start + duration };
}

function parseSkyCover(payload, now = Date.now()) {
  const values = Array.isArray(payload?.properties?.skyCover?.values)
    ? payload.properties.skyCover.values
    : [];
  const lowerBound = now - 3_600_000;
  const upperBound = now + 72 * 3_600_000;
  const periods = values
    .map((row) => {
      const interval = parseNwsValidTime(row?.validTime);
      const percent = toFiniteNumber(row?.value);
      if (!interval || percent == null || interval.end < lowerBound || interval.start > upperBound) {
        return null;
      }
      return {
        start_time: new Date(interval.start).toISOString(),
        end_time: new Date(interval.end).toISOString(),
        percent: Math.max(0, Math.min(100, Math.round(percent))),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));

  const updatedAt = Date.parse(payload?.properties?.updateTime);
  return {
    updated_at: Number.isFinite(updatedAt) ? new Date(updatedAt).toISOString() : null,
    periods,
  };
}

function skyCoverAt(skyCover, value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const periods = Array.isArray(skyCover?.periods) ? skyCover.periods : [];
  const match = periods.find((period) => {
    const start = Date.parse(period.start_time);
    const end = Date.parse(period.end_time);
    return Number.isFinite(start) && Number.isFinite(end) && timestamp >= start && timestamp < end;
  });
  return match ? toFiniteNumber(match.percent) : null;
}

function parseMoon(payload, date = null) {
  const data = payload?.properties?.data;
  if (!data || typeof data !== "object") return null;
  const eventTime = (name) => {
    const event = Array.isArray(data.moondata)
      ? data.moondata.find((row) => String(row?.phen || "").toLowerCase() === name)
      : null;
    return event?.time ? String(event.time).replace(/\s+DT$/i, "") : null;
  };
  const illumination = toFiniteNumber(String(data.fracillum || "").replace("%", ""));
  return {
    date: date || data.date || null,
    phase: data.curphase ? String(data.curphase) : null,
    illumination_percent: illumination == null ? null : Math.max(0, Math.min(100, illumination)),
    rise_local: eventTime("rise"),
    transit_local: eventTime("upper transit"),
    set_local: eventTime("set"),
    closest_phase: data.closestphase || null,
  };
}

function normalizeRows(payload, columns) {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter(Boolean)
    .map((row) => {
      if (Array.isArray(row)) return row;
      if (!row || typeof row !== "object") return [];
      return columns.map((aliases) => {
        for (const alias of aliases) {
          if (row[alias] !== undefined && row[alias] !== null) return row[alias];
        }
        return null;
      });
    })
    .filter((row) => String(row[0] || "").toLowerCase() !== "time_tag");
}

function parseKpForecast(payload, now = Date.now()) {
  const rows = normalizeRows(payload, [["time_tag"], ["kp", "Kp"], ["observed"], ["noaa_scale"]])
    .map(([timeTag, kp, observed, noaaScale]) => ({
      time_tag: parseNoaaTime(timeTag),
      kp: toFiniteNumber(kp),
      observed: observed || null,
      noaa_scale: noaaScale || null,
    }))
    .filter((row) => row.time_tag != null && Number.isFinite(row.kp))
    .sort((a, b) => a.time_tag - b.time_tag);

  const next72 = rows.filter((row) => {
    const hours = (row.time_tag - now) / 3_600_000;
    return hours > -3 && hours <= 72;
  });
  const next24 = next72.filter((row) => (row.time_tag - now) / 3_600_000 <= 24);
  const peak24 = next24.reduce((peak, row) => (!peak || row.kp > peak.kp ? row : peak), null);
  const peak72 = next72.reduce((peak, row) => (!peak || row.kp > peak.kp ? row : peak), peak24);

  return {
    peak_24h: peak24?.kp ?? null,
    peak_24h_at: peak24 ? new Date(peak24.time_tag).toISOString() : null,
    peak_72h: peak72?.kp ?? null,
    peak_72h_at: peak72 ? new Date(peak72.time_tag).toISOString() : null,
    periods: next72.map((row) => ({
      ...row,
      time_tag: new Date(row.time_tag).toISOString(),
    })),
  };
}

function parseCurrentKp(payload) {
  const rows = normalizeRows(payload, [["time_tag"], ["Kp", "kp"], ["a_running"], ["station_count"]])
    .map(([timeTag, kp, runningA, stationCount]) => ({
      observed_at: parseNoaaTime(timeTag),
      kp: toFiniteNumber(kp),
      running_a: toFiniteNumber(runningA),
      station_count: toFiniteNumber(stationCount),
    }))
    .filter((row) => row.observed_at != null && Number.isFinite(row.kp))
    .sort((a, b) => a.observed_at - b.observed_at);
  const latest = rows.at(-1);
  if (!latest) return null;
  return {
    ...latest,
    observed_at: new Date(latest.observed_at).toISOString(),
    running_a: Number.isFinite(latest.running_a) ? latest.running_a : null,
    station_count: Number.isFinite(latest.station_count) ? latest.station_count : null,
  };
}

function latestFiniteRow(payload, columns, numericIndexes) {
  const rows = normalizeRows(payload, columns)
    .filter((row) => numericIndexes.some((index) => Number.isFinite(toFiniteNumber(row[index]))));
  return rows.at(-1) || null;
}

function parseSolarWind(magneticPayload, speedPayload) {
  const magnetic = latestFiniteRow(
    magneticPayload,
    [["time_tag"], ["bz_gsm"], ["bt"]],
    [1, 2],
  );
  const speed = latestFiniteRow(
    speedPayload,
    [["time_tag"], ["proton_speed", "speed"]],
    [1],
  );
  if (!magnetic && !speed) return null;

  const observedTimes = [parseNoaaTime(magnetic?.[0]), parseNoaaTime(speed?.[0])].filter(Number.isFinite);
  const observedAt = observedTimes.length ? Math.max(...observedTimes) : null;
  const bz = toFiniteNumber(magnetic?.[1]);
  const bt = toFiniteNumber(magnetic?.[2]);
  const protonSpeed = toFiniteNumber(speed?.[1]);

  return {
    observed_at: observedAt == null ? null : new Date(observedAt).toISOString(),
    bz_gsm_nt: Number.isFinite(bz) ? bz : null,
    bt_nt: Number.isFinite(bt) ? bt : null,
    speed_km_s: Number.isFinite(protonSpeed) ? protonSpeed : null,
  };
}

function normalizeLongitude(value) {
  const number = toFiniteNumber(value);
  if (number == null) return null;
  return ((Math.round(number) % 360) + 360) % 360;
}

function parseOvation(payload) {
  const coordinates = Array.isArray(payload?.coordinates) ? payload.coordinates : [];
  const grid = new Map();
  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 3) continue;
    const longitude = normalizeLongitude(coordinate[0]);
    const latitudeValue = toFiniteNumber(coordinate[1]);
    const latitude = latitudeValue == null ? null : Math.round(latitudeValue);
    const value = toFiniteNumber(coordinate[2]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(value)) continue;
    grid.set(`${longitude}:${latitude}`, value);
  }

  return {
    observation_time: parseNoaaTime(payload?.["Observation Time"]),
    forecast_time: parseNoaaTime(payload?.["Forecast Time"]),
    valueAt(latitude, longitude) {
      const normalizedLongitude = normalizeLongitude(longitude);
      const latitudeValue = toFiniteNumber(latitude);
      if (normalizedLongitude == null || latitudeValue == null) return null;
      const key = `${normalizedLongitude}:${Math.round(latitudeValue)}`;
      return grid.has(key) ? grid.get(key) : null;
    },
  };
}

function regionVerdict(region, peak24, ovationValue) {
  if (!Number.isFinite(peak24) && !Number.isFinite(ovationValue)) {
    return {
      level: "unavailable",
      status_label: "Live signal unavailable",
      detail: "NOAA data could not be read. Use the official 30-minute forecast and a local cloud forecast before making a viewing decision.",
    };
  }
  if (Number.isFinite(ovationValue) && ovationValue >= 10) {
    return {
      level: "active",
      status_label: "Active nowcast signal",
      detail: "NOAA's short-term OVATION grid is elevated near this region. Darkness, cloud cover, and a clear northern horizon still determine visibility.",
    };
  }
  if (Number.isFinite(peak24) && peak24 >= region.planning_kp) {
    return {
      level: "possible",
      status_label: "Possible in the 24-hour outlook",
      detail: `The forecast reaches this guide's Kp ${region.planning_kp} planning threshold. Confirm the 30-minute NOAA oval and local clouds before traveling.`,
    };
  }
  if (Number.isFinite(peak24) && peak24 >= region.planning_kp - 1) {
    return {
      level: "watch",
      status_label: "Watch conditions",
      detail: `The forecast is within one Kp point of this guide's Kp ${region.planning_kp} planning threshold. A stronger-than-forecast interval could improve the odds.`,
    };
  }
  return {
    level: "low",
    status_label: "Low signal",
    detail: `The current 24-hour forecast is below this guide's Kp ${region.planning_kp} planning threshold. Keep the official NOAA nowcast as the final check.`,
  };
}

function buildRegionalOutlook(ovationPayload, peak24) {
  const ovation = parseOvation(ovationPayload);
  return {
    observation_time:
      ovation.observation_time == null ? null : new Date(ovation.observation_time).toISOString(),
    forecast_time:
      ovation.forecast_time == null ? null : new Date(ovation.forecast_time).toISOString(),
    regions: MICHIGAN_REGIONS.map((region) => {
      const ovationValue = ovation.valueAt(region.latitude, region.longitude);
      return {
        ...region,
        ovation_value: ovationValue,
        ...regionVerdict(region, peak24, ovationValue),
      };
    }),
  };
}

module.exports = {
  MICHIGAN_REGIONS,
  buildRegionalOutlook,
  normalizeRows,
  parseCurrentKp,
  parseIsoDuration,
  parseKpForecast,
  parseMoon,
  parseNoaaTime,
  parseOvation,
  parseSkyCover,
  parseSolarWind,
  regionVerdict,
  skyCoverAt,
  toFiniteNumber,
};
