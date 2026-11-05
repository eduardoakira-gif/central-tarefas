/*
 * b2c.js
 * Painel B2C (indicadores por pilar e OKRs), Financeiro do Merchan (NFs, XMLs,
 * envio ao financeiro e agendamento de pagamento) e a "cobrança do dono".
 * Os dados ficam nas coleções metrics, okrs e bills, sincronizadas como as tarefas.
 */
import { Sync } from './sync.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const nowIso = () => new Date().toISOString();
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const PILLAR_ORDER = ['comunidade', 'socio', 'merchan', 'crm', 'geral'];

let H = null; // helpers vindos do app.js (toast, confirmDialog, openTaskDialog, render)

export const view = {
  month: null, // AAAA-MM exibido no painel
  entry: false, // modo "lançar valores"
  closeMonth: null, // mês do fechamento no financeiro
  editingMetric: null,
  editingOkr: null,
  editingBill: null,
  okrKrs: [],
};

// -----------------------------------------------------------------------------
// Datas e formatação
// -----------------------------------------------------------------------------
const ymOf = (d) => C.toDateKey(d).slice(0, 7);
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return ymOf(d);
}
export const monthLabel = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
const monthShort = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3);
function defaultMonth(now = new Date()) {
  // no começo do mês, o que se lança é o mês que acabou
  return now.getDate() <= 10 ? addMonths(ymOf(now), -1) : ymOf(now);
}
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function fmt(m, v, short = false) {
  if (v == null || v === '') return '–';
  const n = Number(v);
  switch (m.unit) {
    case 'currency':
      return short && Math.abs(n) >= 10000 ? brlShort.format(n) : brl.format(n);
    case 'percent':
      return nf.format(n) + '%';
    case 'ratio':
      return nf.format(n) + 'x';
    case 'days':
      return nf.format(n) + (n === 1 ? ' dia' : ' dias');
    default:
      return short && Math.abs(n) >= 10000 ? new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : nf.format(n);
  }
}
const money = (n) => brl.format(Number(n) || 0);

