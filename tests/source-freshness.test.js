const test = require("node:test");
const assert = require("node:assert/strict");
const { sourceTimeFresh, ovationFresh } = require("../api/national-aurora")._test;
const now = Date.parse("2026-10-11T00:00:00Z");
test("NOAA observations must be recent and not future-dated", () => {
  assert.equal(sourceTimeFresh(new Date(now-2*3600000).toISOString(),6*3600000,now),true);
  assert.equal(sourceTimeFresh(new Date(now-7*3600000).toISOString(),6*3600000,now),false);
  assert.equal(sourceTimeFresh(null,6*3600000,now),false);
  assert.equal(sourceTimeFresh(now+20*60000,6*3600000,now),false);
});
test("OVATION observation and forward-forecast timestamps are both gated", () => {
  assert.equal(ovationFresh({observation_time:now-30*60000,forecast_time:now+40*60000},now),true);
  assert.equal(ovationFresh({observation_time:now-3*3600000,forecast_time:now+40*60000},now),false);
  assert.equal(ovationFresh({observation_time:now,forecast_time:now+3*3600000},now),false);
});
