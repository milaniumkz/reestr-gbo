const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const index = readFileSync(new URL('../web/index.html', `file://${__filename}`), 'utf8');
const inline = index.match(/<script>([\s\S]*?)<\/script>/)[1];

function harness({storageHangs = false} = {}) {
  const listeners = {}, timers = new Map(), scripts = [], removed = [], deleted = [];
  const nodes = Object.fromEntries(['startup', 'startup-message', 'startup-retry'].map(id => [id, {
    hidden: id === 'startup-retry', textContent: '',
    remove: () => removed.push(id), addEventListener: (name, fn) => { listeners[id + ':' + name] = fn; },
  }]));
  const context = {
    console: {warn() {}, error() {}}, HTMLScriptElement: class {},
    navigator: {}, document: {getElementById: id => nodes[id], createElement: () => ({}), body: {appendChild: s => scripts.push(s)}},
    setTimeout: (fn, ms) => { timers.set(ms, fn); return ms; }, clearTimeout: ms => timers.delete(ms),
  };
  context.window = {location: {reload: () => removed.push('reload')},
    addEventListener: (name, fn) => {listeners[name] = fn;},
    caches: {keys: () => storageHangs ? new Promise(() => {}) : Promise.resolve(['flutter-app-cache', 'technical-push']),
      delete: key => {deleted.push(key); return Promise.resolve(true);}},
  };
  context.caches = context.window.caches;
  vm.runInNewContext(inline, context);
  return {listeners, timers, scripts, removed, deleted, nodes, context};
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('startup continues when browser cache storage never responds', async () => {
  const h = harness({storageHangs: true});
  assert.equal(h.scripts.length, 0);
  h.timers.get(1500)(); await settle();
  assert.match(h.scripts[0].src, /^flutter_bootstrap.js\?v=/);
});

test('normal startup preserves unrelated caches and removes splash only on first frame', async () => {
  const h = harness(); await settle();
  assert.deepEqual(h.deleted, ['flutter-app-cache']);
  assert.equal(h.scripts.length, 1);
  h.listeners['flutter-first-frame']();
  assert.deepEqual(h.removed, ['startup']);
  assert.equal(h.timers.has(45000), false);
  h.listeners['ersi-bootstrap-error']();
  assert.equal(h.nodes['startup-retry'].hidden, true);
});

test('failed entrypoint and startup timeout offer a reload instead of a blank page', async () => {
  const h = harness(); await settle();
  h.listeners.error({target: new h.context.HTMLScriptElement()});
  assert.equal(h.nodes['startup-retry'].hidden, false);
  assert.match(h.nodes['startup-message'].textContent, /Не удалось/);
  h.listeners['startup-retry:click']();
  assert.deepEqual(h.removed, ['reload']);
  const timeout = harness(); timeout.timers.get(45000)();
  assert.equal(timeout.nodes['startup-retry'].hidden, false);
});

test('Flutter loads its renderer from the current server and reports bootstrap rejection', async () => {
  const source = readFileSync(new URL('../web/flutter_bootstrap.js', `file://${__filename}`), 'utf8')
    .replace('{{flutter_js}}', '').replace('{{flutter_build_config}}', '');
  let options, event;
  vm.runInNewContext(source, {URL, Event, Date, console: {error() {}},
    document: {baseURI: 'https://example.org/'}, window: {dispatchEvent: e => {event = e.type;}},
    _flutter: {loader: {load: config => { options = config; return Promise.reject(new Error('network unavailable')); }}},
  });
  await settle();
  assert.equal(options.config.canvasKitBaseUrl, 'https://example.org/canvaskit/');
  assert.equal(event, 'ersi-bootstrap-error');
});
