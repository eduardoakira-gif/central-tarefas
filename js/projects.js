/*
 * projects.js
 * Projetos: tarefas agrupadas (todo playbook vira um projeto). Progresso,
 * contagem para o dia D, próxima etapa, atrasos e quem está com o quê.
 */
import { Tasks } from './tasks.js';
import { esc } from './ui.js';
import { saveAsPlaybook } from './playbooks.js';

const C = window.Core;
let H = null;
const view = { done: false, open: null };
const dm = (k) => C.fromDateKey(k).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function projectNames() {
  return [...new Set(Tasks.all().map((t) => t.project).filter(Boolean))].sort();
}

export function projects() {
  const today = C.toDateKey(new Date());
  const map = new Map();
  for (const t of Tasks.all()) {
    if (!t.project) continue;
    if (!map.has(t.project)) map.set(t.project, []);
    map.get(t.project).push(t);
  }
  return [...map.entries()].map(([name, list]) => {
    const done = list.filter((t) => t.status === 'done');
    const open = list.filter((t) => t.status !== 'done').sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const late = open.filter((t) => t.dueDate && t.dueDate < today);
    const dday = list.map((t) => t.projectDate).find(Boolean) || null;
    const lastDone = done.map((t) => t.completedAt).sort().pop();
    return { name, list, done, open, late, dday, pct: Math.round((done.length / list.length) * 100), finished: !open.length, lastDone };
  }).sort((a, b) => (b.late.length > 0) - (a.late.length > 0) || (a.dday || '9999').localeCompare(b.dday || '9999'));
}

function countdown(dday) {
  if (!dday) return '';
  const n = Math.round((C.fromDateKey(dday) - C.fromDateKey(C.toDateKey(new Date()))) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? 'Dia D é hoje' : `D+${-n}`;
}

function card(p) {
  const today = C.toDateKey(new Date());
  const isOpen = view.open === p.name;
  const health = p.finished ? 'ok' : p.late.length ? 'bad' : p.open[0] && p.open[0].dueDate && p.open[0].dueDate <= C.addDays(today, 2) ? 'warn' : 'ok';
  const li = (t) => `<li data-id="${esc(t.id)}" class="${t.status === 'done' ? 'is-done' : ''}"><button type="button" class="day-check" data-action="${t.status === 'done' ? 'restore' : 'complete'}" aria-label="Concluir">${t.status === 'done' ? '✓' : ''}</button>
    <button type="button" class="link-plain" data-action="edit">${esc(t.title.replace(' (' + p.name.split(': ').pop() + ')', ''))}</button><span class="hint">${t.dueDate ? (t.status !== 'done' && t.dueDate < today ? 'venceu ' : '') + dm(t.dueDate) : ''}${t.owner ? ' · ' + esc(t.owner.split(' ')[0]) : ''}</span></li>`;
  return `<article class="card proj-card h-${health}">
    <button type="button" class="proj-head" data-proj="${esc(p.name)}" aria-expanded="${isOpen}">
      <div><strong>${esc(p.name)}</strong><span class="hint">${p.done.length} de ${p.list.length} etapas${p.late.length ? ` · <b>${p.late.length} atrasada${p.late.length > 1 ? 's' : ''}</b>` : ''}${p.dday ? ` · Dia D ${dm(p.dday)}` : ''}</span></div>
      ${p.dday ? `<span class="proj-dday">${countdown(p.dday)}</span>` : ''}
    </button>
    <span class="kpi-bar"><i style="width:${p.pct}%"></i></span>
    ${!p.finished && !isOpen && p.open[0] ? `<p class="proj-next"><span class="label">Próxima etapa</span> ${esc(p.open[0].title)}${p.open[0].dueDate ? ` <span class="hint">· ${dm(p.open[0].dueDate)}</span>` : ''}</p>` : ''}
    ${isOpen ? `<ul class="proj-steps">${p.list.slice().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).map(li).join('')}</ul>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-proj-add="${esc(p.name)}">Adicionar etapa</button><button type="button" class="btn btn-sm" data-proj-ai="${esc(p.name)}">Revisar com IA</button>${p.dday ? `<button type="button" class="btn btn-sm" data-proj-save="${esc(p.name)}">Salvar como playbook</button>` : ''}</div>` : ''}
  </article>`;
}

