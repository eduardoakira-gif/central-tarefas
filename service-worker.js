/*
 * service-worker.js
 * - Guarda os arquivos do app em cache para abrir rápido e funcionar offline.
 * - Recebe Web Push do servidor (quando configurado) e mostra a notificação.
 * - Atende o Periodic Background Sync (Chrome/Edge com app instalado),
 *   lendo as tarefas do IndexedDB e mostrando o lembrete com o app fechado.
 *
 * Ao publicar uma nova versão, aumente CACHE_VERSION.
 */
importScripts('./js/core.js');

const CACHE_VERSION = 'v1.0.0';
const CACHE = 'central-tarefas-' + CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/core.js',
  './js/storage.js',
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
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('central-tarefas-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro para os arquivos do app (pega atualizações), cache como reserva offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
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

async function checkAndNotify() {
  const C = self.Core;
  const settings = C.mergeSettings(await C.idb.get('kv', 'settings'));
  if (settings.push.enabled) return; // o servidor cuida dos lembretes
  const now = new Date();
  if (!C.isReminderDue(settings, now)) return;
  const tasks = ((await C.idb.getAll('tasks')) || []).map(C.normalizeTask);
  const digest = C.buildDigest(tasks, now);
  if (digest) {
    await self.registration.showNotification(digest.title, Object.assign({ body: digest.body, data: { url: './' } }, NOTIF_OPTIONS));
  }
  settings.lastNotifiedAt = now.toISOString();
  await C.idb.put('kv', settings, 'settings');
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
  event.waitUntil(
    self.registration.showNotification(title, Object.assign({ body: data.body || '', data: { url: data.url || './' } }, NOTIF_OPTIONS))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
