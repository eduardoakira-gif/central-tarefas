/*
 * team-view.js
 * Equipe e 1:1: uma visão por pessoa (o que está com ela, atrasos, entregas
 * dos últimos 14 dias, conversas anteriores) e a pauta da 1:1 pronta.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { Notes } from './notes.js';
import { esc } from './ui.js';
import { personOf, waUrl } from './team.js';

const C = window.Core;
let H = null;
export const view = { person: null };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const dm = (k) => C.fromDateKey(k).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function peopleList() {
  const names = new Map();
  ((Sync.central && Sync.central.people) || []).forEach((p) => names.set(fold(p.name), p.name));
  Tasks.all().forEach((t) => t.owner && !names.has(fold(t.owner)) && names.set(fold(t.owner), t.owner));
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
}
function isOf(t, name) {
  const n = fold(name);
  return fold(t.owner) === n || fold(t.waitingFor) === n || (fold(t.owner).split(' ')[0] === n.split(' ')[0] && n.length > 2);
}
function dataOf(name) {
  const today = C.toDateKey(new Date());
  const since = Date.now() - 14 * 86400000;
  const mine = Tasks.all().filter((t) => isOf(t, name));
  const open = mine.filter((t) => t.status !== 'done').sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const late = open.filter((t) => t.dueDate && t.dueDate < today);
  const done = mine.filter((t) => t.status === 'done' && t.completedAt && Date.parse(t.completedAt) > since);
  const first = fold(name).split(' ')[0];
  const notes = (Sync.notes || []).filter((n) => !n.deletedAt && fold(n.participants + ' ' + n.title).includes(first)).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
  return { open, late, done, notes };
}

function agenda(name) {
  const d = dataOf(name);
  const first = name.split(' ')[0];
  const L = [`Pauta 1:1 com ${first} – ${new Date().toLocaleDateString('pt-BR')}`, ''];
  let i = 0;
  const h = (txt) => `${++i}. ${txt}`;
  L.push(h('Como você está? O que está tomando mais energia?'));
  if (d.done.length) L.push('', h('Reconhecer (últimos 14 dias):'), ...d.done.slice(0, 5).map((t) => `• ${t.title}`));
  if (d.late.length) L.push('', h('Destravar atrasos:'), ...d.late.map((t) => `• ${t.title} (venceu ${dm(t.dueDate)}) – o que travou? novo prazo?`));
  const rest = d.open.filter((t) => !d.late.includes(t)).slice(0, 6);
  if (rest.length) L.push('', h('Próximas entregas:'), ...rest.map((t) => `• ${t.title}${t.dueDate ? ` (${dm(t.dueDate)})` : ' (sem prazo: definir)'}`));
  L.push('', h('O que você precisa de mim?'), h('Desenvolvimento: uma coisa para aprender ou testar nas próximas 2 semanas.'));
  return L.join('\n');
}

export function renderTeam() {
  const ppl = peopleList();
  if (!ppl.length) return '<p class="notice">Cadastre a equipe em Configurações › Equipe ou coloque responsáveis nas tarefas.</p>';
  if (view.person && !ppl.includes(view.person)) view.person = null;
  const cards = ppl.map((name) => {
    const d = dataOf(name);
    const sel = view.person === name;
    return `<button type="button" class="card person-card${sel ? ' is-sel' : ''}${d.late.length ? ' has-late' : ''}" data-tv-person="${esc(name)}">
      <strong>${esc(name)}</strong>
      <span>${d.open.length} em aberto${d.late.length ? ` · <b>${d.late.length} atrasada${d.late.length > 1 ? 's' : ''}</b>` : ''} · ${d.done.length} entregue${d.done.length === 1 ? '' : 's'} em 14 dias</span>
    </button>`;
  });
  let detail = '';
  if (view.person) {
    const name = view.person;
    const d = dataOf(name);
    const today = C.toDateKey(new Date());
    const li = (t) => `<li data-id="${esc(t.id)}"><button type="button" class="link-plain" data-action="edit">${esc(t.title)}</button> <span class="hint">${t.status === 'waiting' ? 'aguardando · ' : ''}${t.dueDate ? (t.dueDate < today ? 'venceu ' : '') + dm(t.dueDate) : 'sem prazo'}</span></li>`;
    detail = `<section class="card tv-detail">
      <div class="owner-head"><strong>${esc(name)}</strong><div class="btn-row">
        <button type="button" class="btn btn-sm" data-tv="copy">Copiar pauta</button>
        <button type="button" class="btn btn-sm" data-tv="wa">Mandar pauta</button>
        <button type="button" class="btn btn-sm" data-tv="ai">Preparar com IA</button>
        <button type="button" class="btn btn-sm btn-primary" data-tv="note">Registrar 1:1</button></div></div>
      ${!(personOf(name) || {}).phone ? '<p class="hint">Sem WhatsApp cadastrado: "Mandar pauta" abre o WhatsApp para você escolher o contato.</p>' : ''}
      <div class="status-grid">
        <div><h3>Em aberto (${d.open.length})</h3>${d.open.length ? `<ul>${d.open.slice(0, 12).map(li).join('')}</ul>` : '<p class="hint">Nada em aberto.</p>'}</div>
        <div><h3>Entregas em 14 dias (${d.done.length})</h3>${d.done.length ? `<ul>${d.done.slice(0, 10).map((t) => `<li>${esc(t.title)}</li>`).join('')}</ul>` : '<p class="hint">Nenhuma entrega registrada.</p>'}</div>
        <div><h3>Últimas conversas</h3>${d.notes.length ? `<ul>${d.notes.map((n) => `<li><a href="#/notas/${esc(n.id)}">${esc(n.title || 'Nota')}</a> <span class="hint">${n.date ? dm(n.date) : ''}</span></li>`).join('')}</ul>` : '<p class="hint">Nenhuma 1:1 registrada ainda.</p>'}</div>
      </div>
      <details class="tv-agenda"><summary>Ver pauta sugerida</summary><pre>${esc(agenda(name))}</pre></details>
    </section>`;
  }
  return `<div class="person-grid">${cards.join('')}</div>${detail || '<p class="hint">Toque em uma pessoa para ver as demandas dela e preparar a 1:1.</p>'}`;
}

export function initTeamView(helpers) {
  H = helpers;
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const p = e.target.closest('[data-tv-person]');
    if (p) {
      view.person = view.person === p.dataset.tvPerson ? null : p.dataset.tvPerson;
      return H.render();
    }
    const b = e.target.closest('[data-tv]');
    if (!b || !view.person) return;
    const name = view.person;
    const a = b.dataset.tv;
    if (a === 'copy') return H.copy(agenda(name), 'Pauta copiada');
    if (a === 'wa') return window.open(waUrl(name, agenda(name)), '_blank');
    if (a === 'ai') return H.ask(`Prepare minha 1:1 com ${name} como um bom gestor: abra com reconhecimento específico, trate os atrasos sem acusar (perguntas para entender o que travou), combine prazos, e sugira um ponto de desenvolvimento ligado ao trabalho dela/dele no B2C do Fluxo W7M. Inclua 3 perguntas abertas. Base:\n\n${agenda(name)}`);
    if (a === 'note') {
      const n = await Notes.create({ title: `1:1 com ${name.split(' ')[0]}`, participants: name, date: C.toDateKey(new Date()), body: agenda(name) + '\n\nAnotações:\n' });
      location.hash = '#/notas/' + n.id;
    }
  });
}
