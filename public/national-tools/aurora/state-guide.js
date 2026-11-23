// The state tool owns its forecast points and deep-link IDs.
(() => {
  const base = '/national-tools/aurora/';
  const states = { AK: 'Alaska', ME: 'Maine', MN: 'Minnesota', MT: 'Montana', ND: 'North Dakota' };
  const panel = document.getElementById('state-guide');
  const link = panel.querySelector('a');
  const note = panel.querySelector('p');
  let generation = 0;

  function reset() {
    generation++;
    panel.hidden = true;
    link.removeAttribute('href');
    delete link.dataset.region;
  }

  function nearest(catalog, lat, lon) {
    if (catalog?.version !== 1 || !Array.isArray(catalog.regions)) return null;
    const rad = Math.PI / 180;
    let best = null;
    let shortest = Infinity;
    for (const place of catalog.regions) {
      if (!place || !/^[a-z0-9-]+$/.test(place.id || '') || typeof place.label !== 'string' ||
          !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) continue;
      const distance = Math.sin((place.latitude - lat) * rad / 2) ** 2 +
        Math.cos(lat * rad) * Math.cos(place.latitude * rad) * Math.sin((place.longitude - lon) * rad / 2) ** 2;
      if (distance < shortest) { shortest = distance; best = place; }
    }
    return best;
  }

  async function show(code, latitude, longitude) {
    reset();
    const state = states[code];
    if (!state) return;
    const current = generation;
    const path = base + state.toLowerCase().replaceAll(' ', '-') + '/';
    // Absolute URLs keep the shared locator from appending the search query.
    link.href = new URL(path, location.origin).href;
    link.dataset.state = code;
    link.textContent = 'Explore the ' + state + ' northern lights guide';
    note.textContent = 'Find regional forecasts and places to watch in ' + state + '.';
    panel.hidden = false;
    if (code !== 'MT') return;
    try {
      const response = await fetch(path + 'forecast-regions.v1.json', {signal: AbortSignal.timeout(5000)});
      if (!response.ok) return;
      const place = nearest(await response.json(), latitude, longitude);
      if (!place || current !== generation) return;
      link.href = new URL(path + '?region=' + encodeURIComponent(place.id), location.origin).href;
      link.dataset.region = place.id;
      link.textContent = 'Check the sky near ' + place.label;
      note.textContent = 'This is the closest Montana forecast point to your search. Compare its cloud cover with another spot at the same hour after dark.';
    } catch { /* The state guide is available even when its forecast catalog is offline. */ }
  }

  link.addEventListener('click', () => {
    if (typeof window.gtag === 'function') window.gtag('event', 'aurora_state_guide_open', {
      state_code: link.dataset.state, region_id: link.dataset.region || 'statewide'
    });
  });
  window.AuroraStateGuide = { reset, show };
})();
