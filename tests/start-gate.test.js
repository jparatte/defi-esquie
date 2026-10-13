import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { game } from '../expedition/game-config.js';
import * as core from '../expedition/game-core.js';

// Exercise the actual app with deterministic GPS fixes and browser storage.
function bootApp(savedProgress, { search = '', liveProgress } = {}) {
  const storageKey = `${game.id}${new URLSearchParams(search).get('dev') === '1' ? ':development' : ''}:progress`;
  const nodes = new Map();
  function makeNode(id) {
    const listeners = new Map();
    let html = '';
    let childIds = [];
    const node = { id, style: {}, textContent: '', value: '', hidden: false, isConnected: true, muted: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      setAttribute() {}, removeAttribute() {}, focus() {}, pause() {}, play: async () => {},
      dispatch(type, event = {}) { return listeners.get(type)?.(event); },
      get innerHTML() { return html; },
      set innerHTML(value) {
        if (id === 'app') nodes.clear();
        else childIds.forEach(child => nodes.delete(child));
        html = value;
        const children = [...value.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)];
        childIds = children.map(match => match[1]);
        children.forEach(match => {
          const child = makeNode(match[1]); child.hidden = /\bhidden\b/.test(match[0]); nodes.set(match[1], child);
        });
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
  if (liveProgress) storage.set(`${game.id}:progress`, JSON.stringify(liveProgress));
  if (savedProgress) storage.set(storageKey, JSON.stringify(savedProgress));
  const watches = [];
  const cleared = [];
  const documentEvents = new Map();
  const document = { hidden: false, querySelector: selector => nodes.get(selector.slice(1)) ?? null,
    addEventListener(type, callback) { documentEvents.set(type, callback); } };
  const context = {
    ...core, configuredGame: game, URLSearchParams, location: { search }, document,
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
    progress: () => JSON.parse(storage.get(storageKey) ?? 'null'),
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

test('development mode plays the complete intro and new dialogue without GPS or live save changes', () => {
  const liveProgress = { phase: 'welcome', stepIndex: 0, arrived: false };
  const app = bootApp(undefined, { search: '?dev=1', liveProgress });
  assert.ok(app.nodes.has('begin'));
  assert.equal(app.nodes.has('locate'), false);
  app.click('begin');
  app.nodes.get('scene-video').dispatch('ended');
  assert.equal(app.progress().phase, 'intro-dialogue');
  app.click('dialogue-choice');
  app.nodes.get('scene-video').dispatch('ended');
  assert.equal(app.progress().phase, 'intro-briefing');
  assert.match(app.nodes.get('app').innerHTML, /quatre indices/);
  assert.match(app.nodes.get('app').innerHTML, /C&#39;est parti !/);
  app.click('briefing-choice');
  assert.equal(app.progress().phase, 'travel');
  assert.ok(app.nodes.has('answer'));
  assert.equal(app.watches.length, 0);
  assert.equal(app.storage.get(`${game.id}:progress`), JSON.stringify(liveProgress));
});

test('step one offers the hint only on request and accepts roman numerals with case and spaces ignored', () => {
  const app = bootApp({ phase: 'travel', stepIndex: 0, arrived: false }, { search: '?dev=1' });
  const submit = value => {
    app.nodes.get('answer').value = value;
    app.nodes.get('answer-form').dispatch('submit', { preventDefault() {} });
  };
  assert.equal(app.nodes.get('hint-actions').hidden, true);
  assert.equal(app.nodes.get('quest-hint').hidden, true);
  submit('1925');
  assert.equal(app.nodes.get('answer-feedback').textContent, 'Mauvaise réponse, tu veux un indice ?');
  assert.equal(app.nodes.get('hint-actions').hidden, false);
  assert.equal(app.nodes.get('quest-hint').hidden, true);
  app.click('decline-hint');
  assert.equal(app.nodes.get('hint-actions').hidden, true);
  assert.equal(app.nodes.get('quest-hint').hidden, true);
  submit('MCMXXIV');
  app.click('show-hint');
  assert.equal(app.nodes.get('quest-hint').textContent, '1900 vaut MCM');
  assert.equal(app.nodes.get('quest-hint').hidden, false);
  submit(' m c m xx v ');
  assert.equal(app.progress().phase, 'quest-success');
  assert.equal(app.nodes.has('scene-video'), false);
  assert.match(app.nodes.get('app').innerHTML, /Bravo ! Tu as trouvé le premier indice\./);
  assert.ok(core.isValidProgress(app.progress(), game.steps));
  const reopened = bootApp(app.progress(), { search: '?dev=1' });
  assert.ok(reopened.nodes.has('success-continue'));
  app.click('success-continue');
  assert.equal(app.progress().phase, 'complete');
  assert.match(app.nodes.get('app').innerHTML, /À suivre/);
});

test('normal step one permits answers immediately and shows optional distance without an arrival gate', () => {
  const app = bootApp({ phase: 'travel', stepIndex: 0, arrived: false });
  assert.ok(app.nodes.has('answer'));
  assert.equal(app.watches.length, 0);
  app.click('locate');
  app.fix(1000);
  assert.ok(app.nodes.has('answer'));
  app.watches[0].success({ timestamp: Date.now(), coords: { ...game.steps[0].destination, accuracy: 5 } });
  assert.match(app.nodes.get('location-area').innerHTML, /À 0 m/);
  assert.match(app.nodes.get('location-area').innerHTML, /De la statue/);
  assert.equal(app.progress().phase, 'travel');
  assert.equal(app.progress().arrived, false);
  assert.deepEqual(app.cleared, []);
});

test('author shortcuts open the real briefing and real first quest without changing saved progress', () => {
  const app = bootApp(undefined, { search: '?dev=1&preview=briefing' });
  assert.ok(app.nodes.has('briefing-choice'));
  app.click('briefing-choice');
  assert.match(app.nodes.get('answer-area').innerHTML, /chiffres romains/);
  app.nodes.get('answer').value = 'MCMXXV';
  app.nodes.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.progress(), null);
  assert.equal(app.watches.length, 0);
});
