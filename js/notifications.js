/*
 * notifications.js
 *
 * As configurações (ligado/desligado, frequência e horários) ficam salvas na
 * central e valem em todos os dispositivos. Cada dispositivo ativa o próprio
 * recebimento:
 *
 * - Push (preferencial): o dispositivo se cadastra no servidor e passa a
 *   receber lembretes mesmo com o app e o navegador fechados.
 * - Local (reserva, quando o push não está disponível): o app mostra o
 *   lembrete enquanto estiver aberto em alguma aba ou janela.
 */
import { api, apiConfigured } from './api.js';
import { Local } from './storage.js';

const C = window.Core;
const TAG = 'central-tarefas';
const PERIODIC_TAG = 'lembretes-tarefas';

const supported = () => 'Notification' in window;
const toB64Url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const Notifier = {
  supported,
  isIOS,
  isStandalone,

  permission() {
    return supported() ? Notification.permission : 'unsupported';
  },

  async requestPermission() {
    if (!supported()) return 'unsupported';
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  },

  pushSupported() {
    return apiConfigured() && 'serviceWorker' in navigator && 'PushManager' in window;
  },

  async show({ title, body }) {
    const options = { body, tag: TAG, renotify: true, icon: 'assets/icon-192.png', badge: 'assets/badge-96.png', data: { url: location.href } };
    const reg = await getRegistration();
    if (reg && reg.showNotification) return reg.showNotification(title, options);
    return new Notification(title, options);
  },

  localDigest(central, tasks) {
    const d = C.buildDigest(tasks, new Date());
    if (!d) return null;
    return { title: central.name + ': ' + d.title.charAt(0).toLowerCase() + d.title.slice(1), body: d.body };
  },

  /** Lembrete local (só quando este dispositivo não usa push). */
  async check(centralId, central, tasks) {
    const device = await Local.loadDevice(centralId);
    if (device.push || device.muted) return { skipped: 'device' };
    if (this.permission() !== 'granted') return { skipped: 'permission' };
    const now = new Date();
    const settings = C.mergeSettings(central.settings);
    if (!C.isReminderDue(settings, device.lastNotifiedAt, now)) return { skipped: 'not-due' };
    const digest = this.localDigest(central, tasks);
    if (digest) await this.show(digest);
    await Local.patchDevice(centralId, { lastNotifiedAt: now.toISOString() });
    return { sent: !!digest };
  },

  /** Ativa os lembretes neste dispositivo: push se possível, senão local. */
  async enable(centralId, central, tasks) {
    const perm = await this.requestPermission();
    if (perm === 'unsupported') {
      throw new Error(
        isIOS() && !isStandalone()
          ? 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar, Adicionar à Tela de Início, e abra pelo ícone.'
          : 'Este navegador não suporta notificações.'
      );
    }
    if (perm !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do site (cadeado ao lado do endereço).');

    let pushError = null;
    if (this.pushSupported()) {
      try {
        await this.enablePush(centralId);
        await Local.patchDevice(centralId, { push: true, muted: false });
        return { mode: 'push' };
      } catch (err) {
        pushError = err;
      }
    }
    await Local.patchDevice(centralId, { push: false, muted: false, lastNotifiedAt: new Date().toISOString() });
    return { mode: 'local', reason: pushError ? pushError.message : null };
  },

  async enablePush(centralId) {
    const { vapidPublicKey } = await api('config');
    if (!vapidPublicKey) throw new Error('O servidor ainda não tem as chaves de push configuradas.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const key = sub.options && sub.options.applicationServerKey;
      if (key && toB64Url(key) !== vapidPublicKey) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
    }
    await api('subscribe', {
      centralId,
      subscription: sub.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    });
  },

  async disable(centralId) {
    const device = await Local.loadDevice(centralId);
    if (device.push && this.pushSupported()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        // a assinatura do navegador é mantida, porque outras centrais podem usá-la
        if (sub) await api('unsubscribe', { centralId, endpoint: sub.endpoint });
      } catch (err) {
        console.warn(err);
      }
    }
    await Local.patchDevice(centralId, { push: false, muted: true });
  },

  async test(centralId, central, tasks) {
    const device = await Local.loadDevice(centralId);
    if (device.push) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) throw new Error('A inscrição deste dispositivo expirou. Ative as notificações de novo.');
      await api('testPush', { centralId, endpoint: sub.endpoint });
      return 'push';
    }
    if (this.permission() !== 'granted') throw new Error('Ative as notificações neste dispositivo primeiro.');
    await this.show(
      this.localDigest(central, tasks) || {
        title: central.name + ': tudo em dia',
        body: 'Nenhuma demanda depende de você agora. Os lembretes estão funcionando.',
      }
    );
    return 'local';
  },

  /** Periodic Background Sync (Chrome/Edge instalado), só no modo local. */
  async syncPeriodic(central, device) {
    const reg = await getRegistration();
    if (!reg || !('periodicSync' in reg)) return 'unsupported';
    try {
      const settings = C.mergeSettings(central.settings);
      if (!settings.notificationsEnabled || device.push || device.muted) {
        await reg.periodicSync.unregister(PERIODIC_TAG);
        return 'off';
      }
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state !== 'granted') return 'not-installed';
      await reg.periodicSync.register(PERIODIC_TAG, { minInterval: settings.frequencyHours * 3600000 });
      return 'on';
    } catch {
      return 'unsupported';
    }
  },
};
