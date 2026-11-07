// Run against the compiled camera_harness.dart on localhost (see docs/browser-external-cameras.md).
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let lastPage;
const url = process.env.CAMERA_TEST_URL || 'http://127.0.0.1:8084/';

async function installCameras(page, mode = 'normal', initial = ['back', 'usb']) {
  await page.addInitScript(({ mode, initial }) => {
    const devices = navigator.mediaDevices;
    const realEnumerate = devices.enumerateDevices.bind(devices);
    const state = window.cameraTest = {
      mode, ids: initial, streams: [], calls: [], failUsb: false,
      denied: mode === 'denied', delayed: mode === 'delayed', failEnumerate: false,
    };
    const names = { back: 'Phone rear camera', usb: 'USB Endoscope', extra: 'External camera' };
    devices.enumerateDevices = async () => {
      if (state.failEnumerate) throw new Error('Enumeration unavailable');
      const real = await realEnumerate();
      const prototype = Object.getPrototypeOf(real.find(d => d.kind === 'videoinput'));
      return state.ids.map(id => Object.create(prototype, Object.fromEntries(
        Object.entries({ deviceId: id, label: names[id], kind: 'videoinput', groupId: id })
          .map(([key, value]) => [key, { value, configurable: true }]))));
    };
    devices.getUserMedia = async constraints => {
      state.calls.push(constraints);
      // Mimic Android hardware: opening a second device requires releasing the first.
      if (state.streams.some(s => s.getTracks().some(t => t.readyState === 'live'))) {
        throw new Error('Previous camera was not stopped');
      }
      if (state.denied) throw new DOMException('Denied', 'NotAllowedError');
      const id = constraints.video.deviceId?.exact || 'back';
      if (!state.ids.includes(id)) throw new DOMException('Missing', 'NotFoundError');
      if (id === 'usb' && state.failUsb) throw new DOMException('Busy', 'NotReadableError');
      if (state.delayed) await new Promise(resolve => { state.resolve = resolve; });
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d');
      const paint = () => { ctx.fillStyle = id === 'usb' ? '#124ce0' : '#e04512'; ctx.fillRect(0, 0, canvas.width, canvas.height); };
      paint();
      const stream = canvas.captureStream(15);
      const timer = setInterval(() => {
        if (stream.getTracks().every(t => t.readyState === 'ended')) clearInterval(timer);
        else paint();
      }, 50);
      for (const track of stream.getVideoTracks()) {
        const settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), deviceId: id });
        track.applyConstraints = async () => { throw new DOMException('Fixed focus', 'OverconstrainedError'); };
      }
      state.streams.push(stream);
      return stream;
    };
  }, { mode, initial });
}
async function waitReady(page) {
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(b => /СДЕЛАТЬ ФОТО|ФОТОҒА ТҮСІРУ/.test(b.textContent));
    return button && !button.disabled;
  });
}
async function stopped(page) {
  assert(await page.evaluate(() => window.cameraTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))));
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 393, height: 760 } });
  async function fixture({ mode = 'normal', ids = ['back', 'usb'], query = '' } = {}) {
    const page = await context.newPage(); lastPage = page; page.setDefaultTimeout(8000);
    page.on('pageerror', e => { throw e; });
    await installCameras(page, mode, ids);
    await page.goto(url + query);
    await page.getByRole('button', { name: 'Launch camera' }).click();
    return page;
  }
  // Capture pixels from the selected external camera, not the old phone stream.
  let page = await fixture(); await waitReady(page);
  await page.getByRole('combobox', { name: 'Камера', exact: true }).selectOption('usb'); await waitReady(page);
  assert.equal(await page.locator('select').inputValue(), 'usb');
  if (process.env.CAMERA_TEST_SCREENSHOT) await page.screenshot({path:process.env.CAMERA_TEST_SCREENSHOT});
  assert(await page.evaluate(() => !('facingMode' in window.cameraTest.calls.at(-1).video)));
  await page.getByRole('button', { name: 'СДЕЛАТЬ ФОТО', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#photo')?.naturalWidth > 0);
  const photo = await page.evaluate(() => {
    const img = document.querySelector('#photo'), c = document.createElement('canvas'); c.width = c.height = 1;
    c.getContext('2d').drawImage(img, 0, 0, 1, 1);
    return { pixel: [...c.getContext('2d').getImageData(0, 0, 1, 1).data], ratio: img.naturalWidth / img.naturalHeight };
  });
  assert(photo.pixel[2] > 180 && photo.pixel[0] < 60, JSON.stringify(photo));
  assert(Math.abs(photo.ratio - 1.6) < .01); await stopped(page);
  // A removed remembered USB device falls back only when opening a new dialog.
  await page.evaluate(() => { window.cameraTest.ids = ['back']; });
  await page.getByRole('button', { name: 'Launch camera' }).click(); await waitReady(page);
  assert.equal(await page.locator('select').inputValue(), 'back');
  await page.getByRole('button', { name: 'ОТМЕНА', exact: true }).click(); await stopped(page); await page.close();
  console.log('PASS selected USB pixels, Android stream release, crop, cleanup, remembered-camera fallback');

  page = await fixture({ ids: ['back'] }); await waitReady(page);
  await page.evaluate(() => { window.cameraTest.ids.push('usb'); navigator.mediaDevices.dispatchEvent(new Event('devicechange')); });
  await page.waitForFunction(() => [...document.querySelector('select').options].some(o => o.value === 'usb'));
  assert.equal(await page.locator('select').inputValue(), 'back');
  await page.locator('select').selectOption('usb'); await waitReady(page);
  await page.evaluate(() => { window.cameraTest.ids = ['back']; const t = window.cameraTest.streams.at(-1).getVideoTracks()[0]; t.stop(); t.dispatchEvent(new Event('ended')); navigator.mediaDevices.dispatchEvent(new Event('devicechange')); });
  await page.getByRole('status').filter({ hasText: 'Камера отключена' }).waitFor();
  assert(await page.getByRole('button', { name: 'СДЕЛАТЬ ФОТО', exact: true }).isDisabled());
  await page.locator('select').selectOption('back'); await waitReady(page);
  await page.evaluate(() => { window.cameraTest.ids.push('extra'); });
  await page.getByRole('button', { name: 'Обновить камеры', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelector('select').options].some(o => o.value === 'extra'));
  await page.getByRole('button', { name: 'ОТМЕНА', exact: true }).click(); await stopped(page); await page.close();
  console.log('PASS hot-plug, disconnect blocks stale capture, manual refresh, recovery');

  page = await fixture(); await waitReady(page);
  await page.evaluate(() => { window.cameraTest.failUsb = true; });
  await page.locator('select').selectOption('usb');
  await page.getByRole('status').filter({ hasText: 'Не удалось открыть камеру' }).waitFor();
  assert(await page.getByRole('button', { name: 'СДЕЛАТЬ ФОТО', exact: true }).isDisabled());
  await stopped(page); await page.locator('select').selectOption('back'); await waitReady(page);
  await page.evaluate(() => { window.cameraTest.failEnumerate = true; });
  await page.getByRole('button', { name: 'Обновить камеры', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Не удалось обновить список камер' }).waitFor();
  assert(!(await page.getByRole('button', { name: 'СДЕЛАТЬ ФОТО', exact: true }).isDisabled()));
  await page.keyboard.press('Escape'); await stopped(page); await page.close();
  console.log('PASS unavailable USB device, fixed-focus support, enumeration failure keeps live camera');

  page = await fixture({ mode: 'denied' });
  await page.getByRole('status').filter({ hasText: 'Разрешите камеру' }).waitFor();
  await page.evaluate(() => { window.cameraTest.denied = false; });
  await page.getByRole('button', { name: 'Обновить камеры', exact: true }).click(); await waitReady(page);
  await page.keyboard.press('Escape'); await stopped(page); await page.close();
  console.log('PASS permission denial and retry without leaving capture');

  page = await fixture({ mode: 'delayed' });
  await page.waitForFunction(() => window.cameraTest.resolve);
  await page.getByRole('button', { name: 'ОТМЕНА', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.evaluate(() => window.cameraTest.resolve());
  await page.waitForFunction(() => window.cameraTest.streams.length === 1 && window.cameraTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  await stopped(page); await page.close();
  console.log('PASS cancellation while permission/camera opening is pending');

  page = await fixture(); await waitReady(page);
  await page.evaluate(() => { window.cameraTest.delayed = true; });
  await page.locator('select').selectOption('usb'); await page.waitForFunction(() => window.cameraTest.resolve);
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.evaluate(() => window.cameraTest.resolve());
  await page.waitForFunction(() => window.cameraTest.streams.length === 2 && window.cameraTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  await page.close(); console.log('PASS cancellation during camera switch releases late stream');

  page = await fixture({ query: '?lang=kk&document=true' }); await waitReady(page);
  await page.getByRole('button', { name: 'Камераларды жаңарту', exact: true }).waitFor();
  await page.getByRole('button', { name: 'ФОТОҒА ТҮСІРУ', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#photo')?.naturalWidth > 0);
  await stopped(page); await page.close(); console.log('PASS Kazakh controls and existing document-capture flow');
  await browser.close();
})().catch(async error => { console.error(error); if(lastPage) {console.error(await lastPage.locator('body').innerText().catch(()=>'')); await lastPage.screenshot({path:process.env.CAMERA_FAILURE_SCREENSHOT || '/tmp/ersi-camera-test-failure.png'}).catch(()=>{});} process.exit(1); });
