/*
 * storage.js
 * Armazenamento local do dispositivo:
 * - cópia (cache) da central e das tarefas, para abrir rápido e funcionar offline;
 * - fila de alterações ainda não enviadas ao servidor;
 * - preferências deste dispositivo (tema, centrais recentes, lembretes locais);
 * - backup (exportar/importar) e tarefas da versão anterior.
 */
const C = window.Core;

const kv = {
  get: (k) => C.idb.get('kv', k),
  set: (k, v) => C.idb.put('kv', v, k),
};

export const Local = {
  loadCache: (id) => kv.get('central:' + id),
  saveCache: (id, central, tasks, notes) => kv.set('central:' + id, { central, tasks, notes, savedAt: new Date().toISOString() }),

  async loadOutbox(id) {
    const ob = (await kv.get('outbox:' + id)) || {};
    const coll = (c) => Object.assign({ upserts: {}, deletes: [] }, c || {});
    // a v2 guardava só tarefas, direto na raiz
    const legacyTasks = ob.upserts ? { upserts: ob.upserts, deletes: ob.deletes || [] } : null;
    return { tasks: coll(ob.tasks || legacyTasks), notes: coll(ob.notes), centralPatch: ob.centralPatch || null };
  },
  saveOutbox: (id, ob) => kv.set('outbox:' + id, ob),

  async loadDevice(id) {
    const d = await kv.get('device:' + id);
    return Object.assign({ lastNotifiedAt: null, lastSummaryOn: null, push: false, muted: false, lastArea: null, pin: null }, d || {});
  },
  async patchDevice(id, patch) {
    const next = Object.assign(await this.loadDevice(id), patch);
    await kv.set('device:' + id, next);
    return next;
  },

  setLastCentral: (id) => kv.set('lastCentralId', id),

  /** Tarefas salvas pela versão 1 (antes das centrais com link). */
  async legacyTasks() {
    try {
      return ((await C.idb.getAll('tasks')) || []).filter((t) => t && String(t.title || '').trim());
    } catch {
      return [];
    }
  },
};

// -----------------------------------------------------------------------------
// Preferências deste navegador (localStorage)
// -----------------------------------------------------------------------------
const ls = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export const Prefs = {
  theme: () => {
    try {
      return localStorage.getItem('ct-theme') || 'auto';
    } catch {
      return 'auto';
    }
  },
  setTheme: (t) => {
    try {
      localStorage.setItem('ct-theme', t);
    } catch {}
  },
  recent: () => ls.get('ct-recent', []),
  addRecent(id, name) {
    const list = this.recent().filter((r) => r.id !== id);
    list.unshift({ id, name, openedAt: new Date().toISOString() });
    ls.set('ct-recent', list.slice(0, 12));
  },
  removeRecent(id) {
    ls.set('ct-recent', this.recent().filter((r) => r.id !== id));
  },
  lastCentral: () => ls.get('ct-last', null),
  setLastCentral: (id) => ls.set('ct-last', id),
  legacyImported: () => ls.get('ct-legacy-imported', false),
  setLegacyImported: () => ls.set('ct-legacy-imported', true),
};

// -----------------------------------------------------------------------------
// Áreas: junta as áreas de um backup/versão antiga com as da central
// -----------------------------------------------------------------------------
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function mergeAreas(centralAreas, incoming) {
  const areas = centralAreas.map((a) => Object.assign({}, a));
  const map = {};
  for (const a of incoming) {
    let match = areas.find((x) => x.id === a.id) || areas.find((x) => fold(x.name) === fold(a.name));
    if (!match && areas.length < 20) {
      const used = new Set(areas.map((x) => x.color));
      match = { id: C.newAreaId(), name: String(a.name).slice(0, 40), color: a.color && !used.has(a.color) ? a.color : C.nextAreaColor(areas) };
      areas.push(match);
    }
    map[a.id] = match ? match.id : areas[0].id;
  }
  return { areas, map };
}

/** Converte tarefas de outra origem para as áreas desta central. */
export function remapTasks(tasks, map, areaIds) {
  return tasks.map((t) => C.normalizeTask(Object.assign({}, t, { area: map[t.area] || t.area }), areaIds));
}

// -----------------------------------------------------------------------------
// Backup
// -----------------------------------------------------------------------------
export const BACKUP_VERSION = 3;

export function createBackup(central, tasks, notes) {
  return {
    app: 'central-de-tarefas',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    central: { name: central.name, areas: central.areas, people: central.people || [], settings: central.settings },
    statuses: C.STATUSES,
    priorities: C.PRIORITIES.map(({ id, name }) => ({ id, name })),
    tasks,
    notes: notes || [],
  };
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!data || !Array.isArray(data.tasks)) throw new Error('Arquivo inválido: a lista de tarefas não foi encontrada.');
  const tasks = data.tasks.filter((t) => t && typeof t === 'object' && String(t.title || '').trim());
  const notes = Array.isArray(data.notes) ? data.notes.filter((n) => n && typeof n === 'object').map(C.normalizeNote) : null;
  const people = data.central && Array.isArray(data.central.people) ? data.central.people.filter((p) => p && p.id && p.name) : null;
  // v2 guarda as áreas em central.areas; v1 em areas (ou as fixas da versão 1)
  const areas = (data.central && Array.isArray(data.central.areas) && data.central.areas) ||
    (Array.isArray(data.areas) && data.areas) || C.LEGACY_AREAS;
  const src = (data.central && data.central.settings) || data.settings || {};
  const settings = {};
  if (typeof src.notificationsEnabled === 'boolean') settings.notificationsEnabled = src.notificationsEnabled;
  if ([1, 2, 3, 4, 6].includes(Number(src.frequencyHours))) settings.frequencyHours = Number(src.frequencyHours);
  if (/^\d{2}:\d{2}$/.test(src.startTime || '')) settings.startTime = src.startTime;
  if (/^\d{2}:\d{2}$/.test(src.endTime || '')) settings.endTime = src.endTime;
  if (typeof src.dailySummary === 'boolean') settings.dailySummary = src.dailySummary;
  if (/^\d{2}:\d{2}$/.test(src.dailySummaryTime || '')) settings.dailySummaryTime = src.dailySummaryTime;
  return { tasks, notes, people, areas: areas.filter((a) => a && a.id && a.name), settings };
}
