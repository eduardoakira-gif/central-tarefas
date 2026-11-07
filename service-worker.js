/*
 * service-worker.js
 * - Guarda os arquivos do app em cache para abrir rápido e funcionar offline.
 * - Recebe Web Push do servidor (quando configurado) e mostra a notificação.
 * - Atende o Periodic Background Sync (Chrome/Edge com app instalado),
 *   lendo as tarefas do IndexedDB e mostrando o lembrete com o app fechado.
 *
 * Ao publicar uma nova versão, aumente CACHE_VERSION. O app instalado baixa
 * a versão nova e recarrega sozinho, sem precisar reinstalar nada.
 */
importScripts('./js/core.js');

const CACHE_VERSION = 'v7.9.0';
const CACHE = 'central-tarefas-' + CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/core.js',
  './js/config.js',
  './js/api.js',
  './js/storage.js',
  './js/sync.js',
  './js/notes.js',
  './js/b2c.js',
  './js/radar.js',
  './js/assistant.js',
  './js/crm.js',
  './js/references.js',
  './js/learn.js',
  './js/board.js',
  './js/areas.js',
  './js/brand.js',
  './js/study.js',
  './js/inferno.js',
  './js/myday.js',
  './js/team.js',
  './js/playbooks.js',
  './js/status.js',
  './js/search.js',
  './js/kanban.js',
  './js/growth.js',
  './js/team-view.js',
  './js/projects.js',
  './js/nfe.js',
  './js/whatsnew.js',
  './js/tasks.js',
  './js/notifications.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/badge-96.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' garante que a versão nova venha da rede, não do cache HTTP do navegador
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('central-tarefas-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Arquivos do app pelo cache da versão (abre na hora); fontes pela rede.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Compartilhar do Android (texto, link ou arquivos, ex.: XML de NF-e do Gmail)
  if (req.method === 'POST' && url.searchParams.has('share-target')) {
    event.respondWith(
      (async () => {
        try {
          const fd = await req.formData();
          const files = [];
          for (const f of fd.getAll('files')) {
            if (f && typeof f.text === 'function' && f.size < 3000000) files.push({ name: f.name || 'arquivo', type: f.type || '', text: await f.text() });
          }
          await self.Core.idb.put('kv', { title: String(fd.get('title') || ''), text: String(fd.get('text') || ''), url: String(fd.get('url') || ''), files, at: Date.now() }, 'share-inbox');
        } catch (e) {
          // segue para o app mesmo assim
        }
        return Response.redirect(new URL('./index.html?shared=1', self.registration.scope).href, 303);
      })()
    );
    return;
  }
  if (req.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  // Arquivos do app: abre na hora pelo cache desta versão e confere a rede em segundo plano.
  // Cada versão nova troca o CACHE_VERSION: o app baixa tudo de novo e recarrega sozinho.
  if (sameOrigin) {
    const appPage = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
    if (req.mode === 'navigate' && !appPage) return; // outras páginas (ex.: inscrição de voluntário) vão direto à rede
    const key = appPage ? './index.html' : req;
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(key, { ignoreSearch: appPage });
        const network = fetch(appPage ? req : new Request(req, { cache: 'no-cache' }))
          .then((res) => {
            if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
            return res;
          });
        if (hit) {
          event.waitUntil(network.catch(() => {}));
          return hit;
        }
        return network.catch(() => cache.match('./index.html'));
      })
    );
    return;
  }
  // Fontes do Google: rede primeiro, cache como reserva
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// -----------------------------------------------------------------------------
// Notificações
// -----------------------------------------------------------------------------
const NOTIF_OPTIONS = {
  tag: 'central-tarefas',
  renotify: true,
  icon: './assets/icon-192.png',
  badge: './assets/badge-96.png',
};

// Lembrete local em segundo plano (Chrome/Edge com app instalado, sem push)
async function checkAndNotify() {
  const C = self.Core;
  const id = await C.idb.get('kv', 'lastCentralId');
  if (!id) return;
  const cache = await C.idb.get('kv', 'central:' + id);
  if (!cache || !cache.central) return;
  const device = Object.assign({ lastNotifiedAt: null, push: false, muted: false }, await C.idb.get('kv', 'device:' + id));
  if (device.push || device.muted) return; // o servidor cuida, ou o usuário desativou
  const settings = C.mergeSettings(cache.central.settings);
  if (!settings.notificationsEnabled) return;
  const now = new Date();
  const tasks = (cache.tasks || []).map((t) => C.normalizeTask(t));
  // resumo do dia
  const today = C.toDateKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const summaryAt = C.toMin(settings.dailySummaryTime) ?? 480;
  if (settings.dailySummary && device.lastSummaryOn !== today && minutes >= summaryAt && minutes < summaryAt + 180) {
    const s = C.buildDailySummary(tasks, now);
    if (s) await self.registration.showNotification(cache.central.name + ': seu dia', Object.assign({ body: s.body, data: { url: './?c=' + id } }, NOTIF_OPTIONS));
    device.lastSummaryOn = today;
    device.lastNotifiedAt = now.toISOString();
    await C.idb.put('kv', device, 'device:' + id);
    return;
  }
  if (!C.isReminderDue(settings, device.lastNotifiedAt, now)) return;
  const digest = C.buildDigest(tasks, now);
  if (digest) {
    const title = cache.central.name + ': ' + digest.title.charAt(0).toLowerCase() + digest.title.slice(1);
    await self.registration.showNotification(title, Object.assign({ body: digest.body, data: { url: './?c=' + id } }, NOTIF_OPTIONS));
  }
  device.lastNotifiedAt = now.toISOString();
  await C.idb.put('kv', device, 'device:' + id);
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'lembretes-tarefas') event.waitUntil(checkAndNotify());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Tarefas pendentes', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Tarefas pendentes';
  const route = typeof data.route === 'string' && data.route.startsWith('#/') ? data.route : '';
  event.waitUntil(
    self.Core.idb.get('kv', 'lastCentralId').catch(() => null).then((id) =>
      self.registration.showNotification(
        title,
        Object.assign({}, NOTIF_OPTIONS, {
          body: data.body || '',
          tag: data.tag ? 'central-' + String(data.tag).slice(0, 20) : NOTIF_OPTIONS.tag,
          data: { url: (data.centralId ? './?c=' + data.centralId : id ? './?c=' + id : './') + route },
        })
      )
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.split('#')[0] === target.split('#')[0] && 'focus' in client) {
          if (target.includes('#') && 'navigate' in client) return client.navigate(target).then((c) => (c || client).focus());
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
