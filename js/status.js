/*
 * status.js
 * Status semanal para o gestor: entregas, em andamento, aguardando, riscos,
 * próxima semana e indicadores do mês, montado das tarefas e do Painel.
 * Copiar, WhatsApp, e-mail ou deixar a IA reescrever em tom executivo.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';
import { Metrics, fmt, defaultMonth } from './b2c.js';

const C = window.Core;
let H = null;
export const view = { offset: 0 }; // 0 = semana atual, -1 = anterior

function range() {
  const mon = C.addDays(C.weekStart(new Date()), view.offset * 7);
  return { mon, sun: C.addDays(mon, 6), nextSun: C.addDays(mon, 13) };
}
const dm = (k) => C.fromDateKey(k).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function data() {
  const { mon, sun, nextSun } = range();
  const areas = (Sync.central && Sync.central.areas) || [];
  const areaName = (id) => (areas.find((a) => a.id === id) || { name: 'Geral' }).name;
  const all = Tasks.all();
  const today = C.toDateKey(new Date());
  const done = all.filter((t) => t.status === 'done' && t.completedAt && (() => { const d = C.toDateKey(new Date(t.completedAt)); return d >= mon && d <= sun; })());
  const open = all.filter((t) => t.status !== 'done');
  const byArea = {};
  for (const t of done) (byArea[areaName(t.area)] = byArea[areaName(t.area)] || []).push(t);
  const doing = open.filter((t) => t.status === 'doing' || t.focusWeek === mon);
  const waiting = open.filter((t) => t.status === 'waiting');
  const late = open.filter((t) => t.dueDate && t.dueDate < today);
  const next = open.filter((t) => t.dueDate && t.dueDate > sun && t.dueDate <= nextSun).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const ym = defaultMonth();
  const kpis = Sync.v4()
    ? Metrics.all().filter((m) => m.values && m.values[ym] != null).slice(0, 6).map((m) => ({ name: m.name, value: fmt(m, m.values[ym]), target: m.target != null ? fmt(m, m.target) : null, hit: m.target == null ? null : m.direction === 'down' ? m.values[ym] <= m.target : m.values[ym] >= m.target }))
    : [];
  const ideas = (Sync.ideas || []).filter((x) => !x.deletedAt);
  const tests = ideas.filter((x) => x.status === 'testando');
  const learned = ideas.filter((x) => ['validada', 'descartada'].includes(x.status) && (() => { const d = C.toDateKey(new Date(x.updatedAt)); return d >= mon && d <= sun; })());
  return { mon, sun, done, byArea, doing, waiting, late, next, kpis, tests, learned };
}

/** Scorecard de execução da semana (segunda a domingo, deslocada por offset). */
export function scorecard(offset = view.offset) {
  const mon = C.addDays(C.weekStart(new Date()), offset * 7);
  const sun = C.addDays(mon, 6);
  const today = C.toDateKey(new Date());
  const end = sun < today ? sun : today;
  const inWeek = (k) => k && k >= mon && k <= sun;
  const dayOf = (iso) => (iso ? C.toDateKey(new Date(iso)) : null);
  const all = Tasks.all();
  const dueWeek = all.filter((t) => inWeek(t.dueDate) && t.dueDate <= end);
  const onTime = dueWeek.filter((t) => t.status === 'done' && dayOf(t.completedAt) <= t.dueDate).length;
  const focus = all.filter((t) => t.focusWeek === mon);
  const focusDone = focus.filter((t) => t.status === 'done').length;
  const planned = all.filter((t) => inWeek(t.plannedFor) && t.plannedFor <= end);
  const plannedDone = planned.filter((t) => t.status === 'done' && dayOf(t.completedAt) === t.plannedFor).length;
  const staleWait = all.filter((t) => t.status === 'waiting' && t.waitingSince && t.waitingSince <= C.addDays(end, -5)).length;
  const lateOpen = all.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < end).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const m = [
    { id: 'prazo', name: 'Entregas no prazo', v: pct(onTime, dueWeek.length), detail: `${onTime} de ${dueWeek.length}`, w: 35 },
    { id: 'foco', name: 'Foco da semana cumprido', v: pct(focusDone, focus.length), detail: focus.length ? `${focusDone} de ${focus.length}` : 'foco não definido', w: 25, missing: !focus.length },
    { id: 'plano', name: 'Plano do dia cumprido', v: pct(plannedDone, planned.length), detail: planned.length ? `${plannedDone} de ${planned.length}` : 'sem plano do dia', w: 20, missing: !planned.length },
    { id: 'retorno', name: 'Retornos parados há 5+ dias', v: staleWait, detail: String(staleWait), w: 10, lowerBetter: true },
    { id: 'atraso', name: 'Atrasadas em aberto', v: lateOpen, detail: String(lateOpen), w: 10, lowerBetter: true },
  ];
  // nota de 0 a 100: percentuais valem o próprio valor; contagens perdem 20 pontos por item; sem dado conta como 50
  let score = 0;
  for (const x of m) {
    const s = x.lowerBetter ? Math.max(0, 100 - x.v * 20) : x.missing ? 30 : x.v == null ? 50 : x.v;
    x.score = s;
    score += (s * x.w) / 100;
  }
  score = Math.round(score);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
  const worst = m.slice().sort((a, b) => a.score - b.score)[0];
  const tips = {
    prazo: 'Prazos estão escorregando: no planejamento de segunda, renegocie o que não cabe em vez de deixar vencer.',
    foco: 'Defina as 3 prioridades na segunda (★ Foco) e feche pelo menos 2 até sexta.',
    plano: 'Planeje o dia com 3 a 5 tarefas e encerre o dia: o que não coube vai para amanhã de forma consciente.',
    retorno: 'Retornos parados travam a área: cobre hoje no WhatsApp ou mude o caminho.',
    atraso: 'Faça uma triagem das atrasadas: conclua, reagende, delegue ou apague.',
  };
  const empty = !dueWeek.length && !focus.length && !planned.length;
  return { score, grade, metrics: m, tip: tips[worst.id], mon, sun, empty };
}

