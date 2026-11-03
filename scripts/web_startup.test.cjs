const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const index = readFileSync(new URL('../web/index.html', `file://${__filename}`), 'utf8');
const inline = index.match(/<script>([\s\S]*?)<\/script>/)[1];

function harness({storageHangs = false, workers} = {}) {
  const listeners = {}, timers = new Map(), scripts = [], removed = [], deleted = [];
  const nodes = Object.fromEntries(['startup', 'startup-message', 'startup-retry'].map(id => [id, {
    hidden: id === 'startup-retry', textContent: '',
    remove: () => removed.push(id), addEventListener: (name, fn) => { listeners[id + ':' + name] = fn; },
  }]));
  const context = {
    console: {warn() {}, error() {}}, HTMLScriptElement: class {},
    navigator: workers ? {serviceWorker:workers} : {}, document: {getElementById: id => nodes[id], createElement: () => ({}), body: {appendChild: s => scripts.push(s)}},
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

test('cache cleanup removes only legacy Flutter workers and preserves the install worker', async () => {
  const removed = [];
  const workers = {getRegistrations: async () => [
    {active:{scriptURL:'https://example.org/flutter_service_worker.js'},unregister:async()=>removed.push('flutter')},
    {active:{scriptURL:'https://example.org/ersi-pwa-sw.js'},unregister:async()=>removed.push('install')},
    {active:{scriptURL:'https://example.org/push-sw.js'},unregister:async()=>removed.push('push')},
  ]};
  // Re-run startup with the worker API present before the cleanup begins.
  const h = harness({workers});
  await settle();
  assert.deepEqual(removed,['flutter']);
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

test('install worker does not cache API data and gives a clear offline navigation response', async () => {
  const handlers = {};
  vm.runInNewContext(readFileSync(new URL('../web/ersi-pwa-sw.js', `file://${__filename}`), 'utf8'), {
    self:{location:{origin:'https://example.org'},addEventListener:(name,fn)=>handlers[name]=fn},
    URL,Response,Request:class {constructor(request,options){Object.assign(this,request,options);}},fetch:async()=>{throw new Error('offline');},
  });
  let response;
  handlers.fetch({request:{method:'GET',mode:'cors',url:'https://example.org/api/v1/me'},respondWith:()=>{throw new Error('API must not be intercepted');}});
  handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://example.org/'},respondWith:r=>{response=r;}});
  const offline = await response;
  assert.equal(offline.status,503);
  assert.equal(offline.headers.get('Cache-Control'),'no-store');
  assert.match(await offline.text(),/Нет подключения/);
});

test('frontend publisher stamps a versioned bundle and install script', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const {execFileSync} = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'ersi-web-stamp-'));
  try {
    const sha='a'.repeat(40);
    fs.writeFileSync(path.join(dir,'main.dart.js'),'bundle');
    fs.writeFileSync(path.join(dir,'index.html'),'<meta name="ersi-release" content="__ERSI_RELEASE__"><script src="install.js?v=1"></script><script src="auto-update.js?v=1"></script>');
    fs.writeFileSync(path.join(dir,'flutter_bootstrap.js'),'const cfg={"mainJsPath":"main.dart.js"};'+
      readFileSync(new URL('../web/flutter_bootstrap.js', `file://${__filename}`),'utf8'));
    execFileSync('python3',['scripts/stamp_web_frontend.py',sha,dir]);
    assert.equal(fs.readFileSync(path.join(dir,`main.${sha}.dart.js`),'utf8'),'bundle');
    assert.match(fs.readFileSync(path.join(dir,'flutter_bootstrap.js'),'utf8'),new RegExp(`main\\.${sha}\\.dart\\.js`));
    assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),new RegExp('install.js\\?v='+sha));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'release.json'),'utf8')).version,sha);
    assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),new RegExp('content="'+sha+'"'));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
