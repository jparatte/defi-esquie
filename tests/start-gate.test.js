import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { game } from '../expedition/game-config.js';
import * as core from '../expedition/game-core.js';

// Exercise the actual app with deterministic GPS fixes and browser storage.
function bootApp(savedProgress) {
  const nodes = new Map();
  function makeNode(id) {
    const listeners = new Map();
    let html = '';
    let childIds = [];
    const node = { id, style: {}, textContent: '', isConnected: true, muted: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      setAttribute() {}, removeAttribute() {}, focus() {}, pause() {}, play: async () => {},
      dispatch(type, event = {}) { return listeners.get(type)?.(event); },
      get innerHTML() { return html; },
      set innerHTML(value) {
        if (id === 'app') nodes.clear();
        else childIds.forEach(child => nodes.delete(child));
        html = value;
        childIds = [...value.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
        childIds.forEach(child => nodes.set(child, makeNode(child)));
        if (id === 'app') nodes.set('app', node);
      },
    };
    return node;
  }
  nodes.set('app', makeNode('app'));
  const storage = new Map([
    ['pierres_perdues_v1', '{"0":true,"1":true,"2":true,"3":true}'],
    ['roxane-expedition-v1:progress', '{"phase":"complete","stepIndex":0,"arrived":false}'],
  ]);
  if (savedProgress) storage.set(`${game.id}:progress`, JSON.stringify(savedProgress));
  const watches = [];
  const cleared = [];
  const documentEvents = new Map();
  const document = { hidden: false, querySelector: selector => nodes.get(selector.slice(1)) ?? null,
    addEventListener(type, callback) { documentEvents.set(type, callback); } };
  const context = {
    ...core, configuredGame: game, URLSearchParams, location: { search: '' }, document,
    window: { isSecureContext: true },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    navigator: { geolocation: {
      watchPosition(success, error, options) { watches.push({ success, error, options }); return watches.length; },
      clearWatch(id) { cleared.push(id); },
    } },
  };
  const script = fs.readFileSync(new URL('../expedition/app.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '');
  vm.runInNewContext(script, context);
  return { nodes, storage, watches, cleared, document, documentEvents,
    click: id => { assert.ok(nodes.has(id), `Expected button ${id}`); return nodes.get(id).dispatch('click'); },
    progress: () => JSON.parse(storage.get(`${game.id}:progress`) ?? 'null'),
    fix: (metres, timestamp = Date.now(), watchIndex = watches.length - 1) => watches[watchIndex].success({
      timestamp, coords: { latitude: game.start.latitude + metres / 111194.9266,
        longitude: game.start.longitude, accuracy: 7 },
    }),
  };
}

test('start configuration accepts the real coordinates and rejects invalid positions or radii', () => {
  assert.deepEqual(core.validateGame(game), []);
  for (const start of [{ ...game.start, latitude: 91 }, { ...game.start, longitude: NaN }, { ...game.start, radiusMeters: 0 }]) {
    assert.ok(core.validateGame({ ...game, start }).some(error => error.includes('départ')));
  }
});

test('start stays locked outside 10 m and on stale fixes, then unlocks without autoplay at arrival', () => {
  const app = bootApp();
  assert.equal(app.nodes.has('begin'), false);
  assert.equal(app.watches.length, 0);
  app.click('locate');
  assert.equal(app.watches.length, 1);
  assert.equal(app.watches[0].options.enableHighAccuracy, true);
  app.fix(11);
  assert.equal(app.nodes.has('begin'), false);
  assert.match(app.nodes.get('location-area').innerHTML, /À 11 m/);
  app.fix(0, Date.now() - 31000);
  assert.equal(app.nodes.has('begin'), false);
  assert.match(app.nodes.get('location-area').innerHTML, /ancienne/);
  app.fix(9);
  assert.ok(app.nodes.has('begin'));
  assert.equal(app.nodes.has('scene-video'), false);
  assert.deepEqual(app.progress(), { phase: 'welcome', stepIndex: 0, arrived: true });
  assert.deepEqual(app.cleared, [1]);
  app.click('begin');
  assert.equal(app.progress().phase, 'intro-a');
  assert.equal(app.nodes.get('scene-video').src, game.intro.firstVideo);
  assert.equal(app.watches.length, 1);
});

test('arrival survives reloads; restart relocks and rejects callbacks from the stopped watcher', () => {
  const app = bootApp();
  app.click('locate'); app.fix(0);
  const reopened = bootApp(app.progress());
  assert.ok(reopened.nodes.has('begin'));
  assert.equal(reopened.watches.length, 0);
  app.click('restart'); app.click('restart-accept');
  assert.equal(app.nodes.has('begin'), false);
  assert.equal(app.progress().arrived, false);
  app.fix(0, Date.now(), 0);
  assert.equal(app.nodes.has('begin'), false);
  assert.equal(app.storage.get('pierres_perdues_v1'), '{"0":true,"1":true,"2":true,"3":true}');
  assert.equal(app.storage.get('roxane-expedition-v1:progress'), '{"phase":"complete","stepIndex":0,"arrived":false}');
});

test('GPS denial allows retry, and resumed videos do not require returning to the start', () => {
  const app = bootApp();
  app.click('locate'); app.watches[0].error({ code: 1 });
  assert.equal(app.nodes.has('begin'), false);
  assert.match(app.nodes.get('location-area').innerHTML, /Autorise la localisation/);
  app.click('locate'); assert.equal(app.watches.length, 2);
  app.fix(0); assert.ok(app.nodes.has('begin'));
  const resumed = bootApp({ phase: 'intro-a', stepIndex: 0, arrived: false });
  assert.equal(resumed.nodes.get('scene-video').src, game.intro.firstVideo);
  assert.equal(resumed.watches.length, 0);
});

test('backgrounding stops GPS, foregrounding restarts it, and old callbacks cannot unlock', () => {
  const app = bootApp();
  app.click('locate');
  app.document.hidden = true; app.documentEvents.get('visibilitychange')();
  assert.deepEqual(app.cleared, [1]);
  app.fix(0, Date.now(), 0); assert.equal(app.nodes.has('begin'), false);
  app.document.hidden = false; app.documentEvents.get('visibilitychange')();
  assert.equal(app.watches.length, 2);
  app.fix(0); assert.ok(app.nodes.has('begin'));
});
