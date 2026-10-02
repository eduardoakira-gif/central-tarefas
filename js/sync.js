/*
 * sync.js
 * Mantém a central aberta sincronizada com o servidor.
 *
 * - Toda alteração é aplicada na hora na tela e no cache local, e entra numa
 *   fila. A fila é enviada ao servidor logo em seguida (ou quando a conexão voltar).
 * - A cada 30 segundos (e ao voltar para a aba) o app busca a versão do
 *   servidor, para refletir o que foi feito em outros dispositivos.
 * - Em conflito, vence a alteração mais recente de cada tarefa.
 */
import { api } from './api.js';
import { Local } from './storage.js';

const C = window.Core;
const changeListeners = new Set();
const statusListeners = new Set();
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const Sync = {
  id: null,
  central: null,
  tasks: [],
  status: 'idle', // saved | saving | offline | error
  lastError: null,
  outbox: { upserts: {}, deletes: [], centralPatch: null },
  _flushTimer: null,
  _flushing: null,
  _poll: null,

  onChange(fn) {
    changeListeners.add(fn);
    return () => changeListeners.delete(fn);
  },
  onStatus(fn) {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
  },
  emit() {
    changeListeners.forEach((fn) => fn());
  },
  setStatus(s, err = null) {
    this.status = s;
    this.lastError = err;
    statusListeners.forEach((fn) => fn(s, err));
  },

  areaIds() {
    return this.central ? this.central.areas.map((a) => a.id) : [];
  },
  hasPending() {
    const ob = this.outbox;
    return Object.keys(ob.upserts).length > 0 || ob.deletes.length > 0 || !!ob.centralPatch;
  },

  /** Abre a central: mostra o cache na hora e depois atualiza pelo servidor. */
  async open(id) {
    this.id = id;
    this.outbox = await Local.loadOutbox(id);
    const cache = await Local.loadCache(id);
    if (cache && cache.central) {
      this.central = cache.central;
      this.tasks = (cache.tasks || []).map((t) => C.normalizeTask(t, this.areaIds()));
    }
    try {
      await this.pull();
    } catch (err) {
      if (err.status === 404 || !cache) throw err;
      this.setStatus('offline', err);
    }
    return { fromCache: !!cache };
  },

  async persist() {
    await Local.saveCache(this.id, this.central, this.tasks);
    await Local.saveOutbox(this.id, this.outbox);
  },

  // ---------------------------------------------------------------------------
  // Alterações locais
  // ---------------------------------------------------------------------------
  async upsertTask(task) {
    const i = this.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) this.tasks[i] = task;
    else this.tasks.push(task);
    this.outbox.upserts[task.id] = task;
    this.outbox.deletes = this.outbox.deletes.filter((x) => x !== task.id);
    await this.persist();
    this.emit();
    this.scheduleFlush();
  },

  async deleteTask(id) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    delete this.outbox.upserts[id];
    if (!this.outbox.deletes.includes(id)) this.outbox.deletes.push(id);
    await this.persist();
    this.emit();
    this.scheduleFlush();
  },

  /** Altera nome, áreas ou configurações de notificação da central. */
  async patchCentral(patch) {
    this.central = Object.assign({}, this.central, patch);
    this.outbox.centralPatch = Object.assign({}, this.outbox.centralPatch || {}, patch);
    await this.persist();
    this.emit();
    this.scheduleFlush(0);
  },

  /** Substitui todas as tarefas (importação). Precisa de conexão. */
  async replaceTasks(list) {
    await this.flush();
    await api('replaceTasks', { centralId: this.id, tasks: list });
    this.outbox.upserts = {};
    this.outbox.deletes = [];
    this.tasks = list.slice().sort(byId);
    await this.persist();
    this.emit();
  },

  // ---------------------------------------------------------------------------
  // Envio e recebimento
  // ---------------------------------------------------------------------------
  scheduleFlush(delay = 400) {
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.flush().catch(() => {}), delay);
  },

  flush() {
    if (this._flushing) return this._flushing;
    this._flushing = (async () => {
      const ob = this.outbox;
      const patch = ob.centralPatch;
      const ups = Object.values(ob.upserts);
      const dels = ob.deletes.slice();
      if (!patch && !ups.length && !dels.length) {
        this.setStatus('saved');
        return;
      }
      this.setStatus('saving');
      try {
        if (patch) {
          await api('updateCentral', { centralId: this.id, patch });
          if (ob.centralPatch === patch) ob.centralPatch = null;
        }
        if (ups.length || dels.length) {
          await api('sync', { centralId: this.id, upserts: ups, deletes: dels });
          for (const t of ups) {
            const cur = ob.upserts[t.id];
            if (cur && cur.updatedAt === t.updatedAt) delete ob.upserts[t.id];
          }
          ob.deletes = ob.deletes.filter((x) => !dels.includes(x));
        }
        await Local.saveOutbox(this.id, ob);
        if (this.hasPending()) this.scheduleFlush(50);
        else this.setStatus('saved');
      } catch (err) {
        this.setStatus(err.status === 0 ? 'offline' : 'error', err);
        clearTimeout(this._flushTimer);
        this._flushTimer = setTimeout(() => this.flush().catch(() => {}), 15000);
        throw err;
      }
    })().finally(() => {
      this._flushing = null;
    });
    return this._flushing;
  },

  /** Busca a versão do servidor (sem perder alterações ainda não enviadas). */
  async pull() {
    if (this.hasPending()) {
      try {
        await this.flush();
      } catch {}
      if (this.hasPending()) return;
    }
    const r = await api('get', { centralId: this.id });
    if (this.hasPending()) return; // algo mudou aqui durante a busca; fica para a próxima
    const central = r.central;
    const ids = central.areas.map((a) => a.id);
    const tasks = (r.tasks || []).map((t) => C.normalizeTask(t, ids)).sort(byId);
    const before = JSON.stringify([this.central, this.tasks.slice().sort(byId)]);
    this.central = central;
    this.tasks = tasks;
    await Local.saveCache(this.id, central, tasks);
    this.setStatus('saved');
    if (before !== JSON.stringify([central, tasks])) this.emit();
  },

  startPolling() {
    clearInterval(this._poll);
    const tick = () => {
      if (!document.hidden) this.pull().catch((err) => this.setStatus(err.status === 0 ? 'offline' : 'error', err));
    };
    this._poll = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => !document.hidden && tick());
    window.addEventListener('online', tick);
  },
};
