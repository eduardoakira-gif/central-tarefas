/*
 * board.js
 * Relatório mensal da diretoria (comparativo do mês x mês anterior x meta,
 * OKRs, financeiro, CRM, entregas, funil e decisões pedidas) e a cobrança da
 * equipe por WhatsApp.
 */
import { Sync } from './sync.js';
import { esc } from './ui.js';
import { fmt, monthLabel } from './b2c.js';
import { waUrl, logNudge, personOf } from './team.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const kv = { get: (k) => C.idb.get('kv', k), set: (k, v) => C.idb.put('kv', v, k) };
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PILLARS = ['geral', 'comunidade', 'inferno', 'socio', 'merchan', 'kings', 'crm'];

let H = null;
export const view = { month: null, decisions: '', loadedFor: null };

const ymOf = (d) => C.toDateKey(d).slice(0, 7);
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + n, 1));
}

function metricLine(m, ym) {
  const v = m.values[ym];
  const p = m.values[addMonths(ym, -1)];
  let delta = '';
  if (v != null && p != null && p !== 0) {
    const d = ((v - p) / Math.abs(p)) * 100;
    const good = m.direction === 'down' ? d < 0 : d > 0;
    delta = `<span class="delta ${d === 0 ? '' : good ? 'is-good' : 'is-bad'}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${nf.format(Math.abs(d))}%</span>`;
  }
  let meta = '';
  if (m.target != null && v != null) {
    const ok = m.direction === 'down' ? v <= m.target : v >= m.target;
    meta = `<span class="${ok ? 'is-good' : 'is-bad'}">${ok ? '✓' : '✗'} ${fmt(m, m.target, true)}</span>`;
  }
  return { html: `<tr><td>${esc(m.name)}</td><td>${fmt(m, v, true)}</td><td>${fmt(m, p, true)}</td><td>${delta}</td><td>${meta}</td></tr>`, v, p, m };
}

function data(ym) {
  const metrics = Sync.metrics.filter((m) => !m.deletedAt);
  const [y, mo] = ym.split('-').map(Number);
  const start = new Date(y, mo - 1, 1).getTime();
  const end = new Date(y, mo, 1).getTime();
  const inMonth = (iso) => iso && Date.parse(iso) >= start && Date.parse(iso) < end;
  const done = Sync.tasks.filter((t) => !t.deletedAt && t.status === 'done' && inMonth(t.completedAt));
  const areas = Sync.central.areas;
  const q = y + '-Q' + (Math.floor((mo - 1) / 3) + 1);
  const okrs = Sync.okrs.filter((o) => !o.deletedAt && o.quarter === q);
  const bills = Sync.bills.filter((b) => !b.deletedAt && b.competence === ym);
  const camps = Sync.campaigns.filter((c) => !c.deletedAt && c.date.slice(0, 7) === ym);
  return { metrics, done, areas, okrs, bills, camps, q };
}

export function boardText(ym) {
  const d = data(ym);
  const lines = [`RELATÓRIO B2C · ${monthLabel(ym).toUpperCase()}`, ''];
  for (const pid of PILLARS) {
    const list = d.metrics.filter((m) => m.pillar === pid && (m.values[ym] != null || m.target != null));
    if (!list.length) continue;
    lines.push(C.PILLAR_MAP[pid].name.toUpperCase());
    for (const m of list) {
      const v = m.values[ym];
      const p = m.values[addMonths(ym, -1)];
      const d2 = v != null && p ? ` (${v >= p ? '+' : ''}${nf.format(((v - p) / Math.abs(p)) * 100)}% vs mês anterior)` : '';
      lines.push(`- ${m.name}: ${fmt(m, v, true)}${d2}${m.target != null ? ` | meta ${fmt(m, m.target, true)}` : ''}`);
    }
    lines.push('');
  }
  if (d.okrs.length) {
    lines.push(`OKRs ${d.q}`);
    for (const o of d.okrs) {
      const pr = o.krs.map((k) => C.krProgress(k, d.metrics).pct).filter((x) => x != null);
      lines.push(`- ${o.objective}: ${pr.length ? Math.round((pr.reduce((a, b) => a + b, 0) / pr.length) * 100) + '%' : 'sem medição'}`);
    }
    lines.push('');
  }
  lines.push(`ENTREGAS DO MÊS: ${d.done.length} demandas concluídas`);
  if (d.bills.length) lines.push(`MERCHAN · NFs do mês: ${d.bills.length} (${brl.format(d.bills.reduce((a, b) => a + (b.amount || 0), 0))}), ${d.bills.filter((b) => b.paidAt).length} pagas`);
  if (d.camps.length) {
    const del = d.camps.reduce((a, c) => a + c.delivered, 0);
    lines.push(`CRM · ${d.camps.length} envios, abertura ${del ? nf.format((d.camps.reduce((a, c) => a + c.opens, 0) / del) * 100) : '–'}%, clique ${del ? nf.format((d.camps.reduce((a, c) => a + c.clicks, 0) / del) * 100) : '–'}%`);
  }
  if (view.decisions.trim()) lines.push('', 'DECISÕES E PEDIDOS PARA A DIRETORIA', view.decisions.trim());
  return lines.join('\n');
}

