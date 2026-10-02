/*
 * notifications.js
 *
 * Três camadas de lembrete, da mais simples para a mais completa:
 *
 * 1. Local (sempre ativo): enquanto o app estiver aberto em alguma aba ou
 *    janela (mesmo minimizada), a página verifica a cada minuto se já é hora
 *    do lembrete e mostra a notificação pelo service worker.
 *
 * 2. Periodic Background Sync (bônus, só Chrome/Edge com o app INSTALADO):
 *    o navegador acorda o service worker de tempos em tempos, mesmo com o
 *    app fechado. O navegador decide a frequência real; não é garantido.
 *
 * 3. Push real (opcional): um servidor gratuito (Supabase Edge Function +
 *    agendador) envia Web Push. Funciona com navegador e app fechados.
 *    Veja o README. Quando o push está ativo, os lembretes locais ficam
 *    desligados para não duplicar.
 */
import { Storage } from './storage.js';

const C = window.Core;
const TAG = 'central-tarefas';
const PERIODIC_TAG = 'lembretes-tarefas';

const supported = () => 'Notification' in window;

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

function pushSnapshot(tasks) {
  return tasks
    .filter((t) => t.status !== 'done')
    .map(({ id, title, area, status, priority, dueDate, dueTime, followUpDate, waitingFor }) => ({
      id, title, area, status, priority, dueDate, dueTime, followUpDate, waitingFor,
    }));
}

function pushSettings(settings) {
  return {
    enabled: settings.notificationsEnabled,
    frequencyHours: settings.frequencyHours,
    startTime: settings.startTime,
    endTime: settings.endTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
  };
}

export const Notifier = {
  supported,

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

  async show({ title, body }) {
    const options = {
      body,
      tag: TAG,
      renotify: true,
      icon: 'assets/icon-192.png',
      badge: 'assets/badge-96.png',
      data: { url: './' },
    };
    const reg = await getRegistration();
    if (reg && reg.showNotification) return reg.showNotification(title, options);
    return new Notification(title, options);
  },

  /** Verifica e dispara o lembrete local se estiver na hora. */
  async check(tasks) {
    const settings = await Storage.loadSettings();
    if (settings.push.enabled) return { skipped: 'push' };
    if (this.permission() !== 'granted') return { skipped: 'permission' };
    const now = new Date();
    if (!C.isReminderDue(settings, now)) return { skipped: 'not-due' };
    const digest = C.buildDigest(tasks, now);
    if (digest) await this.show(digest);
    await Storage.patchSettings({ lastNotifiedAt: now.toISOString() });
    return { sent: !!digest };
  },

  async sendTest(tasks) {
    const digest = C.buildDigest(tasks, new Date());
    await this.show(
      digest || {
        title: 'Tudo em dia',
        body: 'Nenhuma demanda depende de você agora. Os lembretes estão funcionando.',
      }
    );
  },

  /** Registra (ou remove) o Periodic Background Sync quando disponível. */
  async syncPeriodic(settings) {
    const reg = await getRegistration();
    if (!reg || !('periodicSync' in reg)) return 'unsupported';
    try {
      if (!settings.notificationsEnabled || settings.push.enabled) {
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

  // ---------------------------------------------------------------------------
  // Push real (servidor)
  // ---------------------------------------------------------------------------
  pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  },

  async callServer(settings, payload) {
    const { endpoint, token } = settings.push;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error || '';
      } catch {}
      throw new Error(`O servidor respondeu ${res.status}${detail ? ': ' + detail : ''}.`);
    }
    return res.json().catch(() => ({}));
  },

  async enablePush(settings, tasks) {
    const { endpoint, token, vapidPublicKey } = settings.push;
    if (!endpoint || !token || !vapidPublicKey) {
      throw new Error('Preencha a URL da função, o token e a chave pública VAPID.');
    }
    if (!this.pushSupported()) {
      throw new Error('Este navegador não suporta push. No iPhone, instale o app na Tela de Início e abra por lá.');
    }
    if ((await this.requestPermission()) !== 'granted') {
      throw new Error('Permita as notificações para ativar o push.');
    }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey.trim()),
    });
    await this.callServer(settings, {
      action: 'sync',
      subscription: sub.toJSON(),
      settings: pushSettings(settings),
      tasks: pushSnapshot(tasks),
    });
  },

  async syncPush(settings, tasks) {
    if (!settings.push.enabled || !this.pushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) throw new Error('A assinatura de push deste dispositivo não existe mais. Ative o push novamente.');
    await this.callServer(settings, {
      action: 'sync',
      subscription: sub.toJSON(),
      settings: pushSettings(settings),
      tasks: pushSnapshot(tasks),
    });
  },

  async testPush(settings) {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) throw new Error('Ative o push antes de testar.');
    await this.callServer(settings, { action: 'test', endpoint: sub.endpoint });
  },

  async disablePush(settings) {
    if (!this.pushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    try {
      if (settings.push.endpoint && settings.push.token) {
        await this.callServer(settings, { action: 'unsubscribe', endpoint: sub.endpoint });
      }
    } finally {
      await sub.unsubscribe();
    }
  },
};