function relDate(key, now = new Date()) {
  if (!key) return 'sem data';
  const today = C.toDateKey(now);
  const diff = Math.round((C.fromDateKey(key) - C.fromDateKey(today)) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  if (diff < 0) return `há ${-diff} dias`;
  if (diff < 7) return `em ${diff} dias`;
  const d = C.fromDateKey(key);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}
const dateBr = (key) => (key ? C.fromDateKey(key).toLocaleDateString('pt-BR') : '');

// -----------------------------------------------------------------------------
// Dados
// -----------------------------------------------------------------------------
const live = (list) => list.filter((x) => !x.deletedAt);
export const Metrics = {
  all: () => live(Sync.metrics).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
  get: (id) => Sync.metrics.find((m) => m.id === id) || null,
  async save(data) {
    const cur = data.id ? this.get(data.id) : null;
    const m = C.normalizeMetric(Object.assign({}, cur || { createdAt: nowIso(), order: Sync.metrics.length + 100 }, data, { updatedAt: nowIso() }));
    await Sync.upsert('metrics', m);
    return m;
  },
  async setValue(id, ym, value) {
    const m = this.get(id);
    if (!m) return;
    const values = Object.assign({}, m.values);
    if (value === '' || value == null || isNaN(Number(value))) delete values[ym];
    else values[ym] = Number(value);
    return this.save({ id, values });
  },
  remove: (id) => Sync.remove('metrics', id),
  async loadCatalog() {
    const have = new Set(Sync.metrics.map((m) => m.id));
    const add = C.kpiCatalog().filter((k) => !have.has(k.id));
    for (const k of add) await Sync.upsert('metrics', C.normalizeMetric(Object.assign({}, k, { createdAt: nowIso(), updatedAt: nowIso() })));
    return add.length;
  },
};

export const Okrs = {
  all: () => live(Sync.okrs),
  get: (id) => Sync.okrs.find((o) => o.id === id) || null,
  async save(data) {
    const cur = data.id ? this.get(data.id) : null;
    const o = C.normalizeOkr(Object.assign({}, cur || { createdAt: nowIso() }, data, { updatedAt: nowIso() }));
    await Sync.upsert('okrs', o);
    return o;
  },
  remove: (id) => Sync.remove('okrs', id),
};

export const Bills = {
  all: () => live(Sync.bills),
  get: (id) => Sync.bills.find((b) => b.id === id) || null,
  async save(data) {
    const cur = data.id ? this.get(data.id) : null;
    const b = C.normalizeBill(Object.assign({}, cur || { createdAt: nowIso() }, data, { updatedAt: nowIso() }));
    await Sync.upsert('bills', b);
    return b;
  },
  remove: (id) => Sync.remove('bills', id),
};

// -----------------------------------------------------------------------------
// Cobrança do dono (mesma lógica do servidor)
// -----------------------------------------------------------------------------
export function ownerAlerts(now = new Date()) {
  const s = C.mergeSettings(Sync.central && Sync.central.settings);
  const today = C.toDateKey(now);
  const out = [];
  const open = Bills.all().filter((b) => !b.paidAt);
  const sum = (l) => l.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  if (s.billsReminder) {
    const overdue = open.filter((b) => b.dueDate && b.dueDate < today);
    const soon = open.filter((b) => b.dueDate && b.dueDate >= today && b.dueDate <= C.addDays(today, 3) && !b.scheduledFor);
    if (overdue.length) out.push({ level: 'red', route: '#/financeiro', text: `${overdue.length === 1 ? '1 NF vencida' : overdue.length + ' NFs vencidas'} sem pagamento (${money(sum(overdue))}).` });
    if (soon.length) out.push({ level: 'amber', route: '#/financeiro', text: `${soon.length === 1 ? '1 NF vence' : soon.length + ' NFs vencem'} em até 3 dias sem agendamento com o financeiro (${money(sum(soon))}).` });
    if (now.getDate() <= (s.monthCloseDay || 5)) {
      const comp = addMonths(ymOf(now), -1);
      const pending = Bills.all().filter((b) => b.competence === comp && !b.sentAt);
      if (pending.length) {
        const missing = pending.filter((b) => !b.nfOk || !b.xmlOk).length;
        out.push({ level: 'amber', route: '#/financeiro', text: `Fechamento de ${MONTHS[Number(comp.slice(5)) - 1]}: ${pending.length === 1 ? '1 NF/XML para enviar' : pending.length + ' NFs/XMLs para enviar'}${missing ? `, ${missing} ainda sem documento` : ''}.` });
      }
    }
  }
  const week = C.weekStart(now);
  const focus = Sync.tasks.filter((t) => !t.deletedAt && t.status !== 'done' && t.focusWeek === week);
  const wd = now.getDay();
  if (!focus.length && wd >= 1 && wd <= 2 && Sync.tasks.some((t) => !t.deletedAt && t.status !== 'done')) {
    out.unshift({ level: 'amber', route: '#/', text: 'Defina as 3 prioridades da semana: toque em ★ Foco nas tarefas. Dono sem foco vira apagador de incêndio.' });
  } else if (focus.length && wd >= 3) {
    const idle = focus.filter((t) => t.status === 'pending').length;
    if (idle) out.unshift({ level: 'red', route: '#/', text: `${idle === 1 ? '1 prioridade da semana ainda não começou' : idle + ' prioridades da semana ainda não começaram'}. Comece hoje ou renegocie.` });
  }
  const stale = Sync.tasks.filter((t) => !t.deletedAt && (t.status === 'pending' || t.status === 'doing') && Date.parse(t.updatedAt) < now.getTime() - 3 * 86400000);
  if (stale.length) out.push({ level: 'muted', route: '#/', text: `${stale.length === 1 ? '1 demanda parada' : stale.length + ' demandas paradas'} há mais de 3 dias. Atualize, delegue ou conclua.` });
  const metrics = Metrics.all();
  if (metrics.length && now.getDate() <= 10) {
    const comp = addMonths(ymOf(now), -1);
    const empty = metrics.filter((m) => m.values[comp] == null).length;
    if (empty) out.push({ level: 'muted', route: '#/painel', text: `${empty === 1 ? '1 indicador' : empty + ' indicadores'} de ${MONTHS[Number(comp.slice(5)) - 1]} sem valor no Painel B2C.` });
  }
  return out;
}

export function renderOwnerCard() {
  const alerts = ownerAlerts();
  const now = new Date();
  const week = C.weekStart(now);
  const focus = Sync.tasks.filter((t) => !t.deletedAt && t.focusWeek === week);
  const focusHtml = focus.length
    ? `<div class="focus-box"><span class="label">Foco da semana · ${focus.filter((t) => t.status === 'done').length}/${focus.length} entregues</span>
        ${focus.map((t) => `<span class="focus-item${t.status === 'done' ? ' is-done' : ''}">${t.status === 'done' ? '✓' : '★'} ${esc(t.title)}</span>`).join('')}</div>`
    : '';
  if (!alerts.length && !focusHtml) return '';
  return `<section class="card owner-card">
    <div class="owner-head"><strong>Cobrança do dono</strong><a class="link-muted" href="#/assistente">Pedir direcionamento ›</a></div>
    ${focusHtml}
    ${alerts.length ? `<ul>${alerts.map((a) => `<li class="owner-${a.level}"><a href="${a.route}">${esc(a.text)}</a></li>`).join('')}</ul>` : '<p class="hint">Nada travado agora. Bom trabalho.</p>'}
  </section>`;
}

// -----------------------------------------------------------------------------
// Painel B2C
// -----------------------------------------------------------------------------
function metricStatus(m, v) {
  if (v == null || m.target == null) return { pct: null, cls: 'none' };
  let pct;
  if (m.direction === 'down') pct = v <= m.target ? 1 : m.target === 0 ? 0 : Math.max(0, m.target / v);
  else pct = m.target === 0 ? 1 : Math.max(0, v / m.target);
  return { pct, cls: pct >= 1 ? 'good' : pct >= 0.8 ? 'warn' : 'bad' };
}

function spark(m, ym) {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5));
  const vals = months.map((k) => m.values[k]);
  const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null);
  if (pts.length < 2) return '';
  const min = Math.min(...pts.map((p) => p[1]));
  const max = Math.max(...pts.map((p) => p[1]));
  const y = (v) => (max === min ? 12 : 22 - ((v - min) / (max - min)) * 20);
  const line = pts.map(([i, v]) => `${(i * 16).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="-2 0 84 24" aria-hidden="true"><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0] * 16}" cy="${y(last[1])}" r="2.4" fill="currentColor"/></svg>`;
}

