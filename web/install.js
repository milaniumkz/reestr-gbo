/* Install UI is separate from Flutter startup; the worker never caches app code. */
(() => {
  'use strict';
  const installedKey = 'ersi-pwa-installed';
  const dismissedKey = 'ersi-install-dismissed-at';
  let deferredPrompt = null, ready = false, installed = false, dialog = null, busy = false;
  const standalone = () => installed || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  try { installed = localStorage.getItem(installedKey) === '1'; } catch {}
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) {
    installed = true; try { localStorage.setItem(installedKey, '1'); } catch {}
  }
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const language = () => {
    try { return JSON.parse(localStorage.getItem('flutter.app_language')) === 'kk' ? 'kk' : 'ru'; } catch { return 'ru'; }
  };
  const messages = {
    ru: {title:'Установить ЕРСИ ГБО', text:'Добавьте приложение на главный экран телефона. Оно будет открываться отдельным окном, со своим значком.',
      install:'Установить', later:'Позже', understood:'Понятно', ios:'На iPhone откройте страницу в Safari: «Поделиться» → «На экран “Домой”» → «Добавить».',
      manual:'Откройте меню браузера ⋮ → «Добавить на главный экран» или «Установить приложение». Если пункта нет, откройте сайт в Chrome или Safari.',
      failed:'Установка не завершена. Попробуйте ещё раз или воспользуйтесь меню браузера.', done:'ЕРСИ ГБО уже установлено', doneText:'Откройте приложение с помощью значка на главном экране.'},
    kk: {title:'ЕРСИ ГБО орнату', text:'Қолданбаны телефонның басты экранына қосыңыз. Ол жеке терезеде, өз белгішесімен ашылады.',
      install:'Орнату', later:'Кейін', understood:'Түсінікті', ios:'iPhone құрылғысында бетті Safari арқылы ашыңыз: «Бөлісу» → «Басты экранға» → «Қосу».',
      manual:'Браузер мәзірін ⋮ ашып, «Басты экранға қосу» немесе «Қолданбаны орнату» тармағын таңдаңыз. Тармақ болмаса, сайтты Chrome немесе Safari арқылы ашыңыз.',
      failed:'Орнату аяқталмады. Қайта көріңіз немесе браузер мәзірін пайдаланыңыз.', done:'ЕРСИ ГБО орнатылған', doneText:'Қолданбаны басты экрандағы белгішесі арқылы ашыңыз.'},
  };
  const style = document.createElement('style');
  style.textContent = '#ersi-install{box-sizing:border-box;width:min(380px,calc(100% - 32px));max-height:calc(100dvh - 40px);overflow:auto;border:1px solid #d6e5df;border-radius:24px;padding:24px;color:#123e34;background:white;font:16px/1.5 system-ui;box-shadow:0 20px 80px #0004}#ersi-install::backdrop{background:#092c2466}#ersi-install img{display:block;width:88px;height:88px;border-radius:18px;margin:auto}#ersi-install h2{font-size:23px;line-height:1.25;text-align:center}#ersi-install p{margin:16px 0}#ersi-install .hint{padding:12px;background:#eef7f2;border-radius:12px;font-size:14px}#ersi-install button{min-height:48px;border-radius:12px;font:inherit;padding:10px 16px;cursor:pointer;width:100%;margin-top:8px}#ersi-install-primary{background:#007a4d;border:0;color:white}#ersi-install-later{background:white;border:1px solid #ccdcd5;color:#123e34}';
  document.head.appendChild(style);
  function close(remember = true) {
    if (remember) { try { localStorage.setItem(dismissedKey, String(Date.now())); } catch {} }
    dialog?.close();
  }
  function render() {
    if (!dialog) return;
    const t = messages[language()], added = standalone();
    dialog.querySelector('h2').textContent = added ? t.done : t.title;
    dialog.querySelector('[data-intro]').textContent = added ? t.doneText : t.text;
    const hint = dialog.querySelector('[data-hint]');
    hint.textContent = ios() ? t.ios : t.manual;
    hint.hidden = added || (!!deferredPrompt && !ios());
    dialog.querySelector('#ersi-install-primary').textContent = deferredPrompt && !added ? t.install : t.understood;
    dialog.querySelector('#ersi-install-later').textContent = t.later;
    dialog.querySelector('#ersi-install-later').hidden = added;
  }
  function show(force = false) {
    if (!force && standalone()) return;
    if (!force) {
      try { if (Date.now() - Number(localStorage.getItem(dismissedKey) || 0) < 86400000) return; } catch {}
    }
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'ersi-install';
      dialog.setAttribute('aria-labelledby', 'ersi-install-title');
      dialog.innerHTML = '<img src="/icons/Icon-192.png" alt="ЕРСИ ГБО"><h2 id="ersi-install-title"></h2><p data-intro></p><p data-hint class="hint"></p><p data-error role="status" hidden></p><button id="ersi-install-primary" type="button"></button><button id="ersi-install-later" type="button"></button>';
      dialog.addEventListener('cancel', () => close());
      dialog.querySelector('#ersi-install-later').addEventListener('click', () => close());
      dialog.querySelector('#ersi-install-primary').addEventListener('click', async () => {
        if (busy) return;
        if (!deferredPrompt || standalone()) { close(); return; }
        const event = deferredPrompt;
        deferredPrompt = null;
        busy = true;
        const button = dialog.querySelector('#ersi-install-primary');
        button.disabled = true;
        try {
          // Native installation requires a user gesture; never fabricate success.
          await event.prompt();
          const choice = await event.userChoice;
          if (choice.outcome === 'accepted') close(); else { render(); }
        } catch {
          const error = dialog.querySelector('[data-error]');
          error.textContent = messages[language()].failed;
          error.hidden = false;
          render();
        } finally { busy = false; button.disabled = false; }
      });
      document.body.appendChild(dialog);
    }
    render();
    if (!dialog.open) dialog.showModal();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installed = false; try { localStorage.removeItem(installedKey); } catch {} deferredPrompt = event;
    if (dialog?.open) render(); else if (ready) show();
  });
  window.addEventListener('appinstalled', () => { installed = true; try { localStorage.setItem(installedKey, '1'); } catch {} deferredPrompt = null; close(false); });
  window.addEventListener('ersi-install-open', () => show(true));
  function onReady() {
    if (ready) return;
    ready = true;
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/ersi-pwa-sw.js', {scope:'/', updateViaCache:'none'}).catch(() => {});
    }
    setTimeout(() => show(), 1000);
  }
  if (window.ersiFlutterReady) onReady();
  else window.addEventListener('flutter-first-frame', onReady, {once:true});
})();