export function statusText() {
  const d = data();
  const L = [];
  L.push(`*Status semanal B2C – ${dm(d.mon)} a ${dm(d.sun)}*`, '');
  const sc = scorecard();
  L.push(`Execução da semana: ${sc.score}/100 (${sc.metrics.filter((x) => !x.lowerBetter).map((x) => `${x.name.toLowerCase()} ${x.v == null ? '–' : x.v + '%'}`).join(', ')})`, '');
  L.push(`✅ Entregas (${d.done.length})`);
  if (!d.done.length) L.push('• Nenhuma entrega registrada na semana.');
  for (const [a, list] of Object.entries(d.byArea)) L.push(`${a}:`, ...list.map((t) => `• ${t.title}`));
  if (d.doing.length) L.push('', '🔄 Em andamento', ...d.doing.slice(0, 8).map((t) => `• ${t.title}${t.dueDate ? ` (prazo ${dm(t.dueDate)})` : ''}`));
  if (d.waiting.length) L.push('', '⏳ Aguardando', ...d.waiting.slice(0, 8).map((t) => `• ${t.title}${t.waitingFor || t.owner ? ` – com ${t.waitingFor || t.owner}` : ''}`));
  if (d.late.length) L.push('', '⚠️ Riscos e atrasos', ...d.late.slice(0, 6).map((t) => `• ${t.title} (venceu ${dm(t.dueDate)})`));
  if (d.next.length) L.push('', '📅 Próxima semana', ...d.next.slice(0, 8).map((t) => `• ${dm(t.dueDate)} – ${t.title}`));
  if (d.tests.length || d.learned.length) L.push('', '🧪 Experimentos de growth', ...d.tests.map((x) => `• Testando: ${x.title}`), ...d.learned.map((x) => `• ${x.status === 'validada' ? 'Validado' : 'Não validou'}: ${x.title}${x.result ? ' – ' + x.result : ''}`));
  if (d.kpis.length) L.push('', '📊 Indicadores do mês', ...d.kpis.map((k) => `• ${k.name}: ${k.value}${k.target ? ` (meta ${k.target})` : ''}`));
  return L.join('\n');
}