function metricCard(m, ym, entry) {
  const v = m.values[ym];
  const prev = m.values[addMonths(ym, -1)];
  const st = metricStatus(m, v);
  let delta = '';
  if (v != null && prev != null && prev !== 0) {
    const d = ((v - prev) / Math.abs(prev)) * 100;
    const good = m.direction === 'down' ? d < 0 : d > 0;
    delta = `<span class="delta ${d === 0 ? '' : good ? 'is-good' : 'is-bad'}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${nf.format(Math.abs(d))}%</span>`;
  }
  const value = entry
    ? `<input class="input kpi-input" type="number" step="any" inputmode="decimal" data-metric-value="${esc(m.id)}" value="${v ?? ''}" placeholder="Valor de ${monthShort(ym)}" aria-label="${esc(m.name)}">`
    : `<span class="kpi-value">${fmt(m, v, true)}</span>`;
  return `<article class="card kpi-card kpi-${st.cls}${m.northStar ? ' is-north' : ''}" data-metric-id="${esc(m.id)}">
    <button type="button" class="kpi-name" data-b2c="edit-metric" title="${esc(m.description)}">${esc(m.name)}</button>
    <div class="kpi-row">${value}${entry ? '' : spark(m, ym)}</div>
    <div class="kpi-foot">
      ${m.target != null ? `<span>Meta ${fmt(m, m.target, true)}</span>` : '<button type="button" class="link-muted meta-btn" data-b2c="edit-metric">Definir meta</button>'}
      ${delta}
    </div>
    ${st.pct != null ? `<span class="kpi-bar"><i style="width:${Math.min(100, st.pct * 100)}%"></i></span>` : ''}
  </article>`;
}

function pillarHealth(list, ym) {
  const withTarget = list.filter((m) => m.target != null && m.values[ym] != null);
  const ok = withTarget.filter((m) => metricStatus(m, m.values[ym]).pct >= 1).length;
  const filled = list.filter((m) => m.values[ym] != null).length;
  return { ok, withTarget: withTarget.length, filled, total: list.length };
}

function okrCard(o, metrics, now) {
  const krs = o.krs.map((k) => Object.assign({ k }, C.krProgress(k, metrics)));
  const measured = krs.filter((x) => x.pct != null);
  const pct = measured.length ? measured.reduce((a, x) => a + x.pct, 0) / measured.length : null;
  const expected = C.quarterElapsed(o.quarter, now);
  let status = { cls: 'none', label: 'Sem medição' };
  if (pct != null) {
    if (pct >= expected - 0.05) status = { cls: 'good', label: 'No ritmo' };
    else if (pct >= expected - 0.2) status = { cls: 'warn', label: 'Atenção' };
    else status = { cls: 'bad', label: 'Atrasado' };
  }
  const p = C.PILLAR_MAP[o.pillar];
  return `<article class="card okr-card" data-okr-id="${esc(o.id)}">
    <div class="okr-top">
      <span class="area-tag" style="--area:${p.color}"><i></i>${esc(p.name)}</span>
      <span class="okr-status okr-${status.cls}">${status.label}${pct != null ? ' · ' + Math.round(pct * 100) + '%' : ''}</span>
    </div>
    <button type="button" class="okr-obj" data-b2c="edit-okr">${esc(o.objective || 'Objetivo sem título')}</button>
    <ul class="kr-list">${krs
      .map(
        (x) => `<li><span class="kr-text">${esc(x.k.text)}</span>
          <span class="kr-nums">${x.current == null ? '–' : nf.format(x.current)} / ${x.k.target == null ? '–' : nf.format(x.k.target)}</span>
          <span class="kpi-bar"><i style="width:${x.pct == null ? 0 : Math.round(x.pct * 100)}%"></i></span></li>`
      )
      .join('') || '<li class="hint">Nenhum resultado-chave ainda.</li>'}</ul>
    <span class="hint">Esperado para hoje: ${Math.round(expected * 100)}% do trimestre.</span>
  </article>`;
}

