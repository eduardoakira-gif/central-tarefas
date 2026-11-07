/*
 * myday.js
 * Meu dia: plano de hoje (3 a 5 tarefas), o que ficou de ontem, planejamento
 * com IA e o ritual de encerrar o dia. Também a entrada por voz (pt-BR).
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
let H = null;

const today = () => C.toDateKey(new Date());
const live = () => Tasks.all();

export function plannedToday() {
  const d = today();
  return live().filter((t) => t.plannedFor === d);
}
function leftovers() {
  const d = today();
  return live().filter((t) => t.status !== 'done' && t.plannedFor && t.plannedFor < d);
}
const doneToday = () => live().filter((t) => t.status === 'done' && t.completedAt && C.toDateKey(new Date(t.completedAt)) === today());

export function renderDayCard() {
  const plan = plannedToday();
  const left = leftovers();
  const done = plan.filter((t) => t.status === 'done').length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const row = (t) => `<div class="day-row${t.status === 'done' ? ' is-done' : ''}" data-id="${esc(t.id)}">
      <button type="button" class="day-check" data-action="${t.status === 'done' ? 'restore' : 'complete'}" aria-label="${t.status === 'done' ? 'Reabrir' : 'Concluir'}">${t.status === 'done' ? '✓' : ''}</button>
      <button type="button" class="day-title" data-action="edit">${esc(t.title)}</button>
      ${t.status !== 'done' ? '<button type="button" class="icon-btn day-x" data-action="today" title="Tirar do plano de hoje" aria-label="Tirar do plano de hoje">×</button>' : ''}
    </div>`;
  const leftHtml = left.length
    ? `<div class="day-left"><span>${left.length === 1 ? '1 tarefa planejada antes ficou para trás' : left.length + ' tarefas planejadas antes ficaram para trás'}.</span>
        <button type="button" class="btn btn-sm" data-day="bring">Trazer para hoje</button></div>`
    : '';
  if (!plan.length) {
    return `<section class="card day-card">
      <div class="day-head"><div><span class="label">${greet}, Edu</span><strong>Planeje o seu dia</strong></div>
        <button type="button" class="btn btn-sm btn-primary" data-day="plan-ai">Planejar com IA</button></div>
      <p class="hint">Escolha de 3 a 5 tarefas para hoje tocando em ☀ Hoje nos cards, ou deixe a IA sugerir com base em prazos, foco da semana e receita.</p>
      ${leftHtml}
    </section>`;
  }
  const pct = Math.round((done / plan.length) * 100);
  return `<section class="card day-card">
    <div class="day-head"><div><span class="label">${greet}, Edu · plano de hoje</span><strong>${done === plan.length ? 'Plano cumprido 👏' : `${done} de ${plan.length} feitas`}</strong></div>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-day="plan-ai">Replanejar com IA</button><button type="button" class="btn btn-sm btn-primary" data-day="close">Encerrar o dia</button></div></div>
    <span class="kpi-bar day-bar"><i style="width:${pct}%"></i></span>
    <div class="day-list">${plan.sort((a, b) => (a.status === 'done') - (b.status === 'done')).map(row).join('')}</div>
    ${plan.length > 5 ? '<p class="hint">Mais de 5 tarefas no dia costuma virar lista de desejos. Tire o que não é para hoje.</p>' : ''}
    ${leftHtml}
  </section>`;
}

function openClose() {
  const plan = plannedToday();
  const pending = plan.filter((t) => t.status !== 'done');
  const done = doneToday();
  $('#dayCloseBody').innerHTML = `
    <p><strong>${done.length}</strong> ${done.length === 1 ? 'tarefa concluída hoje' : 'tarefas concluídas hoje'}${plan.length ? ` · ${plan.length - pending.length} de ${plan.length} do plano` : ''}.</p>
    ${done.length ? `<ul class="checklist-static">${done.slice(0, 8).map((t) => `<li>${esc(t.title)}</li>`).join('')}</ul>` : ''}
    ${pending.length ? `<div class="field"><span class="label">Ficou para depois (${pending.length})</span>
      ${pending.map((t) => `<label class="check-row"><input type="checkbox" data-move="${esc(t.id)}" checked><span>${esc(t.title)}</span></label>`).join('')}
      <span class="hint">As marcadas vão para o plano de amanhã.</span></div>` : '<p>Plano do dia cumprido. 👏</p>'}
    <label class="field"><span class="label">Aprendizado do dia (vira ideia de post na Marca pessoal)</span>
      <textarea class="input" id="dayLesson" rows="3" placeholder="Ex.: descobri que o torcedor responde mais quando a mensagem vem de um jogador do que da marca."></textarea></label>`;
  $('#dayDialog').showModal();
}

async function submitClose(e) {
  e.preventDefault();
  const tomorrow = C.addDays(today(), 1);
  const moves = Array.from(document.querySelectorAll('#dayCloseBody [data-move]')).filter((x) => x.checked).map((x) => x.dataset.move);
  for (const id of moves) await Tasks.update(id, { plannedFor: tomorrow });
  const lesson = ($('#dayLesson') || {}).value || '';
  if (lesson.trim() && Sync.v4()) {
    await Sync.upsert('posts', C.normalizePost({ title: 'Aprendizado: ' + lesson.trim().slice(0, 90), text: lesson.trim(), network: 'linkedin', pillar: 'carreira', status: 'ideia', date: C.addDays(today(), 1), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  }
  $('#dayDialog').close();
  H.toast(moves.length ? `Dia encerrado. ${moves.length} ${moves.length === 1 ? 'tarefa foi' : 'tarefas foram'} para amanhã.` : 'Dia encerrado. Bom descanso!');
}

// -----------------------------------------------------------------------------
// Voz (Web Speech API, pt-BR)
// -----------------------------------------------------------------------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;
export function micButton(target, label = 'Falar') {
  if (!SR) return '';
  return `<button type="button" class="icon-btn mic-btn" data-mic="${target}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>`;
}
let rec = null;
function listen(btn) {
  const input = document.getElementById(btn.dataset.mic);
  if (!input) return;
  if (rec) {
    rec.stop();
    return;
  }
  rec = new SR();
  rec.lang = 'pt-BR';
  rec.interimResults = true;
  rec.continuous = false;
  const base = input.value ? input.value.trim() + ' ' : '';
  btn.classList.add('is-on');
  rec.onresult = (ev) => {
    let txt = '';
    for (const r of ev.results) txt += r[0].transcript;
    input.value = base + txt;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = (ev) => {
    if (ev.error === 'not-allowed') H.toast('Permita o microfone para ditar.');
  };
  rec.onend = () => {
    btn.classList.remove('is-on');
    rec = null;
    input.focus();
  };
  rec.start();
}

export function initMyDay(helpers) {
  H = helpers;
  // microfone na captura rápida
  const qf = $('#quickForm');
  if (qf && SR && !qf.querySelector('.mic-btn')) $('#quickBtn').insertAdjacentHTML('beforebegin', micButton('quickInput', 'Ditar tarefa'));
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const m = e.target.closest('[data-mic]');
    if (m) return listen(m);
    const d = e.target.closest('[data-day]');
    if (!d) return;
    const a = d.dataset.day;
    if (a === 'close') return openClose();
    if (a === 'bring') {
      const list = leftovers();
      for (const t of list) await Tasks.update(t.id, { plannedFor: today() });
      return H.toast(`${list.length} ${list.length === 1 ? 'tarefa trazida' : 'tarefas trazidas'} para hoje`);
    }
    if (a === 'plan-ai') return H.ask('Planeje meu dia: escolha de 3 a 5 tarefas para hoje (use propor_acoes com a ação "hoje"), em ordem, com o motivo de cada uma. Priorize atrasadas, foco da semana e o que gera receita. Se algo deveria ser adiado ou delegado, proponha também.');
  });
  $('#dayForm').addEventListener('submit', submitClose);
}
