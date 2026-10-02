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
  checklist: svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  repeat: svg('<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
  comment: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  note: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>'),
  gcal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M12 14v4M10 16h4"/>'),
  sparkle: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>'),
};

/** Link "adicionar ao Google Agenda" para o prazo da tarefa. */
export function googleCalendarUrl(t) {
  if (!t.dueDate) return '';
  const d = t.dueDate.replace(/-/g, '');
  let dates;
  if (t.dueTime) {
    const start = t.dueTime.replace(':', '') + '00';
    const [h, m] = t.dueTime.split(':').map(Number);
    const endMin = Math.min(h * 60 + m + 30, 23 * 60 + 59);
    const end = pad(Math.floor(endMin / 60)) + pad(endMin % 60) + '00';
    dates = `${d}T${start}/${d}T${end}`;
  } else {
    const next = C.addDays(t.dueDate, 1).replace(/-/g, '');
    dates = `${d}/${next}`;
  }
  const details = [t.description, t.notes].filter(Boolean).join('\n\n');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: t.title, dates, details, ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

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

const NO_AREA = { name: 'Sem área', color: '#8A92A3' };

export function taskCard(t, now, areaMap, mode = '') {
  const c = C.classify(t, now);
  const area = (areaMap && areaMap[t.area]) || NO_AREA;
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
  if (t.checklist && t.checklist.length) {
    const doneCount = t.checklist.filter((x) => x.done).length;
    meta.push(`<button type="button" class="pill pill-check${doneCount === t.checklist.length ? ' is-complete' : ''}" data-action="edit" title="Checklist">${icons.checklist}${doneCount}/${t.checklist.length}</button>`);
  }
  if (t.recurrence) meta.push(`<span class="meta-item" title="Tarefa recorrente">${icons.repeat}${esc(C.RECURRENCE_MAP[t.recurrence].name)}</span>`);
  if (t.owner) meta.push(`<span class="meta-item">${icons.user}${esc(t.owner)}</span>`);
  if (t.comments && t.comments.length) meta.push(`<button type="button" class="meta-item meta-btn" data-action="edit" title="Comentários">${icons.comment}${t.comments.length}</button>`);
  if (t.noteId) meta.push(`<button type="button" class="meta-item meta-btn" data-action="open-note" data-note-id="${esc(t.noteId)}" title="Abrir a nota de origem">${icons.note}Reunião</button>`);
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

  const gcal = !done && t.dueDate
    ? `<a class="act" href="${esc(googleCalendarUrl(t))}" target="_blank" rel="noopener" title="Adicionar ao Google Agenda" aria-label="Adicionar ao Google Agenda">${icons.gcal}<span>Agenda</span></a>`
    : '';
  const actions = mode === 'trash'
    ? btn('untrash', icons.restore, 'Restaurar') + btn('purge', icons.trash, 'Excluir definitivamente', 'act-danger')
    : done
      ? btn('restore', icons.restore, 'Restaurar') + btn('edit', icons.edit, 'Editar') + btn('delete', icons.trash, 'Excluir', 'act-danger')
      : btn('complete', icons.check, 'Concluir', 'act-complete') +
        btn('edit', icons.edit, 'Editar') +
        btn('wait', icons.wait, 'Aguardando retorno') +
        gcal +
        btn('delete', icons.trash, 'Excluir', 'act-danger');
  const trashLine = mode === 'trash' && t.deletedAt
    ? `<p class="task-done-at">Excluída em ${dateTimeLabel(t.deletedAt)}. Será apagada de vez em ${Math.max(0, 30 - Math.floor((now - new Date(t.deletedAt)) / 86400000))} dias.</p>`
    : '';

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
      ${trashLine}
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

export function renderAreas(stats, activeArea, areas) {
  return areas.map(
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

export function renderFilterBar(filter, areaMap) {
  const parts = [];
  if (filter.area && areaMap[filter.area]) parts.push(areaMap[filter.area].name);
  if (filter.status !== 'all') parts.push(STATUS_FILTERS.find((f) => f.id === filter.status).name);
  if (filter.owner) parts.push('Responsável: ' + filter.owner);
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

export function section(id, name, list, now, areaMap, extra = "", mode = "") {
  if (!list.length) return '';
  return `<section class="group group-${id}">
    <h2 class="group-title">${name}<span class="group-count">${list.length}</span>${extra}</h2>
    <div class="group-list">${list.map((t) => taskCard(t, now, areaMap, mode)).join('')}</div>
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

export function renderTaskList(all, filter, now, areaMap) {
  const hasFilter = filter.area || filter.owner || filter.status !== 'all' || filter.query.trim();

  if (filter.status !== 'all') {
    const list = applyFilters(all, filter, now, areaMap);
    if (!list.length) return emptyFiltered();
    const sorted =
      filter.status === 'done'
        ? list.slice().sort((a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0))
        : C.sortTasks(list, now);
    const name = STATUS_FILTERS.find((f) => f.id === filter.status).name;
    return section('flat', name, sorted, now, areaMap);
  }

  const base = applyFilters(all, { area: filter.area, query: filter.query, owner: filter.owner, status: 'all' }, now, areaMap);
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
      html += section(s.id, s.name, list, now, areaMap);
    }
  }

  const weekAgo = now.getTime() - 7 * 86400000;
  const recent = base
    .filter((t) => t.status === 'done' && Date.parse(t.completedAt || 0) >= weekAgo)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, 5);
  html += section(
    'recent', 'Concluídas recentemente', recent, now, areaMap,
    '<a class="group-link" href="#/historico">Ver histórico</a>'
  );
  return html;
}

export function areaMapOf(areas) {
  return Object.fromEntries(areas.map((a) => [a.id, a]));
}

export function renderDashboard(all, filter, now, areas) {
  const areaMap = areaMapOf(areas);
  const stats = computeStats(all, now, areas);
  return {
    stats,
    summary: renderSummary(stats),
    progress: renderProgress(stats),
    statCards: renderStats(stats, filter.status),
    areas: renderAreas(stats, filter.area, areas),
    chips: renderStatusChips(stats, filter.status),
    filterBar: renderFilterBar(filter, areaMap),
    list: renderTaskList(all, filter, now, areaMap),
  };
}

// -----------------------------------------------------------------------------
// Histórico
// -----------------------------------------------------------------------------
export function renderHistory(all, { query, area }, now, areas) {
  const areaMap = areaMapOf(areas);
  const done = applyFilters(all, { status: 'done', area: area || null, query }, now, areaMap).sort(
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
    html += section('history', label, list, now, areaMap);
  }
  return html;
}

// -----------------------------------------------------------------------------
// Lixeira
// -----------------------------------------------------------------------------
export function renderTrash(trash, now, areas) {
  const areaMap = areaMapOf(areas);
  if (!trash.length) {
    return '<div class="empty"><p class="empty-title">A lixeira está vazia.</p><p class="empty-text">Tarefas excluídas ficam aqui por 30 dias e podem ser restauradas.</p></div>';
  }
  const list = trash.slice().sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
  return section('trash', 'Lixeira', list, now, areaMap,
    '<button type="button" class="group-link link-danger" data-action="empty-trash">Esvaziar lixeira</button>', 'trash');
}

// -----------------------------------------------------------------------------
// Agenda (próximos 7 dias)
// -----------------------------------------------------------------------------
export function renderAgenda(all, now, areas, offset = 0) {
  const areaMap = areaMapOf(areas);
  const today = C.toDateKey(now);
  const start = C.addDays(today, offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => C.addDays(start, i));
  const end = days[6];
  const open = all.filter((t) => t.status !== 'done');
  const dateOf = (t) => (t.status === 'waiting' ? t.followUpDate : t.dueDate);

  let html = `<div class="agenda-nav">
    <button type="button" class="btn" data-agenda="-1" ${offset <= 0 ? 'disabled' : ''}>‹ Anterior</button>
    <span class="agenda-range">${shortDate(start)} a ${shortDate(end)}</span>
    <button type="button" class="btn" data-agenda="1">Próxima ›</button>
  </div>`;

  if (offset === 0) {
    const late = C.sortTasks(open.filter((t) => C.classify(t, now).overdue), now);
    html += section('overdue', 'Atrasadas', late, now, areaMap);
  }
  let any = false;
  for (const day of days) {
    const list = C.sortTasks(open.filter((t) => dateOf(t) === day && !(day === today && C.classify(t, now).overdue)), now);
    const label = relativeDay(day, now);
    const isWeekend = [0, 6].includes(C.fromDateKey(day).getDay());
    if (!list.length) {
      html += `<section class="group agenda-day is-empty${isWeekend ? ' is-weekend' : ''}"><h2 class="group-title">${label}</h2><p class="agenda-free">Nada agendado.</p></section>`;
      continue;
    }
    any = true;
    html += section('day', label, list, now, areaMap);
  }
  const noDate = open.filter((t) => !dateOf(t)).length;
  html += `<p class="hint agenda-foot">${noDate ? `${noDate} ${noDate === 1 ? 'tarefa aberta não tem' : 'tarefas abertas não têm'} prazo e não aparece${noDate === 1 ? '' : 'm'} aqui. ` : ''}Use o ícone de calendário em cada tarefa para adicioná-la ao Google Agenda.</p>`;
  void any;
  return html;
}

// -----------------------------------------------------------------------------
// Relatório
// -----------------------------------------------------------------------------
export function renderReport(all, now, areas, days = 30) {
  const since = now.getTime() - days * 86400000;
  const inPeriod = (iso) => iso && Date.parse(iso) >= since;
  const done = all.filter((t) => t.status === 'done' && inPeriod(t.completedAt));
  const created = all.filter((t) => inPeriod(t.createdAt));
  const withDue = done.filter((t) => t.dueDate);
  const onTime = withDue.filter((t) => C.toDateKey(new Date(t.completedAt)) <= t.dueDate).length;
  const overdueNow = all.filter((t) => t.status !== 'done' && C.classify(t, now).overdue).length;
  const durations = done.map((t) => (Date.parse(t.completedAt) - Date.parse(t.createdAt)) / 86400000).filter((x) => x >= 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const pct = withDue.length ? Math.round((onTime / withDue.length) * 100) : null;

  const kpi = (label, value, sub = '') =>
    `<div class="card kpi"><span class="stat-label">${label}</span><span class="stat-num">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;

  const byArea = areas.map((a) => ({
    a,
    done: done.filter((t) => t.area === a.id).length,
    open: all.filter((t) => t.area === a.id && t.status !== 'done').length,
  }));
  const maxArea = Math.max(1, ...byArea.map((x) => x.done + x.open));
  const areaRows = byArea
    .map(
      (x) => `<div class="bar-row" style="--area:${x.a.color}">
        <span class="bar-label"><i></i>${esc(x.a.name)}</span>
        <span class="bar-track"><span class="bar-done" style="width:${(x.done / maxArea) * 100}%"></span><span class="bar-open" style="width:${(x.open / maxArea) * 100}%"></span></span>
        <span class="bar-value">${x.done} concluídas, ${x.open} abertas</span>
      </div>`
    )
    .join('');

  // concluídas por semana (últimas 8 semanas)
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const endW = now.getTime() - i * 7 * 86400000;
    const startW = endW - 7 * 86400000;
    weeks.push({
      label: shortDate(C.toDateKey(new Date(startW + 86400000))),
      n: all.filter((t) => t.status === 'done' && t.completedAt && Date.parse(t.completedAt) > startW && Date.parse(t.completedAt) <= endW).length,
    });
  }
  const maxW = Math.max(1, ...weeks.map((w) => w.n));
  const weekBars = weeks
    .map((w) => `<div class="week-col"><span class="week-n">${w.n}</span><span class="week-bar" style="height:${(w.n / maxW) * 100}%"></span><span class="week-label">${w.label}</span></div>`)
    .join('');

  const owners = {};
  done.forEach((t) => {
    const k = t.owner || 'Sem responsável';
    owners[k] = (owners[k] || 0) + 1;
  });
  const ownerRows = Object.entries(owners)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<li><span>${esc(name)}</span><strong>${n}</strong></li>`)
    .join('');

  return `<div class="report-periods" role="group" aria-label="Período">
      ${[7, 30, 90].map((d) => `<button type="button" class="chip" data-report-days="${d}" aria-pressed="${d === days}">Últimos ${d} dias</button>`).join('')}
    </div>
    <div class="kpis">
      ${kpi('Concluídas', done.length)}
      ${kpi('Criadas', created.length)}
      ${kpi('No prazo', pct === null ? '–' : pct + '%', withDue.length ? `${onTime} de ${withDue.length} com prazo` : 'sem tarefas com prazo')}
      ${kpi('Tempo médio', avg === null ? '–' : avg < 1 ? 'menos de 1 dia' : Math.round(avg) + (Math.round(avg) === 1 ? ' dia' : ' dias'), 'da criação à conclusão')}
      ${kpi('Atrasadas agora', overdueNow)}
    </div>
    <section class="card report-card">
      <h2>Por área</h2>
      <div class="bars">${areaRows}</div>
      <p class="hint"><span class="legend legend-done"></span>Concluídas no período <span class="legend legend-open"></span>Abertas agora</p>
    </section>
    <section class="card report-card">
      <h2>Concluídas por semana</h2>
      <div class="weeks">${weekBars}</div>
    </section>
    ${ownerRows ? `<section class="card report-card"><h2>Concluídas por responsável</h2><ul class="owner-list">${ownerRows}</ul></section>` : ''}`;
}

// -----------------------------------------------------------------------------
// Notas
// -----------------------------------------------------------------------------
export function renderNotesList(notes, tasks, query = '') {
  const q = query.trim().toLowerCase();
  const list = q ? notes.filter((n) => (n.title + ' ' + n.participants + ' ' + n.body).toLowerCase().includes(q)) : notes;
  if (!notes.length) {
    return `<div class="empty">
      <div class="empty-mark empty-mark-note">${icons.note}</div>
      <p class="empty-title">Nenhuma nota ainda.</p>
      <p class="empty-text">Anote suas reuniões aqui. Ao terminar, a IA transforma a anotação em tarefas para você revisar.</p>
      <button type="button" class="btn btn-primary" data-action="new-note">${icons.plus}Nova nota</button>
    </div>`;
  }
  if (!list.length) return '<div class="empty"><p class="empty-title">Nenhuma nota encontrada.</p></div>';
  return `<div class="note-list">${list
    .map((n) => {
      const created = tasks.filter((t) => n.taskIds.includes(t.id) && !t.deletedAt);
      const open = created.filter((t) => t.status !== 'done').length;
      const preview = n.body.replace(/\s+/g, ' ').slice(0, 160);
      return `<button type="button" class="note-item card" data-action="open-note" data-note-id="${esc(n.id)}">
        <span class="note-item-top"><strong>${esc(n.title || 'Sem título')}</strong><span class="note-date">${esc(relativeDay(n.date, new Date()))}</span></span>
        ${n.participants ? `<span class="note-people">${icons.user}${esc(n.participants)}</span>` : ''}
        <span class="note-preview">${esc(preview || 'Nota vazia')}</span>
        ${created.length ? `<span class="note-tasks">${icons.check}${created.length} ${created.length === 1 ? 'tarefa criada' : 'tarefas criadas'}${open ? `, ${open} ${open === 1 ? 'aberta' : 'abertas'}` : ''}</span>` : ''}
      </button>`;
    })
    .join('')}</div>`;
}