/** Próximas 8 semanas: dias D dos projetos e carga de tarefas com prazo por semana. */
function timeline(all) {
  const today = C.toDateKey(new Date());
  const start = C.weekStart(new Date());
  const weeks = Array.from({ length: 8 }, (_, i) => C.addDays(start, i * 7));
  const open = Tasks.all().filter((t) => t.status !== 'done' && t.dueDate);
  const late = open.filter((t) => t.dueDate < today).length;
  const cols = weeks.map((w, i) => {
    const end = C.addDays(w, 6);
    const load = open.filter((t) => t.dueDate >= (i === 0 ? today : w) && t.dueDate <= end).length + (i === 0 ? late : 0);
    const ddays = all.filter((p) => !p.finished && p.dday && p.dday >= w && p.dday <= end);
    return { w, load, ddays };
  });
  const max = Math.max(8, ...cols.map((c) => c.load));
  const heavy = (n) => n >= 15;
  return `<section class="card tl-card">
    <div class="closing-head"><h2>Próximas 8 semanas</h2><span class="hint">barra = tarefas com prazo · ◆ = dia D</span></div>
    <div class="tl">${cols.map((c, i) => `<div class="tl-col${heavy(c.load) ? ' is-heavy' : ''}${c.ddays.length > 1 ? ' is-clash' : ''}">
        <div class="tl-bar"><i style="height:${Math.round((c.load / max) * 100)}%"></i><b>${c.load}</b></div>
        <span class="tl-week">${i === 0 ? 'esta' : C.fromDateKey(c.w).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
        <div class="tl-dd">${c.ddays.map((p) => `<span title="${esc(p.name)} · ${C.fromDateKey(p.dday).toLocaleDateString('pt-BR')}">◆ ${esc(p.name.split(': ').pop().slice(0, 14))}</span>`).join('')}</div>
      </div>`).join('')}</div>
    ${cols.some((c) => c.ddays.length) ? `<div class="tl-legend">${cols.flatMap((c) => c.ddays).sort((a, b) => a.dday.localeCompare(b.dday)).map((p) => `<span><b>◆ ${C.fromDateKey(p.dday).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</b> ${esc(p.name.split(': ').pop())}</span>`).join('')}</div>` : ''}
    ${cols.some((c) => c.ddays.length > 1) ? '<p class="hint tl-warn">⚠️ Semana com mais de um dia D: confira se o time dá conta ou se dá para espaçar.</p>' : ''}
    ${cols.some((c) => heavy(c.load)) ? '<p class="hint tl-warn">⚠️ Semana com 15 ou mais tarefas com prazo: antecipe, delegue ou renegocie.</p>' : ''}
  </section>`;
}

export function renderProjects() {
  const all = projects();
  const list = all.filter((p) => p.finished === view.done);
  return `<div class="chips"><button type="button" class="chip" data-proj-tab="0" aria-pressed="${!view.done}">Em andamento <span class="chip-count">${all.filter((p) => !p.finished).length || ''}</span></button>
      <button type="button" class="chip" data-proj-tab="1" aria-pressed="${view.done}">Concluídos <span class="chip-count">${all.filter((p) => p.finished).length || ''}</span></button></div>
    ${!view.done ? timeline(all) : ''}
    <p class="hint">Todo playbook vira projeto. Para colocar qualquer tarefa num projeto, preencha o campo Projeto dentro da tarefa.</p>
    <div class="proj-list">${list.map(card).join('') || `<p class="hint">${view.done ? 'Nenhum projeto concluído ainda.' : 'Nenhum projeto em andamento. Comece por um <a href="#/playbooks">playbook</a>.'}</p>`}</div>`;
}

/** Card compacto para a tela de Tarefas: projetos com atraso ou dia D perto. */
export function renderProjectsCard() {
  const today = C.toDateKey(new Date());
  const hot = projects().filter((p) => !p.finished && (p.late.length || (p.dday && p.dday <= C.addDays(today, 7) && p.dday >= today)));
  if (!hot.length) return '';
  return `<section class="card proj-mini"><div class="owner-head"><strong>Projetos que pedem atenção</strong><a class="link-btn" href="#/projetos">Ver projetos</a></div>
    ${hot.slice(0, 3).map((p) => `<a class="proj-mini-row" href="#/projetos" data-proj-open="${esc(p.name)}"><span><strong>${esc(p.name)}</strong> <span class="hint">${p.pct}%${p.late.length ? ` · <b>${p.late.length} atrasada${p.late.length > 1 ? 's' : ''}</b>` : ''}</span></span>${p.dday ? `<span class="proj-dday">${countdown(p.dday)}</span>` : ''}</a>`).join('')}
  </section>`;
}

export function initProjects(helpers) {
  H = helpers;
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const o = e.target.closest('[data-proj-open]');
    if (o) view.open = o.dataset.projOpen;
    const h = e.target.closest('[data-proj]');
    if (h) {
      view.open = view.open === h.dataset.proj ? null : h.dataset.proj;
      return H.render();
    }
    const tab = e.target.closest('[data-proj-tab]');
    if (tab) return ((view.done = tab.dataset.projTab === '1'), H.render());
    const add = e.target.closest('[data-proj-add]');
    if (add) {
      const p = projects().find((x) => x.name === add.dataset.projAdd);
      const area = p && p.list[0] ? p.list[0].area : undefined;
      return H.openTaskDialog({ project: add.dataset.projAdd, projectDate: p && p.dday, area });
    }
    const sv = e.target.closest('[data-proj-save]');
    if (sv) {
      const p = projects().find((x) => x.name === sv.dataset.projSave);
      if (!p) return;
      const name = prompt('Nome do playbook (ex.: Summit no office, Live com patrocinador):', p.name.split(': ').pop());
      if (!name || !name.trim()) return;
      saveAsPlaybook(p, name.trim().slice(0, 60)).then((ok) => H.toast(ok ? 'Playbook salvo. Ele aparece em Playbooks e o Assistente já pode usar.' : 'Só dá para salvar projetos com dia D e etapas com prazo.'));
      return;
    }
    const ai = e.target.closest('[data-proj-ai]');
    if (ai) {
      const p = projects().find((x) => x.name === ai.dataset.projAi);
      if (!p) return;
      const today = C.toDateKey(new Date());
      const lines = p.list.map((t) => `- [id:${t.id}] ${t.status === 'done' ? '[feito] ' : ''}${t.title}${t.dueDate ? ` (prazo ${t.dueDate}${t.status !== 'done' && t.dueDate < today ? ', ATRASADA' : ''})` : ''}${t.owner ? ` – ${t.owner}` : ''}`).join('\n');
      return H.ask(`Revise o projeto "${p.name}"${p.dday ? ` (dia D: ${p.dday})` : ''} como gerente de projetos: está no prazo? Qual o caminho crítico? O que está faltando no plano? Proponha com propor_acoes os ajustes (adiar, prioridade, delegar) e sugira novas tarefas se faltar etapa.\n\n${lines}`);
    }
  });
}
