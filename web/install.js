/* Install UI is separate from Flutter startup; the worker never caches app code. */
(() => {
  'use strict';
  const installedKey = 'ersi-pwa-installed';
  const dismissedKey = 'ersi-install-dismissed-at';
  let deferredPrompt = null, ready = false, installed = false, dialog = null, busy = false, notice = null, waitingTimer = null;
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
      confirm:'Подтвердите добавление значка в окне браузера. Сайтом уже можно пользоваться.', adding:'Браузер добавляет значок на главный экран. Ждать здесь не нужно — можно продолжать работу.', waiting:'Браузер пока не подтвердил установку. Проверьте главный экран; при необходимости добавьте значок через меню браузера.', added:'Значок ЕРСИ ГБО добавлен на главный экран.', close:'Закрыть', failed:'Установка не завершена. Попробуйте ещё раз или воспользуйтесь меню браузера.', done:'ЕРСИ ГБО уже установлено', doneText:'Откройте приложение с помощью значка на главном экране.'},
    kk: {title:'ЕРСИ ГБО орнату', text:'Қолданбаны телефонның басты экранына қосыңыз. Ол жеке терезеде, өз белгішесімен ашылады.',
      install:'Орнату', later:'Кейін', understood:'Түсінікті', ios:'iPhone құрылғысында бетті Safari арқылы ашыңыз: «Бөлісу» → «Басты экранға» → «Қосу».',
      manual:'Браузер мәзірін ⋮ ашып, «Басты экранға қосу» немесе «Қолданбаны орнату» тармағын таңдаңыз. Тармақ болмаса, сайтты Chrome немесе Safari арқылы ашыңыз.',
      confirm:'Браузер терезесінде белгішені қосуды растаңыз. Сайтты қазір пайдалануға болады.', adding:'Браузер белгішені басты экранға қосуда. Мұнда күтпей, жұмысты жалғастыра аласыз.', waiting:'Браузер орнатуды әлі растаған жоқ. Басты экранды тексеріңіз; қажет болса, белгішені браузер мәзірінен қосыңыз.', added:'ЕРСИ ГБО белгішесі басты экранға қосылды.', close:'Жабу', failed:'Орнату аяқталмады. Қайта көріңіз немесе браузер мәзірін пайдаланыңыз.', done:'ЕРСИ ГБО орнатылған', doneText:'Қолданбаны басты экрандағы белгішесі арқылы ашыңыз.'},
  };
  const style = document.createElement('style');
  style.textContent = '#ersi-install{box-sizing:border-box;width:min(380px,calc(100% - 32px));max-height:calc(100dvh - 40px);overflow:auto;border:1px solid #d6e5df;border-radius:24px;padding:24px;color:#123e34;background:white;font:16px/1.5 system-ui;box-shadow:0 20px 80px #0004}#ersi-install::backdrop{background:#092c2466}#ersi-install img{display:block;width:88px;height:88px;border-radius:18px;margin:auto}#ersi-install h2{font-size:23px;line-height:1.25;text-align:center}#ersi-install p{margin:16px 0}#ersi-install .hint{padding:12px;background:#eef7f2;border-radius:12px;font-size:14px}#ersi-install button{min-height:48px;border-radius:12px;font:inherit;padding:10px 16px;cursor:pointer;width:100%;margin-top:8px}#ersi-install-primary{background:#007a4d;border:0;color:white}#ersi-install-later{background:white;border:1px solid #ccdcd5;color:#123e34}';
  style.textContent += '#ersi-install-status{box-sizing:border-box;position:fixed;left:16px;right:16px;bottom:92px;z-index:2147483647;max-width:440px;margin:auto;padding:14px 48px 14px 16px;border:1px solid #c7dfd2;border-radius:16px;background:#fff;color:#123e34;font:15px/1.4 system-ui;box-shadow:0 8px 30px #0003}#ersi-install-status button{position:absolute;right:8px;top:8px;background:white;color:#123e34;border:0;font-size:24px;cursor:pointer}';
  document.head.appendChild(style);
  function status(key) {
    if (!notice) {
      notice = document.createElement('aside'); notice.id = 'ersi-install-status';
      notice.innerHTML = '<span role="status"></span><button type="button">×</button>';
      notice.querySelector('button').addEventListener('click', () => { notice.hidden = true; });
      document.body.appendChild(notice);
    }
    notice.querySelector('span').textContent = messages[language()][key];
    notice.querySelector('button').setAttribute('aria-label',messages[language()].close);
    notice.hidden = false;
  }

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
        if (!deferredPrompt || standalone()) { close(); return; }
        if (busy) return;
        const event = deferredPrompt;
        deferredPrompt = null;
        busy = true;
        try {
          // Invoke during the click gesture, then release our modal immediately.
          const prompted = event.prompt();
          close();
          status('confirm');
          clearTimeout(waitingTimer);
          waitingTimer = setTimeout(() => {
            if (!installed) { busy = false; status('waiting'); }
          }, 15000);
          const choice = await Promise.race([
            Promise.resolve(prompted).then(() => event.userChoice),
            new Promise(resolve => setTimeout(() => resolve(null), 15000)),
          ]);
          if (installed) return;
          if (choice?.outcome === 'accepted') status('adding');
          else if (choice?.outcome === 'dismissed') {
            clearTimeout(waitingTimer);
            if (notice) notice.hidden = true;
          }
        } catch {
          clearTimeout(waitingTimer);
          if (!installed) status('failed');
        } finally { busy = false; }

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
  window.addEventListener('appinstalled', () => { installed = true; try { localStorage.setItem(installedKey, '1'); } catch {} deferredPrompt = null; busy = false; clearTimeout(waitingTimer); close(false); status('added'); });
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