export function renderStatus() {
  const d = data();
  const sec = (title, items, empty) => `<section class="card status-sec"><h2>${title}</h2>${items.length ? `<ul>${items.join('')}</ul>` : `<p class="hint">${empty}</p>`}</section>`;
  const li = (t, extra = '') => `<li data-id="${esc(t.id)}"><button type="button" class="link-plain" data-action="edit">${esc(t.title)}</button>${extra ? ` <span class="hint">${extra}</span>` : ''}</li>`;
  return `<div class="status-head">
      <div class="seg"><button type="button" class="btn btn-sm" data-status="prev" aria-label="Semana anterior">‹</button><strong>${dm(d.mon)} a ${dm(d.sun)}</strong><button type="button" class="btn btn-sm" data-status="next" ${view.offset >= 0 ? 'disabled' : ''} aria-label="Próxima semana">›</button></div>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-status="copy">Copiar</button><button type="button" class="btn btn-sm" data-status="wa">WhatsApp</button><button type="button" class="btn btn-sm" data-status="mail">E-mail</button><button type="button" class="btn btn-sm btn-primary" data-status="ai">Reescrever com IA</button></div>
    </div>
    ${(() => {
      const sc = scorecard();
      const prev = scorecard(view.offset - 1);
      const diff = sc.score - prev.score;
      return `<section class="card scorecard g-${sc.grade}">
        <div class="sc-head"><span class="sc-grade">${sc.grade}</span><div><strong>Scorecard do dono: ${sc.score}/100</strong><span class="hint">${prev.empty ? 'primeira semana medida' : diff === 0 ? 'igual à semana anterior' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} pontos vs. semana anterior (${prev.score})`}</span></div></div>
        <div class="sc-rows">${sc.metrics.map((x) => `<div class="sc-row"><span>${x.name}</span><span class="sc-bar"><i style="width:${x.score}%;background:${x.score < 50 ? 'var(--danger, #D93036)' : x.score < 75 ? '#E5843A' : 'var(--success, #1F9D55)'}"></i></span><b>${x.lowerBetter ? x.detail : x.v == null ? '–' : x.v + '%'}</b><span class="hint">${x.lowerBetter ? '' : x.detail}</span></div>`).join('')}</div>
        <p class="sc-tip">💡 ${esc(sc.tip)}</p>
      </section>`;
    })()}
    <div class="status-kpis"><span><strong>${d.done.length}</strong> ${d.done.length === 1 ? 'entrega' : 'entregas'}</span><span><strong>${d.doing.length}</strong> em andamento</span><span><strong>${d.waiting.length}</strong> aguardando</span><span class="${d.late.length ? 'is-bad' : ''}"><strong>${d.late.length}</strong> ${d.late.length === 1 ? 'atrasada' : 'atrasadas'}</span></div>
    <div class="status-grid">
      ${sec('✅ Entregas', Object.entries(d.byArea).flatMap(([a, list]) => list.map((t) => li(t, a))), 'Nenhuma tarefa concluída nesta semana.')}
      ${sec('🔄 Em andamento e foco', d.doing.slice(0, 10).map((t) => li(t, t.dueDate ? 'prazo ' + dm(t.dueDate) : '')), 'Nada marcado como em andamento ou foco da semana.')}
      ${sec('⏳ Aguardando', d.waiting.slice(0, 10).map((t) => li(t, t.waitingFor || t.owner || '')), 'Nada aguardando retorno.')}
      ${sec('⚠️ Riscos e atrasos', d.late.slice(0, 10).map((t) => li(t, 'venceu ' + dm(t.dueDate))), 'Sem atrasos. 👏')}
      ${sec('📅 Próxima semana', d.next.slice(0, 10).map((t) => li(t, dm(t.dueDate))), 'Sem prazos na próxima semana.')}
      ${d.tests.length || d.learned.length ? sec('🧪 Experimentos', [...d.tests.map((x) => `<li>Testando: ${esc(x.title)}</li>`), ...d.learned.map((x) => `<li>${x.status === 'validada' ? '✓ Validado' : '✗ Não validou'}: ${esc(x.title)}</li>`)], '') : ''}
      ${d.kpis.length ? sec('📊 Indicadores do mês', d.kpis.map((k) => `<li>${esc(k.name)}: <strong>${esc(k.value)}</strong>${k.target ? ` <span class="hint">meta ${esc(k.target)} ${k.hit ? '✓' : '✗'}</span>` : ''}</li>`), '') : ''}
    </div>`;
}

export function initStatus(helpers) {
  H = helpers;
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const b = e.target.closest('[data-status]');
    if (!b) return;
    const a = b.dataset.status;
    if (a === 'prev' || a === 'next') {
      view.offset = Math.min(0, view.offset + (a === 'prev' ? -1 : 1));
      return H.render();
    }
    const text = statusText();
    if (a === 'copy') return H.copy(text, 'Status copiado');
    if (a === 'wa') return window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    if (a === 'mail') {
      const { mon, sun } = range();
      return (location.href = `mailto:?subject=${encodeURIComponent(`Status semanal B2C – ${dm(mon)} a ${dm(sun)}`)}&body=${encodeURIComponent(text.replace(/\*/g, ''))}`);
    }
    if (a === 'ai') return H.ask(`Reescreva meu status semanal para o meu gestor em tom executivo, curto e direto (máximo 15 linhas): abra com 1 frase de resumo da semana, depois destaques com impacto em receita/torcedor, riscos com o que estou fazendo a respeito e os pedidos/decisões que preciso dele. Não invente números. Dados:\n\n${text}`);
  });
}
