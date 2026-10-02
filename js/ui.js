/*
 * ui.js
 * Funções que geram HTML a partir do estado. Não guardam estado nem gravam
 * dados; os eventos são tratados em app.js por delegação.
 */
import { STATUS_FILTERS, applyFilters, computeStats } from './tasks.js';

const C = window.Core;
const pad = C.pad;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icons = {
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  wait: svg('<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  restore: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  flag: svg('<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>'),
};

// -----------------------------------------------------------------------------
// Datas
// -----------------------------------------------------------------------------
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function shortDate(key) {
  const d = C.fromDateKey(key);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
}

export function relativeDay(key, now) {
  const today = C.toDateKey(now);
  if (key === today) return 'Hoje';
  if (key === C.addDays(today, 1)) return 'Amanhã';
  if (key === C.addDays(today, -1)) return 'Ontem';
  const d = C.fromDateKey(key);
  const diff = Math.round((d - C.fromDateKey(today)) / 86400000);
  const wd = WEEKDAYS[d.getDay()];
  const label = wd.charAt(0).toUpperCase() + wd.slice(1) + ', ' + shortDate(key);
  if (diff > 1 && diff < 7) return label;
  return d.getFullYear() !== now.getFullYear() ? shortDate(key) + '/' + d.getFullYear() : label;
}

export function dueLabel(t, now) {
  if (!t.dueDate) return 'Sem prazo';
  return relativeDay(t.dueDate, now) + (t.dueTime ? ' • ' + t.dueTime : '');
}

export function dateTimeLabel(iso) {
  const d = new Date(iso);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

const safeHref = (link) => {
  const l = String(link || '').trim();
  if (!l) return '';
  if (/^https?:\/\//i.test(l)) return l;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(l)) return 'https://' + l;
  return '';
};

// -----------------------------------------------------------------------------
// Card de tarefa
// -----------------------------------------------------------------------------
const options = (list, current) =>
  list.map((o) => `<option value="${o.id}"${o.id === current ? ' selected' : ''}>${esc(o.name)}</option>`).join('');

export function taskCard(t, now) {
  const c = C.classify(t, now);
  const area = C.AREA_MAP[t.area];
  const done = t.status === 'done';
  const cls = ['task', 'prio-' + t.priority];
  if (done) cls.push('is-done');
  if (c.overdue) cls.push('is-overdue');
  if (c.followUpDue) cls.push('is-followup');

  const badges = [];
  if (!done && t.priority === 'urgent') badges.push('<span class="badge badge-urgent">Urgente</span>');
  if (!done && t.priority === 'high') badges.push('<span class="badge badge-high">Alta</span>');
  if (c.followUpDue) badges.push(`<span class="badge badge-follow">${c.overdue ? 'Cobrança atrasada' : 'Cobrar retorno hoje'}</span>`);
  else if (c.overdue) badges.push('<span class="badge badge-overdue">Atrasada</span>');

  const meta = [];
  meta.push(
    `<label class="pill pill-select status-${t.status}" title="Alterar status"><i class="dot"></i>` +
      `<select data-quick="status" aria-label="Status">${options(C.STATUSES, t.status)}</select></label>`
  );
  meta.push(
    `<label class="pill pill-select prio-pill prio-pill-${t.priority}" title="Alterar prioridade">${icons.flag}` +
      `<select data-quick="priority" aria-label="Prioridade">${options(C.PRIORITIES, t.priority)}</select></label>`
  );
  meta.push(
    `<span class="pill pill-date${c.overdue && !c.followUpDue ? ' is-late' : ''}" title="Alterar prazo">${icons.calendar}` +
      `<span>${esc(dueLabel(t, now))}</span>` +
      `<input type="date" data-quick="dueDate" value="${t.dueDate || ''}" aria-label="Alterar prazo"></span>`
  );
  if (t.owner) meta.push(`<span class="meta-item">${icons.user}${esc(t.owner)}</span>`);
  const href = safeHref(t.link);
  if (href) meta.push(`<a class="meta-item meta-link" href="${esc(href)}" target="_blank" rel="noopener">${icons.link}Link</a>`);

  let waitLine = '';
  if (t.status === 'waiting') {
    const parts = ['Aguardando ' + (t.waitingFor ? `<strong>${esc(t.waitingFor)}</strong>` : 'retorno')];
    if (t.waitingSince) parts.push('desde ' + shortDate(t.waitingSince));
    let line = parts.join(' ') + '.';
    if (t.followUpDate) line += ' Cobrar novamente em ' + shortDate(t.followUpDate) + '.';
    waitLine = `<p class="task-wait">${icons.wait}<span>${line}</span></p>`;
  }

  const doneLine = done && t.completedAt ? `<p class="task-done-at">Concluída em ${dateTimeLabel(t.completedAt)}</p>` : '';
  const desc = t.description ? `<p class="task-desc">${esc(t.description.length > 180 ? t.description.slice(0, 180) + '…' : t.description)}</p>` : '';

  const btn = (action, icon, label, extra = '') =>
    `<button type="button" class="act ${extra}" data-action="${action}" title="${label}" aria-label="${label}">${icon}<span>${label}</span></button>`;

  const actions = done
    ? btn('restore', icons.restore, 'Restaurar') + btn('edit', icons.edit, 'Editar') + btn('purge', icons.trash, 'Excluir definitivamente', 'act-danger')
    : btn('complete', icons.check, 'Concluir', 'act-complete') +
      btn('edit', icons.edit, 'Editar') +
      btn('wait', icons.wait, 'Aguardando retorno') +
      btn('delete', icons.trash, 'Excluir', 'act-danger');

  return `<article class="${cls.join(' ')}" data-id="${esc(t.id)}">
    <div class="task-main">
      <div class="task-top">
        <span class="area-tag" style="--area:${area.color}"><i></i>${esc(area.name)}</span>
        ${badges.join('')}
      </div>
      <h3 class="task-title"><button type="button" data-action="edit">${esc(t.title)}</button></h3>
      ${desc}
      ${waitLine}
      ${doneLine}
      <div class="task-meta">${meta.join('')}</div>
    </div>
    <div class="task-actions">${actions}</div>
  </article>`;
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function renderSummary(stats) {
  if (!stats.open) return 'Nenhuma tarefa aberta no momento.';
  return (
    plural(stats.open, 'tarefa aberta', 'tarefas abertas') + ', ' +
    stats.today + ' para hoje, ' +
    plural(stats.overdue, 'atrasada', 'atrasadas') + ' e ' +
    stats.waiting + ' aguardando retorno.'
  );
}

export function renderProgress(stats) {
  const empty = stats.dayTotal === 0;
  return `
    <div class="progress-head">
      <span class="progress-title">Hoje</span>
      <span class="progress-pct">${empty ? '–' : stats.dayPct + '%'}</span>
    </div>
    <p class="progress-nums">${
      empty
        ? 'Nada programado para hoje.'
        : `<strong>${stats.doneToday}</strong> de ${plural(stats.dayTotal, 'tarefa concluída', 'tarefas concluídas')}`
    }</p>
    <div class="bar" role="progressbar" aria-label="Progresso do dia" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stats.dayPct}">
      <span style="width:${stats.dayPct}%"></span>
    </div>`;
}

export function renderStats(stats, activeStatus) {
  const cards = [
    { id: 'pending', label: 'Pendentes', n: stats.pending },
    { id: 'doing', label: 'Em andamento', n: stats.doing },
    { id: 'waiting', label: 'Aguardando retorno', n: stats.waiting },
    { id: 'overdue', label: 'Atrasadas', n: stats.overdue, alert: stats.overdue > 0 },
    { id: 'done', label: 'Concluídas', n: stats.done, sub: stats.doneToday ? `${stats.doneToday} hoje` : '' },
  ];
  return cards
    .map(
      (c) => `<button type="button" class="stat stat-${c.id}${c.alert ? ' is-alert' : ''}" data-filter-status="${c.id}" aria-pressed="${activeStatus === c.id}">
        <span class="stat-label">${c.label}</span>
        <span class="stat-num">${c.n}</span>
        ${c.sub ? `<span class="stat-sub">${c.sub}</span>` : ''}
      </button>`
    )
    .join('');
}

export function renderAreas(stats, activeArea) {
  return C.AREAS.map(
    (a) => `<button type="button" class="area-btn" data-filter-area="${a.id}" style="--area:${a.color}" aria-pressed="${activeArea === a.id}">
      <span class="area-name"><i></i>${esc(a.name)}</span>
      <span class="area-count">${plural(stats.byArea[a.id] || 0, 'aberta', 'abertas')}</span>
    </button>`
  ).join('');
}

export function renderStatusChips(stats, active) {
  return STATUS_FILTERS.map(
    (f) => `<button type="button" class="chip" data-filter-status="${f.id}" aria-pressed="${active === f.id}">
      ${f.name}<span class="chip-count">${stats.byFilter[f.id]}</span></button>`
  ).join('');
}

export function renderFilterBar(filter) {
  const parts = [];
  if (filter.area) parts.push(C.AREA_MAP[filter.area].name);
  if (filter.status !== 'all') parts.push(STATUS_FILTERS.find((f) => f.id === filter.status).name);
  if (filter.query.trim()) parts.push(`“${esc(filter.query.trim())}”`);
  if (!parts.length) return '';
  return `<span>Filtrando por <strong>${parts.map((p) => (p.startsWith('“') ? p : esc(p))).join(' + ')}</strong></span>
    <button type="button" class="link-btn" data-action="clear-filters">Limpar filtros</button>`;
}

const SECTIONS = [
  { id: 'overdue', name: 'Atrasadas' },
  { id: 'today', name: 'Hoje' },
  { id: 'upcoming', name: 'Próximas' },
  { id: 'waiting', name: 'Aguardando retorno' },
  { id: 'nodate', name: 'Sem prazo' },
];

function section(id, name, list, now, extra = '') {
  if (!list.length) return '';
  return `<section class="group group-${id}">
    <h2 class="group-title">${name}<span class="group-count">${list.length}</span>${extra}</h2>
    <div class="group-list">${list.map((t) => taskCard(t, now)).join('')}</div>
  </section>`;
}

function emptyAllDone() {
  return `<div class="empty">
    <div class="empty-mark">${icons.check}</div>
    <p class="empty-title">Nenhuma tarefa pendente.</p>
    <p class="empty-text">Tudo em dia por aqui.</p>
    <button type="button" class="btn btn-primary" data-action="new">${icons.plus}Nova tarefa</button>
  </div>`;
}

function emptyFiltered() {
  return `<div class="empty">
    <p class="empty-title">Nenhuma tarefa encontrada com esses filtros.</p>
    <button type="button" class="btn" data-action="clear-filters">Limpar filtros</button>
  </div>`;
}

export function renderTaskList(all, filter, now) {
  const hasFilter = filter.area || filter.status !== 'all' || filter.query.trim();

  if (filter.status !== 'all') {
    const list = applyFilters(all, filter, now);
    if (!list.length) return emptyFiltered();
    const sorted =
      filter.status === 'done'
        ? list.slice().sort((a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0))
        : C.sortTasks(list, now);
    const name = STATUS_FILTERS.find((f) => f.id === filter.status).name;
    return section('flat', name, sorted, now);
  }

  const base = applyFilters(all, { area: filter.area, query: filter.query, status: 'all' }, now);
  const open = base.filter((t) => t.status !== 'done');
  const groups = Object.fromEntries(SECTIONS.map((s) => [s.id, []]));
  open.forEach((t) => groups[C.classify(t, now).section].push(t));

  let html = '';
  if (!open.length) {
    html += hasFilter ? emptyFiltered() : emptyAllDone();
  } else {
    for (const s of SECTIONS) {
      let list = groups[s.id];
      if (s.id === 'waiting') {
        list = list.slice().sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));
      } else {
        list = C.sortTasks(list, now);
      }
      html += section(s.id, s.name, list, now);
    }
  }

  const weekAgo = now.getTime() - 7 * 86400000;
  const recent = base
    .filter((t) => t.status === 'done' && Date.parse(t.completedAt || 0) >= weekAgo)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, 5);
  html += section(
    'recent', 'Concluídas recentemente', recent, now,
    '<a class="group-link" href="#/historico">Ver histórico</a>'
  );
  return html;
}

export function renderDashboard(all, filter, now) {
  const stats = computeStats(all, now);
  return {
    stats,
    summary: renderSummary(stats),
    progress: renderProgress(stats),
    statCards: renderStats(stats, filter.status),
    areas: renderAreas(stats, filter.area),
    chips: renderStatusChips(stats, filter.status),
    filterBar: renderFilterBar(filter),
    list: renderTaskList(all, filter, now),
  };
}

// -----------------------------------------------------------------------------
// Histórico
// -----------------------------------------------------------------------------
export function renderHistory(all, { query, area }, now) {
  const done = applyFilters(all, { status: 'done', area: area || null, query }, now).sort(
    (a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0)
  );
  if (!done.length) {
    return `<div class="empty"><p class="empty-title">${
      query || area ? 'Nada encontrado no histórico com esses filtros.' : 'Nenhuma tarefa concluída ainda.'
    }</p><p class="empty-text">As tarefas concluídas ficam guardadas aqui e podem ser restauradas.</p></div>`;
  }
  const byDay = new Map();
  for (const t of done) {
    const key = t.completedAt ? C.toDateKey(new Date(t.completedAt)) : 'sem-data';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(t);
  }
  let html = '';
  for (const [key, list] of byDay) {
    const label = key === 'sem-data' ? 'Sem data de conclusão' : 'Concluídas ' + (relativeDay(key, now) === 'Hoje' ? 'hoje' : relativeDay(key, now) === 'Ontem' ? 'ontem' : 'em ' + shortDate(key));
    html += section('history', label, list, now);
  }
  return html;
}