export function renderPanel() {
  const now = new Date();
  if (!view.month) view.month = defaultMonth(now);
  const ym = view.month;
  const metrics = Metrics.all();
  const head = `<div class="panel-bar">
      <div class="month-nav">
        <button type="button" class="icon-btn" data-b2c="month" data-step="-1" aria-label="Mês anterior">‹</button>
        <strong>${monthLabel(ym)}</strong>
        <button type="button" class="icon-btn" data-b2c="month" data-step="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="btn-row">
        ${metrics.length ? `<button type="button" class="btn${view.entry ? ' btn-primary' : ''}" data-b2c="toggle-entry">${view.entry ? 'Concluir lançamento' : 'Lançar valores do mês'}</button>` : ''}
        <button type="button" class="btn" data-b2c="new-metric">Novo indicador</button>
        <button type="button" class="btn" data-b2c="new-okr">Novo OKR</button>
      </div>
    </div>`;

  const notice = Sync.v4() ? '' : `<p class="notice">O servidor ainda está sendo atualizado. O que você lançar aqui fica salvo neste aparelho e sincroniza sozinho assim que a atualização terminar.</p>`;

  if (!metrics.length) {
    return `${notice}${head}<section class="card empty-panel">
      <h2>Monte o painel em 1 clique</h2>
      <p>Carregue os ${C.kpiCatalog().length} indicadores que as organizações referência acompanham (T1, Team Liquid, 100 Thieves, FURIA): métrica-norte, Comunidade, Sócio-Torcedor, Merchan e CRM. Depois é só definir as metas e lançar os valores todo mês.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-b2c="load-catalog">Carregar indicadores recomendados</button></div>
    </section>${renderOkrs(metrics, now, ym)}`;
  }

  const north = metrics.filter((m) => m.northStar);
  const rest = metrics.filter((m) => !m.northStar);
  const health = PILLAR_ORDER.filter((p) => p !== 'geral' && rest.some((m) => m.pillar === p))
    .map((pid) => {
      const p = C.PILLAR_MAP[pid];
      const h = pillarHealth(rest.filter((m) => m.pillar === pid), ym);
      return `<a class="card health" href="#pilar-${pid}" style="--area:${p.color}">
        <span class="health-name"><i></i>${p.name}</span>
        <span class="health-num">${h.withTarget ? Math.round((h.ok / h.withTarget) * 100) + '%' : '–'}</span>
        <span class="stat-sub">${h.withTarget ? `${h.ok} de ${h.withTarget} na meta` : 'sem metas medidas'} · ${h.filled}/${h.total} lançados</span>
      </a>`;
    })
    .join('');

  const sections = PILLAR_ORDER.map((pid) => {
    const list = rest.filter((m) => m.pillar === pid);
    if (!list.length) return '';
    const p = C.PILLAR_MAP[pid];
    return `<section class="pillar" id="pilar-${pid}" style="--area:${p.color}">
      <h2 class="group-title"><i class="pillar-dot"></i>${p.name}</h2>
      <div class="kpi-grid">${list.map((m) => metricCard(m, ym, view.entry)).join('')}</div>
    </section>`;
  }).join('');

  return `${notice}${head}
    ${north.length ? `<div class="kpi-grid kpi-north">${north.map((m) => metricCard(m, ym, view.entry)).join('')}</div>` : ''}
    <div class="health-row">${health}</div>
    ${sections}
    ${renderOkrs(metrics, now, ym)}
    <p class="hint">Clique no nome de um indicador para editar meta, histórico e descrição. Os valores ficam salvos na central e o assistente usa tudo isso para te orientar.</p>`;
}

function renderOkrs(metrics, now, ym) {
  const [y, m] = ym.split('-').map(Number);
  const q = y + '-Q' + (Math.floor((m - 1) / 3) + 1);
  const list = Okrs.all().filter((o) => o.quarter === q);
  return `<section class="pillar okrs">
    <h2 class="group-title">OKRs do ${q.slice(-2)} de ${q.slice(0, 4)}</h2>
    ${list.length ? `<div class="okr-grid">${list.map((o) => okrCard(o, metrics, now)).join('')}</div>` : `<div class="card empty-panel"><p>Defina 1 objetivo por pilar com 2 a 4 resultados-chave mensuráveis. Exemplo: “Transformar a torcida em comunidade ativa” com KR “Chegar a 5.000 membros no Discord”.</p><div class="btn-row"><button type="button" class="btn" data-b2c="new-okr">Criar OKR</button></div></div>`}
  </section>`;
}

// -----------------------------------------------------------------------------
// Financeiro do Merchan
// -----------------------------------------------------------------------------
function billRow(b, now) {
  const stage = C.billStage(b);
  const today = C.toDateKey(now);
  const late = !b.paidAt && b.dueDate && b.dueDate < today;
  const soon = !b.paidAt && !b.scheduledFor && b.dueDate && b.dueDate >= today && b.dueDate <= C.addDays(today, 3);
  const next = {
    docs: '',
    ready: `<button type="button" class="btn btn-sm" data-b2c="bill-sent">Enviei ao financeiro</button>`,
    sent: `<label class="pill pill-date" title="Data agendada para o pagamento"><span>Agendar</span><input type="date" data-bill-schedule></label>`,
    scheduled: `<button type="button" class="btn btn-sm" data-b2c="bill-paid">Marcar como paga</button>`,
    paid: '',
  }[stage];
  return `<div class="bill-row${late ? ' is-late' : soon ? ' is-soon' : ''}" data-bill-id="${esc(b.id)}">
    <button type="button" class="bill-main" data-b2c="edit-bill">
      <strong>${esc(b.supplier || 'Fornecedor')}</strong>
      <span class="bill-meta">NF ${esc(b.number || 's/n')} · ${MONTHS[Number(b.competence.slice(5)) - 1].slice(0, 3)}/${b.competence.slice(2, 4)}${b.scheduledFor ? ' · agendada ' + dateBr(b.scheduledFor) : ''}${b.paidAt ? ' · paga ' + dateBr(b.paidAt) : ''}</span>
    </button>
    <span class="bill-amount">${money(b.amount)}</span>
    <span class="bill-due">${b.paidAt ? 'paga' : 'vence ' + relDate(b.dueDate, now)}</span>
    <div class="bill-actions">
      <button type="button" class="pill pill-doc${b.nfOk ? ' is-on' : ''}" data-b2c="bill-toggle" data-field="nfOk" aria-pressed="${b.nfOk}">NF</button>
      <button type="button" class="pill pill-doc${b.xmlOk ? ' is-on' : ''}" data-b2c="bill-toggle" data-field="xmlOk" aria-pressed="${b.xmlOk}">XML</button>
      ${next}
    </div>
  </div>`;
}

