const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../api/national-aurora.js")._test;

const html = fs.readFileSync(path.join(__dirname, "..", "public", "national-tools", "aurora", "index.html"), "utf8");

test("national aurora page owns the national canonical and decision endpoint", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/chrisizworski\.com\/national-tools\/aurora\/">/);
  assert.match(html, /\/api\/national-aurora/);
  assert.match(html, /aurora/i);
});

test("moon request remains deterministic and source-specific", () => {
  const result = T.moonUrl(43.594, -83.89, "America/Detroit", new Date("2026-09-03T12:00:00Z"));
  const url = new URL(result.url);
  assert.equal(url.hostname, "aa.usno.navy.mil");
  assert.equal(result.date, "2026-09-03");
  assert.match(url.searchParams.get("coords"), /^43\.594,-83\.890$/);
});

test("no near-term darkness produces an explicit daylight state instead of a visibility promise", () => {
  const result = T.verdict({ ovation: 25, peakKp: 7, nights: [], bestWindow: null });
  assert.equal(result.level, "daylight");
  assert.match(result.label, /No darkness/i);
  assert.equal(result.confidence, "high");
});

test("national aurora module exposes only bounded decision helpers to tests", () => {
  for (const key of ["moonUrl", "nightCandidates", "reasons", "verdict"]) {
    assert.equal(typeof T[key], "function", key);
  }
});