export function renderBoard() {
  if (!view.month) view.month = new Date().getDate() <= 15 ? addMonths(ymOf(new Date()), -1) : ymOf(new Date());
  const ym = view.month;
  const d = data(ym);
  const sections = PILLARS.map((pid) => {
    const list = d.metrics.filter((m) => m.pillar === pid && (m.values[ym] != null || m.values[addMonths(ym, -1)] != null || m.target != null));
    if (!list.length) return '';
    const rows = list.map((m) => metricLine(m, ym));
    const withTarget = rows.filter((r) => r.m.target != null && r.v != null);
    const ok = withTarget.filter((r) => (r.m.direction === 'down' ? r.v <= r.m.target : r.v >= r.m.target)).length;
    return `<section class="card report-card board-sec" style="--area:${C.PILLAR_MAP[pid].color}">
      <h2><i class="pillar-dot"></i> ${esc(C.PILLAR_MAP[pid].name)} ${withTarget.length ? `<span class="hint">· ${ok} de ${withTarget.length} indicadores na meta</span>` : ''}</h2>
      <div class="table-wrap"><table class="board-table"><thead><tr><th>Indicador</th><th>${esc(monthLabel(ym).split(' ')[0])}</th><th>Mês anterior</th><th>Variação</th><th>Meta</th></tr></thead>
      <tbody>${rows.map((r) => r.html).join('')}</tbody></table></div>
    </section>`;
  }).join('');
  const byArea = d.areas.map((a) => ({ a, n: d.done.filter((t) => t.area === a.id).length })).filter((x) => x.n);
  const okrHtml = d.okrs.length
    ? d.okrs.map((o) => {
        const pr = o.krs.map((k) => C.krProgress(k, d.metrics).pct).filter((x) => x != null);
        const pct = pr.length ? pr.reduce((a, b) => a + b, 0) / pr.length : null;
        return `<li><strong>${esc(o.objective)}</strong> · ${pct == null ? 'sem medição' : Math.round(pct * 100) + '%'} <span class="hint">(esperado ${Math.round(C.quarterElapsed(o.quarter) * 100)}%)</span></li>`;
      }).join('')
    : '<li class="hint">Nenhum OKR neste trimestre.</li>';
  return `<div class="panel-bar">
      <div class="month-nav">
        <button type="button" class="icon-btn" data-board-month="-1" aria-label="Mês anterior">‹</button>
        <strong>${monthLabel(ym)}</strong>
        <button type="button" class="icon-btn" data-board-month="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="btn-row">
        <button type="button" class="btn" data-board="copy">Copiar resumo</button>
        <button type="button" class="btn" data-board="print">Imprimir / PDF</button>
        <button type="button" class="btn btn-primary" data-board="ai">Preparar apresentação com IA</button>
      </div>
    </div>
    ${sections || '<p class="notice">Lance os indicadores do mês no Painel B2C para montar o relatório.</p>'}
    <section class="card report-card">
      <h2>OKRs do ${esc(d.q.slice(-2))}</h2><ul class="owner-list board-okrs">${okrHtml}</ul>
    </section>
    <section class="card report-card">
      <h2>Entregas do mês: ${d.done.length} demandas concluídas</h2>
      ${byArea.length ? `<ul class="owner-list">${byArea.map((x) => `<li><span>${esc(x.a.name)}</span><strong>${x.n}</strong></li>`).join('')}</ul>` : '<p class="hint">Nenhuma demanda concluída neste mês.</p>'}
    </section>
    <section class="card report-card">
      <h2>Decisões e pedidos para a diretoria</h2>
      <textarea class="input" id="boardDecisions" rows="5" placeholder="Ex.: aprovar orçamento da caravana de dezembro; validar preço do plano Inferno no sócio; definir responsável pelo XML das NFs.">${esc(view.decisions)}</textarea>
      <p class="hint">Diretoria quer decisão, não só número: termine sempre com o que você precisa que eles aprovem. Fica salvo neste aparelho, por mês.</p>
    </section>`;
}

