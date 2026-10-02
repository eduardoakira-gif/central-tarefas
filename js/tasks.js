/*
 * tasks.js
 * Operações com as tarefas da central aberta. Os dados ficam no Sync,
 * que cuida de salvar localmente e enviar ao servidor.
 */
import { Sync } from './sync.js';

const C = window.Core;
const nowIso = () => new Date().toISOString();

function applyStatus(task, next) {
  const prev = task.status;
  if (!C.STATUS_MAP[next] || next === prev) return;
  if (next === 'done') {
    task.completedAt = nowIso();
    task.prevStatus = prev;
  }
  if (prev === 'done') task.completedAt = null;
  if (next === 'waiting' && !task.waitingSince) task.waitingSince = C.toDateKey(new Date());
  task.status = next;
}

export const Tasks = {
  all: () => Sync.tasks,
  get: (id) => Sync.tasks.find((t) => t.id === id) || null,
  subscribe: (fn) => Sync.onChange(fn),

  async create(data) {
    const { status, ...rest } = data;
    const t = C.normalizeTask(
      Object.assign({}, rest, { id: C.uid(), createdAt: nowIso(), updatedAt: nowIso(), status: 'pending' }),
      Sync.areaIds()
    );
    applyStatus(t, status || 'pending');
    await Sync.upsertTask(t);
    return t;
  },

  async update(id, patch) {
    const cur = this.get(id);
    if (!cur) return null;
    const t = Object.assign({}, cur);
    const { status, ...rest } = patch;
    Object.assign(t, rest);
    if (status) applyStatus(t, status);
    Object.assign(t, C.normalizeTask(t, Sync.areaIds()), { updatedAt: nowIso() });
    await Sync.upsertTask(t);
    return t;
  },

  complete(id) {
    return this.update(id, { status: 'done' });
  },

  restore(id) {
    const t = this.get(id);
    if (!t) return null;
    const back = t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'pending';
    return this.update(id, { status: back });
  },

  async remove(id) {
    const t = this.get(id);
    if (!t) return null;
    await Sync.deleteTask(id);
    return t;
  },

  /** Reinsere uma tarefa excluída (usado no "Desfazer"). */
  async put(task) {
    await Sync.upsertTask(C.normalizeTask(Object.assign({}, task, { updatedAt: nowIso() }), Sync.areaIds()));
  },

  async replaceAll(list) {
    await Sync.replaceTasks(list.map((t) => C.normalizeTask(t, Sync.areaIds())));
  },
};

// -----------------------------------------------------------------------------
// Filtros
// -----------------------------------------------------------------------------
export const STATUS_FILTERS = [
  { id: 'all', name: 'Todas' },
  { id: 'today', name: 'Hoje' },
  { id: 'overdue', name: 'Atrasadas' },
  { id: 'pending', name: 'Pendentes' },
  { id: 'doing', name: 'Em andamento' },
  { id: 'waiting', name: 'Aguardando retorno' },
  { id: 'urgent', name: 'Urgentes' },
  { id: 'done', name: 'Concluídas' },
];

export function matchesStatusFilter(t, filter, now) {
  const open = t.status !== 'done';
  switch (filter) {
    case 'all': return true;
    case 'today': return open && !!C.classify(t, now).today;
    case 'overdue': return open && !!C.classify(t, now).overdue;
    case 'pending':
    case 'doing':
    case 'waiting': return t.status === filter;
    case 'urgent': return open && t.priority === 'urgent';
    case 'done': return t.status === 'done';
    default: return true;
  }
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function matchesSearch(t, query, areaMap) {
  const q = fold(query).trim();
  if (!q) return true;
  const area = areaMap && areaMap[t.area];
  const hay = fold([t.title, t.description, area && area.name, t.owner, t.waitingFor, t.notes, t.link].join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function applyFilters(list, { status = 'all', area = null, query = '' }, now, areaMap) {
  return list.filter(
    (t) => (!area || t.area === area) && matchesStatusFilter(t, status, now) && matchesSearch(t, query, areaMap)
  );
}

// -----------------------------------------------------------------------------
// Indicadores
// -----------------------------------------------------------------------------
export function computeStats(list, now, areas) {
  const today = C.toDateKey(now);
  const s = {
    open: 0, pending: 0, doing: 0, waiting: 0, overdue: 0, today: 0, urgent: 0,
    done: 0, doneToday: 0, dayTotal: 0, byArea: {}, byFilter: {},
  };
  areas.forEach((a) => (s.byArea[a.id] = 0));
  for (const t of list) {
    if (t.status === 'done') {
      s.done++;
      if (t.completedAt && C.toDateKey(new Date(t.completedAt)) === today) s.doneToday++;
      continue;
    }
    const c = C.classify(t, now);
    s.open++;
    s.byArea[t.area] = (s.byArea[t.area] || 0) + 1;
    if (t.status === 'pending') s.pending++;
    if (t.status === 'doing') s.doing++;
    if (t.status === 'waiting') s.waiting++;
    if (t.priority === 'urgent') s.urgent++;
    if (c.overdue) s.overdue++;
    if (c.today) s.today++;
    if (c.today || c.overdue) s.dayTotal++;
  }
  s.dayTotal += s.doneToday;
  s.dayPct = s.dayTotal ? Math.round((s.doneToday / s.dayTotal) * 100) : 0;
  STATUS_FILTERS.forEach((f) => {
    s.byFilter[f.id] = f.id === 'all' ? s.open : list.filter((t) => matchesStatusFilter(t, f.id, now)).length;
  });
  return s;
}
