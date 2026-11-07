/*
 * kanban.js
 * Quadro das tarefas por situação. No computador, arraste o card entre as
 * colunas; no celular, o botão › leva para a próxima coluna.
 */
import { Tasks, applyFilters } from './tasks.js';
import { esc, areaMapOf } from './ui.js';

const C = window.Core;
let H = null;
const KEY = 'ct-layout';
export const layout = {
  get: () => {
    try {
      return localStorage.getItem(KEY) === 'board' ? 'board' : 'list';
    } catch {
      return 'list';
    }
  },
  set: (v) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  },
};

const COLS = [
  { id: 'pending', name: 'Pendente' },
  { id: 'doing', name: 'Em andamento' },
  { id: 'waiting', name: 'Aguardando' },
  { id: 'done', name: 'Concluída (7 dias)' },
];
const NEXT = { pending: 'doing', doing: 'done', waiting: 'done' };
const RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

export function layoutToggle() {
  const l = layout.get();
  return `<div class="seg-toggle" role="group" aria-label="Visualização">
    <button type="button" data-layout="list" aria-pressed="${l === 'list'}">Lista</button>
    <button type="button" data-layout="board" aria-pressed="${l === 'board'}">Quadro</button></div>`;
}

export function renderKanban(filter, now, areas) {
  const areaMap = areaMapOf(areas);
  const today = C.toDateKey(now);
  const weekAgo = now.getTime() - 7 * 86400000;
  const list = applyFilters(Tasks.all(), { area: filter.area, query: filter.query, owner: filter.owner, status: 'all' }, now, areaMap);
  const col = (c) => {
    let items = list.filter((t) => t.status === c.id);
    if (c.id === 'done') items = items.filter((t) => t.completedAt && Date.parse(t.completedAt) > weekAgo).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
    else items.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || RANK[a.priority] - RANK[b.priority]);
    const card = (t) => {
      const area = areaMap[t.area] || { name: 'Sem área', color: '#8A92A3' };
      const late = t.status !== 'done' && t.dueDate && t.dueDate < today;
      const due = t.dueDate ? `<span class="kb-due${late ? ' is-late' : t.dueDate === today ? ' is-today' : ''}">${t.dueDate === today ? 'hoje' : C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>` : '';
      return `<article class="kb-card prio-${t.priority}" draggable="true" data-id="${esc(t.id)}" style="--area:${area.color}">
        <button type="button" class="kb-title" data-action="edit">${esc(t.title)}</button>
        <div class="kb-meta"><span class="kb-area"><i></i>${esc(area.name)}</span>${t.plannedFor === today && t.status !== 'done' ? '<span class="kb-sun">☀</span>' : ''}${due}${t.owner ? `<span class="kb-owner">${esc(t.owner.split(' ')[0])}</span>` : ''}
        ${NEXT[t.status] ? `<button type="button" class="kb-next" data-kb-move="${NEXT[t.status]}" title="Mover para ${COLS.find((x) => x.id === NEXT[t.status]).name}" aria-label="Mover para ${COLS.find((x) => x.id === NEXT[t.status]).name}">›</button>` : ''}</div>
      </article>`;
    };
    return `<section class="kb-col" data-kb-col="${c.id}">
      <header><strong>${c.name}</strong><span>${items.length}</span></header>
      <div class="kb-list">${items.map(card).join('') || '<p class="hint kb-empty">Arraste para cá</p>'}</div>
    </section>`;
  };
  return `<div class="kanban">${COLS.map(col).join('')}</div>`;
}

async function move(id, status) {
  const t = Tasks.get(id);
  if (!t || t.status === status) return;
  if (status === 'done') {
    await Tasks.complete(id);
    return H.toast('Concluída', { label: 'Desfazer', fn: () => Tasks.update(id, { status: t.status }) });
  }
  await Tasks.update(id, { status });
  H.toast('Movida para ' + COLS.find((c) => c.id === status).name);
}

export function initKanban(helpers) {
  H = helpers;
  let dragId = null;
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const l = e.target.closest('[data-layout]');
    if (l) {
      layout.set(l.dataset.layout);
      return H.render();
    }
    const m = e.target.closest('[data-kb-move]');
    if (m) move(m.closest('[data-id]').dataset.id, m.dataset.kbMove);
  });
  document.addEventListener('dragstart', (e) => {
    const c = e.target.closest && e.target.closest('.kb-card');
    if (!c) return;
    dragId = c.dataset.id;
    c.classList.add('is-drag');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  document.addEventListener('dragend', () => {
    dragId = null;
    document.querySelectorAll('.is-drag, .is-over').forEach((x) => x.classList.remove('is-drag', 'is-over'));
  });
  document.addEventListener('dragover', (e) => {
    const col = dragId && e.target.closest && e.target.closest('[data-kb-col]');
    if (!col) return;
    e.preventDefault();
    document.querySelectorAll('.kb-col.is-over').forEach((x) => x !== col && x.classList.remove('is-over'));
    col.classList.add('is-over');
  });
  document.addEventListener('drop', (e) => {
    const col = dragId && e.target.closest && e.target.closest('[data-kb-col]');
    if (!col) return;
    e.preventDefault();
    const id = dragId;
    dragId = null;
    move(id, col.dataset.kbCol);
  });
}