async function loadDecisions() {
  if (view.loadedFor === view.month) return;
  view.loadedFor = view.month;
  view.decisions = (await kv.get(`board:${Sync.id}:${view.month}`)) || '';
  H.render();
}

export function openBoard() {
  if (!view.month) renderBoard();
  loadDecisions();
}

// -----------------------------------------------------------------------------
// Cobrança da equipe (WhatsApp)
// -----------------------------------------------------------------------------
export function teamFollowUps(now = new Date()) {
  const today = C.toDateKey(now);
  const map = new Map();
  for (const t of Sync.tasks) {
    if (t.deletedAt || t.status === 'done' || !t.owner) continue;
    const late = t.dueDate && t.dueDate < today;
    const soon = t.dueDate && t.dueDate <= C.addDays(today, 2);
    if (!late && !soon && t.priority !== 'urgent') continue;
    const k = t.owner.trim();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ t, late });
  }
  return [...map.entries()].map(([owner, items]) => ({ owner, items }));
}

export function renderTeamCard() {
  const list = teamFollowUps();
  if (!list.length) return '';
  return `<section class="card team-card">
    <div class="owner-head"><strong>Cobrar a equipe</strong><a class="link-btn" href="#/equipe">Ver equipe e 1:1</a></div>
    <span class="hint">Prazos vencidos, próximos 2 dias e urgentes.</span>
    ${list.map(({ owner, items }) => `<div class="team-row"><span><strong>${esc(owner)}</strong> · ${items.length} ${items.length === 1 ? 'demanda' : 'demandas'}${items.some((x) => x.late) ? ' <span class="badge badge-overdue">atrasada</span>' : ''}</span>
      <button type="button" class="btn btn-sm" data-team-wa="${esc(owner)}">Cobrar no WhatsApp</button></div>`).join('')}
    ${list.some(({ owner }) => !(personOf(owner) || {}).phone) ? '<p class="hint">Cadastre o WhatsApp da equipe em Configurações › Equipe para abrir a conversa direto com a pessoa.</p>' : ''}
  </section>`;
}

function waText(owner) {
  const today = C.toDateKey(new Date());
  const items = (teamFollowUps().find((x) => x.owner === owner) || { items: [] }).items;
  const lines = items.map(({ t, late }) => `• ${t.title}${t.dueDate ? ` (${late ? 'venceu' : 'vence'} ${C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR')})` : ''}`);
  const first = owner.split(' ')[0];
  return `Fala, ${first}! Passando para alinhar as demandas:\n\n${lines.join('\n')}\n\nComo estão? Se algo travou, me fala hoje que a gente destrava junto. Se precisar de novo prazo, me passa a data que você consegue entregar.`;
}

export function initBoard(helpers) {
  H = helpers;
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const m = e.target.closest('[data-board-month]');
    if (m) {
      view.month = addMonths(view.month, Number(m.dataset.boardMonth));
      H.render();
      return loadDecisions();
    }
    const b = e.target.closest('[data-board]');
    if (b) {
      const a = b.dataset.board;
      if (a === 'copy') return H.copy(boardText(view.month), 'Resumo copiado. Cole no e-mail, no WhatsApp ou na apresentação.');
      if (a === 'print') return window.print();
      if (a === 'ai')
        return H.ask(`Prepare minha apresentação da reunião mensal de diretoria de ${monthLabel(view.month)} com visão de dono e de marketing. Estrutura: 1) resumo executivo em 3 frases; 2) o que foi bem e o que foi mal por pilar, com os números (mês x mês anterior x meta); 3) causas e o que vou fazer; 4) decisões e pedidos para a diretoria. Linguagem de diretoria, curta e direta. Use estes dados:\n\n${boardText(view.month)}`);
    }
    const w = e.target.closest('[data-team-wa]');
    if (w) {
      const owner = w.dataset.teamWa;
      const items = (teamFollowUps().find((x) => x.owner === owner) || { items: [] }).items;
      window.open(waUrl(owner, waText(owner)), '_blank');
      await logNudge(items.map((x) => x.t.id));
      H.toast(`Cobrança registrada em ${items.length === 1 ? '1 tarefa' : items.length + ' tarefas'}. Próxima cobrança em 2 dias úteis.`);
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'boardDecisions') return;
    view.decisions = e.target.value;
    clearTimeout(view._t);
    view._t = setTimeout(() => kv.set(`board:${Sync.id}:${view.month}`, view.decisions), 400);
  });
}
