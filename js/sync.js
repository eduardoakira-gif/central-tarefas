/*
 * sync.js
 * Mantém a central aberta sincronizada com o servidor (tarefas e notas).
 *
 * - Toda alteração é aplicada na hora na tela e no cache local e entra numa
 *   fila, enviada ao servidor logo em seguida (ou quando a conexão voltar).
 * - A cada 30 segundos (e ao voltar para a aba) busca a versão do servidor,
 *   para refletir o que foi feito em outros dispositivos.
 * - Em conflito, vence a alteração mais recente de cada item.
 */
import { api } from './api.js';
import { Local } from './storage.js';

const C = window.Core;
const COLLECTIONS = ['tasks', 'notes'];
const changeListeners = new Set();
const statusListeners = new Set();
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const Sync = {
  id: null,
  pin: null,
  central: null,
  tasks: [],
  notes: [],
  status: 'idle', // saved | saving | offline | error
  lastError: null,
  outbox: null,
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

  /** Chamada ao servidor já com o código da central e o PIN. */
  call(action, payload = {}, opts) {
    return api(action, Object.assign({ centralId: this.id, pin: this.pin || undefined }, payload), opts);
  },

  areaIds() {
    return this.central ? this.central.areas.map((a) => a.id) : [];
  },
  hasPending() {
    const ob = this.outbox;
    return !!ob.centralPatch || COLLECTIONS.some((c) => Object.keys(ob[c].upserts).length > 0 || ob[c].deletes.length > 0);
  },

  normalize(coll, item) {
    return coll === 'tasks' ? C.normalizeTask(item, this.areaIds()) : C.normalizeNote(item);
  },

  /** Abre a central: mostra o cache na hora e depois atualiza pelo servidor. */
  async open(id) {
    this.id = id;
    this.outbox = await Local.loadOutbox(id);
    this.pin = (await Local.loadDevice(id)).pin;
    const cache = await Local.loadCache(id);
    if (cache && cache.central) {
      this.central = cache.central;
      this.tasks = (cache.tasks || []).map((t) => this.normalize('tasks', t));
      this.notes = (cache.notes || []).map((n) => this.normalize('notes', n));
    }
    try {
      await this.pull();
    } catch (err) {
      if (err.status === 404 || err.status === 401 || !cache) throw err;
      this.setStatus('offline', err);
    }
    return { fromCache: !!cache };
  },

  async setPin(pin) {
    this.pin = pin || null;
    await Local.patchDevice(this.id, { pin: this.pin });
  },

  async persist() {
    await Local.saveCache(this.id, this.central, this.tasks, this.notes);
    await Local.saveOutbox(this.id, this.outbox);
  },

  // ---------------------------------------------------------------------------
  // Alterações locais
  // ---------------------------------------------------------------------------
  async upsert(coll, item) {
    const list = this[coll];
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item;
    else list.push(item);
    const ob = this.outbox[coll];
    ob.upserts[item.id] = item;
    ob.deletes = ob.deletes.filter((x) => x !== item.id);
    await this.persist();
    this.emit();
    this.scheduleFlush();
  },

  async remove(coll, id) {
    this[coll] = this[coll].filter((x) => x.id !== id);
    const ob = this.outbox[coll];
    delete ob.upserts[id];
    if (!ob.deletes.includes(id)) ob.deletes.push(id);
    await this.persist();
    this.emit();
    this.scheduleFlush();
  },

  upsertTask(t) {
    return this.upsert('tasks', t);
  },
  deleteTask(id) {
    return this.remove('tasks', id);
  },

  /** Altera nome, áreas, pessoas ou configurações da central. */
  async patchCentral(patch) {
    this.central = Object.assign({}, this.central, patch);
    this.outbox.centralPatch = Object.assign({}, this.outbox.centralPatch || {}, patch);
    await this.persist();
    this.emit();
    this.scheduleFlush(0);
  },

  /** Substitui tarefas e notas (importação). Precisa de conexão. */
  async replaceData({ tasks, notes }) {
    await this.flush();
    const payload = { tasks };
    if (notes) payload.notes = notes;
    await this.call('replaceData', payload);
    this.outbox.tasks = { upserts: {}, deletes: [] };
    if (notes) this.outbox.notes = { upserts: {}, deletes: [] };
    this.tasks = tasks.slice().sort(byId);
    if (notes) this.notes = notes.slice().sort(byId);
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
      const sent = {};
      let any = false;
      for (const c of COLLECTIONS) {
        sent[c] = { upserts: Object.values(ob[c].upserts), deletes: ob[c].deletes.slice() };
        if (sent[c].upserts.length || sent[c].deletes.length) any = true;
      }
      if (!patch && !any) {
        this.setStatus('saved');
        return;
      }
      this.setStatus('saving');
      try {
        if (patch) {
          await this.call('updateCentral', { patch });
          if (ob.centralPatch === patch) ob.centralPatch = null;
        }
        if (any) {
          await this.call('sync', { changes: sent });
          for (const c of COLLECTIONS) {
            for (const item of sent[c].upserts) {
              const cur = ob[c].upserts[item.id];
              if (cur && cur.updatedAt === item.updatedAt) delete ob[c].upserts[item.id];
            }
            ob[c].deletes = ob[c].deletes.filter((x) => !sent[c].deletes.includes(x));
          }
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
    const r = await this.call('get');
    if (this.hasPending()) return; // algo mudou aqui durante a busca; fica para a próxima
    const central = r.central;
    const ids = central.areas.map((a) => a.id);
    const tasks = (r.tasks || []).map((t) => C.normalizeTask(t, ids)).sort(byId);
    const notes = (r.notes || []).map((n) => C.normalizeNote(n)).sort(byId);
    const before = JSON.stringify([this.central, this.tasks.slice().sort(byId), this.notes.slice().sort(byId)]);
    this.central = central;
    this.tasks = tasks;
    this.notes = notes;
    await Local.saveCache(this.id, central, tasks, notes);
    this.setStatus('saved');
    if (before !== JSON.stringify([central, tasks, notes])) this.emit();
  },

  startPolling(onAuthError) {
    clearInterval(this._poll);
    const tick = () => {
      if (document.hidden) return;
      this.pull().catch((err) => {
        if ((err.status === 401 || err.status === 404) && onAuthError) return onAuthError(err);
        this.setStatus(err.status === 0 ? 'offline' : 'error', err);
      });
    };
    this._poll = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => !document.hidden && tick());
    window.addEventListener('online', tick);
  },
};