export function closingText(comp) {
  const list = Bills.all().filter((b) => b.competence === comp).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const total = list.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const lines = list.map((b) => `- ${b.supplier || 'Fornecedor'} | NF ${b.number || 's/n'} | ${money(b.amount)} | vencimento ${b.dueDate ? dateBr(b.dueDate) : 'a definir'}${b.nfOk && b.xmlOk ? '' : ' | pendente: ' + [!b.nfOk && 'NF', !b.xmlOk && 'XML'].filter(Boolean).join(' e ')}`);
  return {
    subject: `Merchan: NFs e XMLs de ${monthLabel(comp)}`,
    body: `Olá, time do financeiro!\n\nSeguem as notas fiscais e os XMLs do merchan referentes a ${monthLabel(comp)} (${list.length} ${list.length === 1 ? 'nota' : 'notas'}, total ${money(total)}):\n\n${lines.join('\n')}\n\nPor favor, me confirmem o agendamento dos pagamentos conforme os vencimentos.\n\nObrigado!`,
    list,
  };
}

export function renderFinance() {
  const now = new Date();
  const today = C.toDateKey(now);
  if (!view.closeMonth) view.closeMonth = now.getDate() <= 20 ? addMonths(ymOf(now), -1) : ymOf(now);
  const all = Bills.all();
  const open = all.filter((b) => !b.paidAt);
  const sum = (l) => l.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const in7 = open.filter((b) => b.dueDate && b.dueDate >= today && b.dueDate <= C.addDays(today, 7));
  const overdue = open.filter((b) => b.dueDate && b.dueDate < today);
  const missing = all.filter((b) => !b.nfOk || !b.xmlOk);
  const paidMonth = all.filter((b) => b.paidAt && b.paidAt.slice(0, 7) === today.slice(0, 7));
  const kpi = (label, value, sub, alert) =>
    `<div class="card kpi${alert ? ' is-alert' : ''}"><span class="stat-label">${label}</span><span class="stat-num">${value}</span><span class="stat-sub">${sub}</span></div>`;

  const comp = view.closeMonth;
  const cl = closingText(comp);
  const sent = cl.list.filter((b) => b.sentAt).length;
  const docsOk = cl.list.filter((b) => b.nfOk && b.xmlOk).length;
  const closing = `<section class="card report-card closing">
    <div class="closing-head">
      <h2>Fechamento do mês</h2>
      <div class="month-nav">
        <button type="button" class="icon-btn" data-b2c="close-month" data-step="-1" aria-label="Mês anterior">‹</button>
        <strong>${monthLabel(comp)}</strong>
        <button type="button" class="icon-btn" data-b2c="close-month" data-step="1" aria-label="Próximo mês">›</button>
      </div>
    </div>
    ${cl.list.length
      ? `<div class="closing-steps">
          <span class="${docsOk === cl.list.length ? 'is-done' : ''}">1. NF e XML de todas: <strong>${docsOk}/${cl.list.length}</strong></span>
          <span class="${sent === cl.list.length ? 'is-done' : ''}">2. Enviadas ao financeiro: <strong>${sent}/${cl.list.length}</strong></span>
          <span>Total do mês: <strong>${money(sum(cl.list))}</strong></span>
        </div>
        <div class="btn-row">
          <button type="button" class="btn" data-b2c="copy-closing">Copiar resumo para o financeiro</button>
          <a class="btn" href="mailto:?subject=${encodeURIComponent(cl.subject)}&body=${encodeURIComponent(cl.body)}">Abrir e-mail</a>
          ${docsOk > sent ? `<button type="button" class="btn btn-primary" data-b2c="mark-sent">Marcar as prontas como enviadas</button>` : ''}
        </div>`
      : `<p class="hint">Nenhuma NF com competência em ${monthLabel(comp)}. Cadastre as notas do mês para fechar.</p>`}
    <p class="hint">Todo começo de mês (até o dia ${C.mergeSettings(Sync.central.settings).monthCloseDay}) a Central te cobra o envio das NFs e XMLs do mês anterior.</p>
  </section>`;

  const groups = C.BILL_STAGES.map((st) => {
    let list = all.filter((b) => C.billStage(b) === st.id);
    if (st.id === 'paid') list = list.filter((b) => b.paidAt >= C.addDays(today, -45));
    if (!list.length) return '';
    list.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    return `<section class="group">
      <h2 class="group-title">${st.name} <span class="group-count">${list.length} · ${money(sum(list))}</span></h2>
      <div class="bill-list">${list.map((b) => billRow(b, now)).join('')}</div>
    </section>`;
  }).join('');

  const notice = Sync.v4() ? '' : `<p class="notice">O servidor ainda está sendo atualizado. As NFs ficam salvas neste aparelho e sincronizam sozinhas assim que a atualização terminar.</p>`;

  return `${notice}<div class="kpis kpis-4">
      ${kpi('A pagar em 7 dias', money(sum(in7)), in7.length === 1 ? '1 nota' : in7.length + ' notas')}
      ${kpi('Vencidas', money(sum(overdue)), overdue.length === 1 ? '1 nota' : overdue.length + ' notas', overdue.length > 0)}
      ${kpi('Sem NF ou XML', missing.length, 'documentos pendentes', missing.length > 0)}
      ${kpi('Pagas neste mês', money(sum(paidMonth)), paidMonth.length === 1 ? '1 nota' : paidMonth.length + ' notas')}
    </div>
    ${closing}
    ${groups || `<div class="empty"><div class="empty-title">Nenhuma NF cadastrada</div><p class="empty-text">Cadastre as notas dos fornecedores de merchan para acompanhar documentos, envio ao financeiro e pagamentos.</p><button type="button" class="btn btn-primary" data-b2c="new-bill">Cadastrar NF</button></div>`}
    <p class="hint">Fluxo de cada nota: receber NF e XML → enviar ao financeiro → financeiro agenda o pagamento → paga. Quando o Bling for conectado, as notas poderão entrar sozinhas.</p>`;
}

