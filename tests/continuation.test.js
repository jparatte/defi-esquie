import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { continuation } from '../continuation-config.js';
import { readLegacyProgress, displayedProgress, LEGACY_STORAGE_KEY } from '../legacy-progress.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}

test('existing saved accomplishments are read under the original key and never changed by archiving', () => {
  const original = '{"0":true,"2":true}';
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: original, 'roxane-expedition-v1:progress': 'existing-expedition' });
  const saved = readLegacyProgress(storage);
  const archived = displayedProgress(saved, 4, true);
  assert.deepEqual(archived, { 0: true, 1: true, 2: true, 3: true });
  assert.deepEqual(saved, { 0: true, 2: true });
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), original);
  assert.equal(storage.getItem('roxane-expedition-v1:progress'), 'existing-expedition');
  assert.deepEqual(displayedProgress(saved, 4, false), saved);
});

test('legacy empty or malformed saves safely fall back to an empty record', () => {
  for (const value of ['null', 'true', '[]', 'broken json']) {
    assert.deepEqual(readLegacyProgress(memoryStorage({ [LEGACY_STORAGE_KEY]: value })), {});
  }
  assert.deepEqual(readLegacyProgress({ getItem() { throw Error('blocked'); } }), {});
});

test('landing link opens the expedition directly and preserves development mode without storage access', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const linkMarkup = html.match(/<a id="start-last-challenge"[^>]*>/)[0];
  assert.match(linkMarkup, /href="\.\/expedition\/"/);
  assert.doesNotMatch(html, /continuation-password|continuation-form/);
  const script = fs.readFileSync(new URL('../continuation.js', import.meta.url), 'utf8');
  for (const [search, expected] of [['', './expedition/'], ['?dev=1', './expedition/?dev=1'], ['?dev=0', './expedition/']]) {
    const link = { href: './expedition/' };
    vm.runInNewContext(script, {
      URLSearchParams, location: { search },
      document: { querySelector: selector => { assert.equal(selector, '#start-last-challenge'); return link; } },
      // No localStorage or sessionStorage: navigation must not depend on either.
    });
    assert.equal(link.href, expected);
  }
});

function bootLegacy({ saved, archiveCompleted }) {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm, '');
  const nodes = new Map();
  const node = () => ({ innerHTML: '', textContent: '', style: {}, className: '',
    classList: { add() {}, remove() {} }, appendChild() {}, querySelector: () => ({ addEventListener() {} }) });
  const getNode = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const writes = [];
  let gpsRequests = 0;
  const context = { continuation: { ...continuation, archiveCompleted }, LEGACY_STORAGE_KEY, readLegacyProgress, displayedProgress,
    localStorage: { getItem: key => key === LEGACY_STORAGE_KEY ? saved : null, setItem: (...args) => writes.push(args) },
    document: { getElementById: getNode, createElement: node, querySelector: getNode },
    navigator: { geolocation: { watchPosition() { gpsRequests++; } } },
  };
  vm.runInNewContext(script, context);
  return { nodes, writes, gpsRequests };
}

test('actual landing page boots as complete without GPS requests or storage writes when archived', () => {
  const result = bootLegacy({ saved: '{"0":true}', archiveCompleted: true });
  assert.equal(result.nodes.get('progress-count').textContent, '4 / 4');
  assert.equal(result.nodes.get('progress-fill').style.width, '100%');
  assert.match(result.nodes.get('reveal-body').textContent, /Bravo/);
  assert.equal(result.gpsRequests, 0);
  assert.deepEqual(result.writes, []);
});

test('actual landing page preserves incomplete progress when completion display is disabled', () => {
  const result = bootLegacy({ saved: '{"0":true,"2":true}', archiveCompleted: false });
  assert.equal(result.nodes.get('progress-count').textContent, '2 / 4');
  assert.equal(result.gpsRequests, 1);
  assert.deepEqual(result.writes, []);
  const completed = bootLegacy({ saved: '{"0":true,"1":true,"2":true,"3":true}', archiveCompleted: false });
  assert.equal(completed.nodes.get('progress-count').textContent, '4 / 4');
  assert.equal(completed.gpsRequests, 0);
  assert.deepEqual(completed.writes, []);
});
