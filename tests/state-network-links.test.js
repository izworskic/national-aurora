const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/national-tools/aurora/index.html', 'utf8');

test('national aurora hub links the established state network', () => {
  assert.match(html, /data-aurora-state-network="2026-10-01"/);
  for (const href of [
    '/national-tools/aurora/alaska/',
    '/national-tools/aurora/minnesota/',
    '/national-tools/aurora/north-dakota/',
    '/national-tools/aurora/montana/',
    '/national-tools/aurora/maine/',
    '/northern-lights-michigan/',
  ]) {
    assert.match(html, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
});

test('national aurora keeps its own canonical and preserves Michigan ownership', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/chrisizworski\.com\/national-tools\/aurora\/">/);
  assert.doesNotMatch(html, /<link rel="canonical" href="https:\/\/chrisizworski\.com\/northern-lights-michigan\/">/);
  assert.equal((html.match(/data-aurora-state-network="2026-10-01"/g) || []).length, 1);
});
