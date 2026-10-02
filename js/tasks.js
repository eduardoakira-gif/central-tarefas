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

const TRASH_DAYS = 30;

export const Tasks = {
  /** Tarefas visíveis (fora da lixeira). */
  all: () => Sync.tasks.filter((t) => !t.deletedAt),
  trash: () => Sync.tasks.filter((t) => t.deletedAt),
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

  /** Conclui. Se for recorrente, cria a próxima ocorrência e a devolve. */
  async complete(id) {
    const t = await this.update(id, { status: 'done' });
    if (!t || !t.recurrence) return { task: t, next: null };
    const next = await this.create({
      title: t.title,
      description: t.description,
      area: t.area,
      priority: t.priority,
      status: 'pending',
      dueDate: C.nextRecurrenceDate(t.dueDate, t.recurrence),
      dueTime: t.dueTime,
      owner: t.owner,
      link: t.link,
      notes: t.notes,
      recurrence: t.recurrence,
      checklist: t.checklist.map((c) => ({ text: c.text, done: false })),
    });
    // a ocorrência concluída não repete mais (a nova assume a recorrência)
    await this.update(id, { recurrence: null });
    return { task: t, next };
  },

  restore(id) {
    const t = this.get(id);
    if (!t) return null;
    const back = t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'pending';
    return this.update(id, { status: back });
  },

  /** Envia para a lixeira (pode ser restaurada por 30 dias). */
  remove(id) {
    return this.update(id, { deletedAt: nowIso() });
  },
  restoreFromTrash(id) {
    return this.update(id, { deletedAt: null });
  },
  /** Exclui de vez. */
  async purge(id) {
    await Sync.deleteTask(id);
  },
  async emptyTrash() {
    for (const t of this.trash()) await Sync.deleteTask(t.id);
  },
  /** Apaga de vez o que está na lixeira há mais de 30 dias. */
  async autoPurge() {
    const limit = Date.now() - TRASH_DAYS * 86400000;
    for (const t of this.trash()) if (Date.parse(t.deletedAt) < limit) await Sync.deleteTask(t.id);
  },

  async toggleChecklist(id, itemId) {
    const t = this.get(id);
    if (!t) return null;
    const checklist = t.checklist.map((c) => (c.id === itemId ? Object.assign({}, c, { done: !c.done }) : c));
    return this.update(id, { checklist });
  },

  async addComment(id, text) {
    const t = this.get(id);
    if (!t || !text.trim()) return null;
    return this.update(id, { comments: t.comments.concat({ id: C.uid(), text: text.trim(), at: nowIso() }) });
  },

  async removeComment(id, commentId) {
    const t = this.get(id);
    if (!t) return null;
    return this.update(id, { comments: t.comments.filter((c) => c.id !== commentId) });
  },

  async replaceAll(list, notes) {
    await Sync.replaceData({
      tasks: list.map((t) => C.normalizeTask(t, Sync.areaIds())),
      notes: notes ? notes.map(C.normalizeNote) : null,
    });
  },

  /** Nomes de responsáveis conhecidos (equipe cadastrada + usados em tarefas). */
  owners() {
    const names = new Map();
    ((Sync.central && Sync.central.people) || []).forEach((p) => names.set(p.name.toLowerCase(), p.name));
    Sync.tasks.forEach((t) => t.owner && !names.has(t.owner.toLowerCase()) && names.set(t.owner.toLowerCase(), t.owner));
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
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
  const hay = fold([
    t.title, t.description, area && area.name, t.owner, t.waitingFor, t.notes, t.link,
    ...(t.checklist || []).map((c) => c.text), ...(t.comments || []).map((c) => c.text),
  ].join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function applyFilters(list, { status = 'all', area = null, query = '', owner = '' }, now, areaMap) {
  const o = owner ? owner.toLowerCase() : '';
  return list.filter(
    (t) =>
      (!area || t.area === area) &&
      (!o || (t.owner || '').toLowerCase() === o) &&
      matchesStatusFilter(t, status, now) &&
      matchesSearch(t, query, areaMap)
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
