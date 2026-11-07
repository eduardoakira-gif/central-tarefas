/*
 * search.js
 * Busca global: tarefas (inclusive concluídas), notas de reunião, posts da
 * marca pessoal, playbooks e telas da Central. Ctrl+K ou o botão da lupa.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';
import { PLAYBOOKS, openPlaybook } from './playbooks.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
let H = null;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PAGES = [
  ['Tarefas', '#/', 'plano de hoje, demandas'], ['Áreas', '#/areas', 'comunidade sócio merchan crm inferno kings'],
  ['Painel B2C', '#/painel', 'kpi indicadores okr funil metas'], ['Financeiro do Merchan', '#/financeiro', 'nf xml notas fiscais pagamento fornecedor fechamento'],
  ['Radar', '#/radar', 'noticias orgs pr esports'], ['Assistente', '#/assistente', 'ia chat claude'],
  ['Marca pessoal', '#/marca', 'linkedin instagram x stories posts conteudo'], ['Referências', '#/referencias', 'casos campanhas t1 furia loud'],
  ['Status semanal', '#/status', 'gestor funari relatorio semana'], ['Playbooks', '#/playbooks', 'processo modelo template drop campanha evento'],
  ['Relatório da diretoria', '#/diretoria', 'reuniao mensal board'], ['CRM e Newsletter', '#/crm', 'rd station email resenha'],
  ['Plano de estudo', '#/estudos', 'cursos aprender'], ['Aprender marketing', '#/aprender', 'glossario termos awareness cac ltv'],
  ['Notas de reunião', '#/notas', 'ata reuniao'], ['Agenda', '#/agenda', 'prazos calendario'], ['Relatório', '#/relatorio', 'produtividade entregas'],
  ['Histórico', '#/historico', 'concluidas lixeira'], ['Configurações', '#/config', 'notificacoes equipe whatsapp pin areas radar'],
  ['Growth', '#/growth', 'experimentos ideias ice testes hipotese backlog'],
  ['Inferno Roxo', '#/area/inferno', 'torcida organizada setores voluntarios'],
];

// cada termo precisa ser o começo de alguma palavra ("nf" acha "NFs", não "informações")
function match(text, terms) {
  const words = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  return terms.every((t) => words.some((w) => w.startsWith(t)));
}

function results(q) {
  const terms = fold(q).split(/[^a-z0-9]+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  const areas = (Sync.central && Sync.central.areas) || [];
  const areaName = (id) => (areas.find((a) => a.id === id) || { name: '' }).name;
  const tasks = Tasks.all()
    .filter((t) => match([t.title, t.description, t.notes, t.owner, t.waitingFor, areaName(t.area), (t.comments || []).map((c) => c.text).join(' ')].join(' '), terms))
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 12);
  for (const t of tasks)
    out.push({ group: 'Tarefas', title: t.title, sub: [areaName(t.area), t.status === 'done' ? 'concluída' : C.STATUS_MAP[t.status].name, t.dueDate ? 'prazo ' + C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR') : '', t.owner].filter(Boolean).join(' · '), run: () => H.openTask(t.id), done: t.status === 'done' });
  for (const n of (Sync.notes || []).filter((n) => !n.deletedAt && match([n.title, n.body, n.participants].join(' '), terms)).slice(0, 6))
    out.push({ group: 'Notas', title: n.title || 'Nota sem título', sub: [n.date && C.fromDateKey(n.date).toLocaleDateString('pt-BR'), n.participants].filter(Boolean).join(' · '), run: () => (location.hash = '#/notas/' + n.id) });
  for (const p of (Sync.posts || []).filter((p) => match([p.title, p.text].join(' '), terms)).slice(0, 5))
    out.push({ group: 'Posts', title: p.title, sub: `${p.network} · ${p.status}`, run: () => (location.hash = '#/marca') });
  for (const [name, hash, kw] of PAGES.filter(([n, , k]) => match(n + ' ' + k, terms)).slice(0, 5))
    out.push({ group: 'Telas', title: name, sub: '', run: () => (location.hash = hash) });
  for (const pb of PLAYBOOKS.filter((p) => match([p.name, p.desc, p.steps.map((s) => s.t).join(' ')].join(' '), terms)).slice(0, 4))
    out.push({ group: 'Playbooks', title: pb.name, sub: pb.desc, run: () => openPlaybook(pb.id) });
  return out;
}

let list = [];
let sel = 0;
function draw() {
  const q = $('#gsInput').value;
  list = results(q);
  sel = Math.min(sel, Math.max(0, list.length - 1));
  if (!q.trim()) {
    $('#gsResults').innerHTML = '<p class="hint gs-empty">Busque em tarefas (inclusive concluídas e comentários), notas, posts, playbooks e telas.</p>';
    return;
  }
  if (!list.length) {
    $('#gsResults').innerHTML = `<div class="gs-empty"><p class="hint">Nada encontrado para "${esc(q)}".</p><button type="button" class="btn btn-sm" data-gs-new>Criar tarefa "${esc(q.slice(0, 60))}"</button></div>`;
    return;
  }
  let last = '';
  $('#gsResults').innerHTML = list
    .map((r, i) => {
      const head = r.group !== last ? `<div class="gs-group">${r.group}</div>` : '';
      last = r.group;
      return `${head}<button type="button" class="gs-item${i === sel ? ' is-sel' : ''}${r.done ? ' is-done' : ''}" data-gs="${i}"><strong>${esc(r.title)}</strong>${r.sub ? `<span>${esc(r.sub)}</span>` : ''}</button>`;
    })
    .join('');
}

export function openSearch() {
  $('#gsInput').value = '';
  sel = 0;
  draw();
  $('#gsDialog').showModal();
  setTimeout(() => $('#gsInput').focus(), 30);
}
function pick(i) {
  const r = list[i];
  if (!r) return;
  $('#gsDialog').close();
  r.run();
}

export function initSearch(helpers) {
  H = helpers;
  $('#gsInput').addEventListener('input', () => ((sel = 0), draw()));
  $('#gsInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(list.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      draw();
      const el = document.querySelector('.gs-item.is-sel');
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (list.length) pick(sel);
      else if ($('#gsInput').value.trim()) document.querySelector('[data-gs-new]').click();
    }
  });
  $('#gsResults').addEventListener('click', (e) => {
    const b = e.target.closest('[data-gs]');
    if (b) return pick(Number(b.dataset.gs));
    if (e.target.closest('[data-gs-new]')) {
      const title = $('#gsInput').value.trim();
      $('#gsDialog').close();
      H.openTaskDialog({ title });
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="search"]')) openSearch();
  });
  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (!$('#gsDialog').open) openSearch();
    }
  });
}