// -----------------------------------------------------------------------------
// Diálogos
// -----------------------------------------------------------------------------
function fillSelect(sel, list, value) {
  sel.innerHTML = list.map((o) => `<option value="${esc(o.id)}"${o.id === value ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
}

function openMetricDialog(id) {
  const m = id ? Metrics.get(id) : null;
  view.editingMetric = m ? m.id : null;
  const f = $('#metricForm');
  f.reset();
  $('#metricDialogTitle').textContent = m ? 'Editar indicador' : 'Novo indicador';
  f.mName.value = m ? m.name : '';
  fillSelect(f.mPillar, C.PILLARS, m ? m.pillar : 'comunidade');
  fillSelect(f.mUnit, C.UNITS, m ? m.unit : 'number');
  f.mDirection.value = m ? m.direction : 'up';
  f.mTarget.value = m && m.target != null ? m.target : '';
  f.mDescription.value = m ? m.description : '';
  f.mNorth.checked = m ? m.northStar : false;
  const ym = view.month || defaultMonth();
  $('#metricHistory').innerHTML = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5))
    .map((k) => `<label class="field"><span class="label">${monthShort(k)}/${k.slice(2, 4)}</span><input type="number" step="any" inputmode="decimal" class="input input-sm" data-hist="${k}" value="${m && m.values[k] != null ? m.values[k] : ''}"></label>`)
    .join('');
  $('#metricDelete').hidden = !m;
  $('#metricDialog').showModal();
  setTimeout(() => f.mName.focus(), 30);
}

async function submitMetric(e) {
  e.preventDefault();
  const f = $('#metricForm');
  const name = f.mName.value.trim();
  if (!name) return f.mName.focus();
  const cur = view.editingMetric ? Metrics.get(view.editingMetric) : null;
  const values = Object.assign({}, cur ? cur.values : {});
  $$('#metricHistory [data-hist]').forEach((inp) => {
    if (inp.value === '') delete values[inp.dataset.hist];
    else values[inp.dataset.hist] = Number(inp.value);
  });
  await Metrics.save({
    id: view.editingMetric || undefined,
    name,
    pillar: f.mPillar.value,
    unit: f.mUnit.value,
    direction: f.mDirection.value,
    target: f.mTarget.value,
    description: f.mDescription.value.trim(),
    northStar: f.mNorth.checked,
    values,
  });
  $('#metricDialog').close();
  H.toast(cur ? 'Indicador atualizado' : 'Indicador criado');
}

function renderKrEditor() {
  const metrics = Metrics.all();
  const opts = (sel) => '<option value="">Valor manual</option>' + metrics.map((m) => `<option value="${esc(m.id)}"${m.id === sel ? ' selected' : ''}>KPI: ${esc(m.name)}</option>`).join('');
  $('#krList').innerHTML = view.okrKrs
    .map(
      (k, i) => `<div class="kr-edit" data-kr="${i}">
        <input class="input" data-k="text" value="${esc(k.text)}" placeholder="Resultado-chave mensurável" maxlength="200">
        <div class="kr-edit-nums">
          <label><span>Início</span><input type="number" step="any" class="input input-sm" data-k="start" value="${k.start ?? 0}"></label>
          <label><span>Meta</span><input type="number" step="any" class="input input-sm" data-k="target" value="${k.target ?? ''}"></label>
          <label><span>Atual</span><input type="number" step="any" class="input input-sm" data-k="current" value="${k.current ?? ''}"${k.kpiId ? ' disabled' : ''}></label>
          <label class="kr-link"><span>Medir por</span><select class="select select-sm" data-k="kpiId">${opts(k.kpiId)}</select></label>
          <button type="button" class="icon-btn" data-kr-remove="${i}" aria-label="Remover">×</button>
        </div>
      </div>`
    )
    .join('');
}

function openOkrDialog(id) {
  const o = id ? Okrs.get(id) : null;
  view.editingOkr = o ? o.id : null;
  const f = $('#okrForm');
  f.reset();
  $('#okrDialogTitle').textContent = o ? 'Editar OKR' : 'Novo OKR';
  const now = new Date();
  const qs = [-1, 0, 1, 2].map((n) => C.quarterOf(new Date(now.getFullYear(), now.getMonth() + n * 3, 1)));
  const cur = o ? o.quarter : (() => { const [y, m] = (view.month || ymOf(now)).split('-').map(Number); return y + '-Q' + (Math.floor((m - 1) / 3) + 1); })();
  if (!qs.includes(cur)) qs.unshift(cur);
  fillSelect(f.oQuarter, qs.map((q) => ({ id: q, name: q.replace('-', ' · ') })), cur);
  fillSelect(f.oPillar, C.PILLARS, o ? o.pillar : 'comunidade');
  f.oObjective.value = o ? o.objective : '';
  view.okrKrs = o ? o.krs.map((k) => Object.assign({}, k)) : [{ id: C.uid(), text: '', start: 0, target: null, current: null, kpiId: null }];
  renderKrEditor();
  $('#okrDelete').hidden = !o;
  $('#okrDialog').showModal();
  setTimeout(() => f.oObjective.focus(), 30);
}

function readKrs() {
  return $$('#krList .kr-edit').map((el, i) => {
    const g = (k) => el.querySelector(`[data-k="${k}"]`).value;
    return { id: view.okrKrs[i].id, text: g('text').trim(), start: g('start'), target: g('target'), current: g('current'), kpiId: g('kpiId') || null };
  });
}

async function submitOkr(e) {
  e.preventDefault();
  const f = $('#okrForm');
  const objective = f.oObjective.value.trim();
  if (!objective) return f.oObjective.focus();
  await Okrs.save({ id: view.editingOkr || undefined, quarter: f.oQuarter.value, pillar: f.oPillar.value, objective, krs: readKrs() });
  $('#okrDialog').close();
  H.toast('OKR salvo');
}

function openBillDialog(id) {
  const b = id ? Bills.get(id) : null;
  view.editingBill = b ? b.id : null;
  const f = $('#billForm');
  f.reset();
  $('#billDialogTitle').textContent = b ? 'Editar NF' : 'Nova NF';
  const v = b || { competence: view.closeMonth || ymOf(new Date()) };
  f.bSupplier.value = v.supplier || '';
  f.bNumber.value = v.number || '';
  f.bAmount.value = b ? b.amount : '';
  f.bIssue.value = v.issueDate || '';
  f.bDue.value = v.dueDate || '';
  f.bCompetence.value = v.competence || '';
  f.bNf.checked = !!v.nfOk;
  f.bXml.checked = !!v.xmlOk;
  f.bSent.value = v.sentAt || '';
  f.bScheduled.value = v.scheduledFor || '';
  f.bPaid.value = v.paidAt || '';
  f.bLink.value = v.link || '';
  f.bNotes.value = v.notes || '';
  const sup = [...new Set(Bills.all().map((x) => x.supplier).filter(Boolean))];
  $('#suppliersList').innerHTML = sup.map((s) => `<option value="${esc(s)}"></option>`).join('');
  $('#billDelete').hidden = !b;
  $('#billDialog').showModal();
  setTimeout(() => f.bSupplier.focus(), 30);
}

async function submitBill(e) {
  e.preventDefault();
  const f = $('#billForm');
  const supplier = f.bSupplier.value.trim();
  if (!supplier) return f.bSupplier.focus();
  await Bills.save({
    id: view.editingBill || undefined,
    supplier,
    number: f.bNumber.value.trim(),
    amount: f.bAmount.value,
    issueDate: f.bIssue.value || null,
    dueDate: f.bDue.value || null,
    competence: f.bCompetence.value || (f.bIssue.value ? f.bIssue.value.slice(0, 7) : null),
    nfOk: f.bNf.checked,
    xmlOk: f.bXml.checked,
    sentAt: f.bSent.value || null,
    scheduledFor: f.bScheduled.value || null,
    paidAt: f.bPaid.value || null,
    link: f.bLink.value.trim(),
    notes: f.bNotes.value.trim(),
  });
  $('#billDialog').close();
  H.toast(view.editingBill ? 'NF atualizada' : 'NF cadastrada');
}

// -----------------------------------------------------------------------------
// Eventos
// -----------------------------------------------------------------------------
async function onAction(action, el) {
  const metricId = el.closest('[data-metric-id]') && el.closest('[data-metric-id]').dataset.metricId;
  const okrId = el.closest('[data-okr-id]') && el.closest('[data-okr-id]').dataset.okrId;
  const billId = el.closest('[data-bill-id]') && el.closest('[data-bill-id]').dataset.billId;
  const today = C.toDateKey(new Date());
  switch (action) {
    case 'month':
      view.month = addMonths(view.month || defaultMonth(), Number(el.dataset.step));
      return H.render();
    case 'close-month':
      view.closeMonth = addMonths(view.closeMonth, Number(el.dataset.step));
      return H.render();
    case 'toggle-entry':
      view.entry = !view.entry;
      return H.render();
    case 'load-catalog': {
      const n = await Metrics.loadCatalog();
      return H.toast(n ? `${n} indicadores carregados. Defina as metas clicando no nome de cada um.` : 'Os indicadores recomendados já estão no painel.');
    }
    case 'new-metric':
      return openMetricDialog();
    case 'edit-metric':
      return openMetricDialog(metricId);
    case 'new-okr':
      return openOkrDialog();
    case 'edit-okr':
      return openOkrDialog(okrId);
    case 'new-bill':
      return openBillDialog();
    case 'edit-bill':
      return openBillDialog(billId);
    case 'bill-toggle': {
      const b = Bills.get(billId);
      return Bills.save({ id: billId, [el.dataset.field]: !b[el.dataset.field] });
    }
    case 'bill-sent':
      await Bills.save({ id: billId, sentAt: today });
      return H.toast('Marcada como enviada. Agende o pagamento quando o financeiro confirmar.');
    case 'bill-paid':
      await Bills.save({ id: billId, paidAt: today });
      return H.toast('NF paga', { label: 'Desfazer', fn: () => Bills.save({ id: billId, paidAt: null }) });
    case 'copy-closing': {
      const { subject, body } = closingText(view.closeMonth);
      return H.copy(subject + '\n\n' + body, 'Resumo copiado. Cole no e-mail ou no WhatsApp do financeiro.');
    }
    case 'mark-sent': {
      const list = Bills.all().filter((b) => b.competence === view.closeMonth && b.nfOk && b.xmlOk && !b.sentAt);
      for (const b of list) await Bills.save({ id: b.id, sentAt: today });
      return H.toast(`${list.length} ${list.length === 1 ? 'NF marcada' : 'NFs marcadas'} como enviadas`);
    }
  }
}

export function initB2C(helpers) {
  H = helpers;
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const el = e.target.closest('[data-b2c]');
    if (el) onAction(el.dataset.b2c, el);
  });
  document.addEventListener('change', async (e) => {
    const v = e.target.closest('[data-metric-value]');
    if (v) {
      await Metrics.setValue(v.dataset.metricValue, view.month, v.value);
      return;
    }
    const sch = e.target.closest('[data-bill-schedule]');
    if (sch && sch.value) {
      const id = sch.closest('[data-bill-id]').dataset.billId;
      await Bills.save({ id, scheduledFor: sch.value });
      H.toast('Pagamento agendado para ' + dateBr(sch.value));
    }
  });

  $('#metricForm').addEventListener('submit', submitMetric);
  $('#metricDelete').addEventListener('click', async () => {
    const m = Metrics.get(view.editingMetric);
    if (!m) return;
    const ok = await H.confirmDialog({ title: 'Excluir indicador?', message: `“${m.name}” e todo o histórico de valores serão apagados.`, confirmLabel: 'Excluir' });
    if (!ok) return;
    await Metrics.remove(m.id);
    $('#metricDialog').close();
    H.toast('Indicador excluído');
  });

  $('#okrForm').addEventListener('submit', submitOkr);
  $('#krAdd').addEventListener('click', () => {
    view.okrKrs = readKrs();
    if (view.okrKrs.length >= 8) return;
    view.okrKrs.push({ id: C.uid(), text: '', start: 0, target: null, current: null, kpiId: null });
    renderKrEditor();
  });
  $('#krList').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-kr-remove]');
    if (!rm) return;
    view.okrKrs = readKrs();
    view.okrKrs.splice(Number(rm.dataset.krRemove), 1);
    renderKrEditor();
  });
  $('#krList').addEventListener('change', (e) => {
    if (e.target.matches('[data-k="kpiId"]')) {
      view.okrKrs = readKrs();
      renderKrEditor();
    }
  });
  $('#okrDelete').addEventListener('click', async () => {
    const o = Okrs.get(view.editingOkr);
    if (!o) return;
    const ok = await H.confirmDialog({ title: 'Excluir OKR?', message: `“${o.objective}” será apagado.`, confirmLabel: 'Excluir' });
    if (!ok) return;
    await Okrs.remove(o.id);
    $('#okrDialog').close();
    H.toast('OKR excluído');
  });

  $('#billForm').addEventListener('submit', submitBill);
  $('#billForm').addEventListener('change', (e) => {
    const f = $('#billForm');
    if (e.target === f.bIssue && f.bIssue.value && !f.bCompetence.value) f.bCompetence.value = f.bIssue.value.slice(0, 7);
  });
  $('#billDelete').addEventListener('click', async () => {
    const b = Bills.get(view.editingBill);
    if (!b) return;
    const ok = await H.confirmDialog({ title: 'Excluir NF?', message: `A NF ${b.number || ''} de ${b.supplier} será apagada.`, confirmLabel: 'Excluir' });
    if (!ok) return;
    await Bills.remove(b.id);
    $('#billDialog').close();
    H.toast('NF excluída');
  });
}
