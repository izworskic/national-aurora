const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('public/national-tools/aurora/state-guide.js', 'utf8');

function fixture(fetch) {
  const link = {dataset: {}, addEventListener() {}, removeAttribute() {delete this.href;}};
  const panel = {querySelector: tag => tag === 'a' ? link : {}};
  const window = {};
  vm.runInNewContext(source, {window, document: {getElementById: () => panel}, fetch, URL, AbortSignal,
    location: {origin: 'https://chrisizworski.com'}});
  return {guide: window.AuroraStateGuide, panel, link};
}
const response = regions => ({ok: true, json: async () => ({version: 1, regions})});

test('closest valid point carries only its public ID', async () => {
  const {guide, link} = fixture(async () => response([
    {id:'lake', label:'Lake', latitude:48, longitude:-114}, {id:'city', label:'City', latitude:46, longitude:-111}
  ]));
  await guide.show('MT', 46.01, -111.01);
  assert.equal(new URL(link.href).search, '?region=city');
});

test('missing catalog falls back to the hub and a later search supersedes an in-flight catalog', async () => {
  let resolve;
  const {guide, link, panel} = fixture(() => new Promise(done => {resolve = done;}));
  let pending = guide.show('MT', 48, -114);
  resolve({ok: false});
  await pending;
  assert.equal(new URL(link.href).pathname, '/national-tools/aurora/montana/');
  pending = guide.show('MT', 48, -114);
  await guide.show('ME', 44, -69);
  resolve(response([{id:'lake', label:'Lake', latitude:48, longitude:-114}]));
  await pending;
  assert.equal(new URL(link.href).pathname, '/national-tools/aurora/maine/');
  await guide.show('FL', 28, -81);
  assert.equal(panel.hidden, true);
});
