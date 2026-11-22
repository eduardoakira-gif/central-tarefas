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
      const v = localStorage.getItem(KEY);
      return v === 'board' || v === 'matrix' ? v : 'list';
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
    <button type="button" data-layout="board" aria-pressed="${l === 'board'}">Quadro</button>
    <button type="button" data-layout="matrix" aria-pressed="${l === 'matrix'}" title="Matriz urgente x importante">Matriz</button></div>`;
}

/** Matriz de Eisenhower: urgente x importante. */
export function renderMatrix(filter, now, areas) {
  const areaMap = areaMapOf(areas);
  const today = C.toDateKey(now);
  const soon = C.addDays(today, 2);
  const open = applyFilters(Tasks.all(), { area: filter.area, query: filter.query, owner: filter.owner, status: 'all' }, now, areaMap).filter((t) => t.status !== 'done');
  const urgent = (t) => t.priority === 'urgent' || t.plannedFor === today || (t.dueDate && t.dueDate <= soon) || (t.status === 'waiting' && t.followUpDate && t.followUpDate <= today);
  const important = (t) => t.priority === 'urgent' || t.priority === 'high' || !!t.project || (t.tags || []).includes('Bloqueado');
  const Q = [
    ['q1', 'Fazer agora', 'Urgente e importante', (t) => urgent(t) && important(t)],
    ['q2', 'Agendar', 'Importante, sem urgência: é aqui que se cresce', (t) => !urgent(t) && important(t)],
    ['q3', 'Delegar', 'Urgente, pouco importante', (t) => urgent(t) && !important(t)],
    ['q4', 'Depois ou cortar', 'Nem urgente nem importante', (t) => !urgent(t) && !important(t)],
  ];
  const card = (t, q) => {
    const late = t.dueDate && t.dueDate < today;
    const area = areaMap[t.area] || { name: 'Sem área', color: '#8A92A3' };
    return `<article class="mx-card" data-id="${esc(t.id)}" style="--area:${area.color}"><button type="button" class="kb-title" data-action="open">${esc(t.title)}</button>
      <div class="kb-meta"><span class="kb-area"><i></i>${esc(area.name)}</span>${t.dueDate ? `<span class="kb-due${late ? ' is-late' : ''}">${t.dueDate === today ? 'hoje' : C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>` : ''}${t.owner ? `<span class="kb-owner">${esc(t.owner.split(' ')[0])}</span>` : ''}
      ${q === 'q4' || q === 'q3' ? `<button type="button" class="kb-next" data-mx-prio="high" data-id="${esc(t.id)}" title="Marcar como importante">☆</button>` : `<button type="button" class="kb-next is-on" data-mx-prio="normal" data-id="${esc(t.id)}" title="Tirar a importância">★</button>`}</div></article>`;
  };
  return `<div class="matrix">${Q.map(([id, name, sub, fn]) => { const l = C.sortTasks(open.filter(fn), now); return `<section class="mx-q mx-${id}"><header><strong>${name}</strong><span>${l.length}</span></header><p class="hint">${sub}</p><div class="kb-list">${l.slice(0, 30).map((t) => card(t, id)).join('') || '<p class="hint kb-empty">Nada aqui</p>'}</div></section>`; }).join('')}</div>
    <p class="hint mx-help">Urgente = prazo em até 2 dias, plano de hoje ou prioridade urgente. Importante = prioridade alta ou urgente, parte de projeto ou bloqueada. ☆ marca como importante; ★ tira.</p>`;
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
    const wip = c.id === 'doing' && items.length > 5;
    return `<section class="kb-col${wip ? ' is-wip' : ''}" data-kb-col="${c.id}">
      <header><strong>${c.name}</strong><span>${items.length}${c.id === 'doing' ? ' / 5' : ''}</span></header>
      ${wip ? '<p class="kb-wip">Muita coisa ao mesmo tempo. Termine antes de começar outra: o ideal é até 5 em andamento.</p>' : ''}
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
    const mp = e.target.closest('[data-mx-prio]');
    if (mp) return Tasks.update(mp.dataset.id, { priority: mp.dataset.mxPrio });
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
