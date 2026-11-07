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

/** Dias seguidos (úteis) em que alguma tarefa do plano foi concluída no próprio dia. */
export function streak() {
  const days = new Set(Tasks.all().filter((t) => t.status === 'done' && t.plannedFor && t.completedAt && C.toDateKey(new Date(t.completedAt)) === t.plannedFor).map((t) => t.plannedFor));
  let d = today();
  if (!days.has(d)) d = C.addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 120; i++) {
    if (days.has(d)) n++;
    else if (![0, 6].includes(C.fromDateKey(d).getDay())) break;
    d = C.addDays(d, -1);
  }
  return n;
}

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
  const st = streak();
  return `<section class="card day-card">
    <div class="day-head"><div><span class="label">${greet}, Edu · plano de hoje</span><strong>${done === plan.length ? 'Plano cumprido 👏' : `${done} de ${plan.length} feitas`}</strong></div>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-day="plan-ai">Replanejar com IA</button><button type="button" class="btn btn-sm btn-primary" data-day="close">Encerrar o dia</button></div></div>
    <span class="kpi-bar day-bar"><i style="width:${pct}%"></i></span>
    ${st >= 2 ? `<span class="day-streak">🔥 ${st} dias úteis seguidos cumprindo o plano</span>` : ''}
    <div class="day-list">${plan.sort((a, b) => (a.status === 'done') - (b.status === 'done')).map(row).join('')}</div>
    ${plan.length > 5 ? '<p class="hint">Mais de 5 tarefas no dia costuma virar lista de desejos. Tire o que não é para hoje.</p>' : ''}
    ${leftHtml}
  </section>`;
}

export function openClose() {
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
    let hf = false;
    try { hf = localStorage.getItem('ct-voice-chat') === '1'; } catch {}
    if (input.id === 'chatInput' && hf && input.value.trim() && document.getElementById('chatForm')) return document.getElementById('chatForm').requestSubmit();
    input.focus();
  };
  rec.start();
}

const PLAN_PROMPT = 'Planeje meu dia: escolha de 3 a 5 tarefas para hoje (use propor_acoes com a ação "hoje"), em ordem, com o motivo de cada uma. Priorize atrasadas, foco da semana e o que gera receita. Se algo deveria ser adiado, delegado para alguém da equipe ou já está concluído, proponha também.';
export const planDay = () => H.ask(PLAN_PROMPT);

// -----------------------------------------------------------------------------
// Compartilhar de outro app (Android): link, texto ou notícia vira tarefa,
// ideia de post ou pergunta para a IA.
// -----------------------------------------------------------------------------
const SHARE_KEY = 'ct-share';
export function captureShare() {
  const sp = new URLSearchParams(location.search);
  const data = { title: sp.get('title') || '', text: sp.get('text') || '', url: sp.get('url') || '' };
  if (!data.title && !data.text && !data.url) return false;
  // alguns apps mandam o link dentro do texto
  if (!data.url) {
    const m = data.text.match(/https?:\/\/\S+/);
    if (m) {
      data.url = m[0];
      data.text = data.text.replace(m[0], '').trim();
    }
  }
  try {
    sessionStorage.setItem(SHARE_KEY, JSON.stringify(data));
  } catch {}
  ['title', 'text', 'url'].forEach((k) => sp.delete(k));
  const q = sp.toString();
  history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  return true;
}
let shared = null;
export function consumeShare() {
  try {
    shared = JSON.parse(sessionStorage.getItem(SHARE_KEY) || 'null');
    sessionStorage.removeItem(SHARE_KEY);
  } catch {
    shared = null;
  }
  if (!shared) return;
  const title = shared.title || shared.text.split('\n')[0].slice(0, 140) || shared.url;
  $('#shareBody').innerHTML = `<p class="share-preview"><strong>${esc(title)}</strong>${shared.text && shared.text !== title ? `<span>${esc(shared.text.slice(0, 280))}</span>` : ''}${shared.url ? `<a href="${esc(shared.url)}" target="_blank" rel="noopener">${esc(shared.url.slice(0, 80))}</a>` : ''}</p>
    <div class="share-options">
      <button type="button" class="btn" data-share="task"><strong>Virar tarefa</strong><span>com o link anexado</span></button>
      ${(shared.text || '').length > 60 ? '<button type="button" class="btn" data-share="many"><strong>Separar várias tarefas</strong><span>a IA lê a mensagem e lista as demandas</span></button>' : ''}
      <button type="button" class="btn" data-share="ai"><strong>Analisar com a IA</strong><span>o que isso muda para o B2C</span></button>
      <button type="button" class="btn" data-share="post"><strong>Ideia de post</strong><span>vai para a Marca pessoal</span></button>
    </div>`;
  $('#shareDialog').showModal();
}
async function onShare(kind) {
  const s = shared;
  if (!s) return;
  $('#shareDialog').close();
  const title = (s.title || s.text.split('\n')[0] || 'Link compartilhado').slice(0, 200);
  if (kind === 'many') return H.extract([s.title, s.text, s.url].filter(Boolean).join('\n'), 'Mensagem compartilhada');
  if (kind === 'task') return H.openTaskDialog({ title, link: s.url, description: s.text && s.text !== title ? s.text : '' });
  if (kind === 'ai') return H.ask(`Compartilhei isto com você: "${title}"${s.text && s.text !== title ? `\n\n${s.text.slice(0, 1500)}` : ''}${s.url ? `\n\nLink: ${s.url}` : ''}\n\nComo dono do B2C do Fluxo W7M: o que isso significa, o que eu copio ou testo, e qual a próxima ação concreta? Se valer uma tarefa, sugira.`);
  if (kind === 'post') {
    if (!Sync.v4()) return H.toast('O servidor ainda está atualizando. Tente de novo em instantes.');
    await Sync.upsert('posts', C.normalizePost({ title: 'Ideia: ' + title.slice(0, 180), text: [s.text, s.url].filter(Boolean).join('\n\n'), network: 'linkedin', pillar: 'caso', status: 'ideia', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    return H.toast('Ideia salva na Marca pessoal');
  }
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
    if (a === 'plan-ai') return planDay();
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-share]');
    if (b) onShare(b.dataset.share);
  });
  $('#dayForm').addEventListener('submit', submitClose);
}
