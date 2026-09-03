const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MICHIGAN_REGIONS } = require("../lib/aurora.js");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "northern-lights-michigan", "index.html"), "utf8");

test("the static region cards match lib/aurora.js so the towns are in the served HTML", () => {
  // These strings exist twice: once in the model, once baked into the page for the
  // no-JavaScript render. They drifted apart before, which meant the town names people
  // actually search for only appeared after the client fetched the API.
  for (const region of MICHIGAN_REGIONS) {
    const card = new RegExp(`data-region-id="${region.id}"[\\s\\S]{0,240}?<p class="region-places">([^<]*)</p>`);
    const match = html.match(card);
    assert.ok(match, `no static card for ${region.id}`);
    assert.equal(match[1], region.places, `${region.id} static card drifted from the model`);
  }
});

test("the demand towns are present in the served HTML, not only in the API response", () => {
  // Every one of these is a town or regional phrasing that Google autocomplete returns for
  // Michigan aurora queries and that the page carried nowhere before 2026-08-07.
  for (const town of ["Houghton", "Hancock", "Escanaba", "Paradise", "Petoskey", "Gaylord", "Alpena", "Lansing", "Grand Rapids", "northern Michigan", "west Michigan"]) {
    assert.ok(html.includes(town), `${town} is missing from the page`);
  }
});

test("both halves of the synonym are covered: northern lights and aurora borealis", () => {
  assert.match(html, /<title>[^<]*Northern Lights[^<]*<\/title>/i, "the title keeps the head term");
  assert.match(html, /name="description" content="[^"]*aurora borealis/i, "the description carries the synonym");
});

test("the regional decision engine uses authoritative sky factors without hard-coded promises", () => {
  assert.ok(html.includes('id="regionSelect"'));
  assert.ok(html.includes('id="selectedCloud"'));
  assert.ok(html.includes('id="selectedMoon"'));
  assert.ok(html.includes('id="nextBestWindow"'));
  assert.ok(html.includes("bestPlanningPeriod"));
  assert.ok(html.includes("not a visibility probability"));
  assert.ok(html.includes("National Weather Service API"));
  assert.ok(html.includes("U.S. Naval Observatory Data Services"));
  assert.ok(!html.includes("New moon, 5 days"));
});

test("aurora measurement stores only a regional preference and never sends coordinates", () => {
  assert.ok(html.includes("localStorage.setItem(REGION_PREF_KEY, id)"));
  assert.ok(html.includes("trackAuroraEvent('Aurora Location Used', {region:nearestRegion.id})"));
  assert.ok(html.includes("trackAuroraEvent('Aurora Field Report'"));
  assert.doesNotMatch(html, /trackAuroraEvent\([^\n]+(?:latitude|longitude|\blat\b|\blng\b)/i);
  assert.ok(!html.includes("lat.toFixed(2)+', '+lng.toFixed(2)"));
});
