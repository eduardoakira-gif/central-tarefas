/*
 * growth.js
 * Backlog de growth: ideias de experimento com hipótese, métrica e nota ICE
 * (Impacto, Confiança, Facilidade). A lista se ordena pela nota; a melhor
 * ideia vira teste (tarefa) e o resultado fica registrado como aprendizado.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
let H = null;
const view = { status: 'aberto', pillar: 'todos', suggestions: [], loading: false };
const nowIso = () => new Date().toISOString();

const STATUS_NAME = { ideia: 'Ideia', testando: 'Testando', validada: 'Validada', descartada: 'Descartada' };
const live = () => (Sync.ideas || []).filter((x) => !x.deletedAt);
const save = (data) => Sync.upsert('ideas', C.normalizeIdea(Object.assign({}, data, { updatedAt: nowIso() })));

function pillarName(id) {
  return (C.PILLAR_MAP[id] || C.PILLAR_MAP.geral).name;
}
function areaFor(pillar) {
  const areas = (Sync.central && Sync.central.areas) || [];
  const key = { comunidade: 'comunidade', socio: 'socio', merchan: 'merchan', crm: 'crm', inferno: 'inferno', kings: 'kings' }[pillar];
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const a = key && areas.find((x) => fold(x.name).includes(key));
  return (a || areas[0] || {}).id || null;
}

function card(x) {
  const ice = C.iceScore(x);
  return `<article class="card idea-card st-${x.status}" data-idea="${esc(x.id)}">
    <div class="idea-top"><span class="ice" title="Nota ICE (média de Impacto, Confiança e Facilidade)">${ice}</span>
      <div class="idea-main"><button type="button" class="kpi-name" data-g="edit">${esc(x.title)}</button>
      <span class="hint">${esc(pillarName(x.pillar))} · ${STATUS_NAME[x.status]}${x.metric ? ' · ' + esc(x.metric) : ''}</span></div></div>
    ${x.hypothesis ? `<p class="idea-hyp">${esc(x.hypothesis)}</p>` : ''}
    <div class="ice-row">${['impact', 'confidence', 'ease'].map((k) => `<label>${{ impact: 'Impacto', confidence: 'Confiança', ease: 'Facilidade' }[k]}<input type="range" min="1" max="10" value="${x[k]}" data-ice="${k}" aria-label="${k}"><b>${x[k]}</b></label>`).join('')}</div>
    ${x.result ? `<p class="idea-result"><strong>Aprendizado:</strong> ${esc(x.result)}</p>` : ''}
    <div class="btn-row">
      ${x.status === 'ideia' ? '<button type="button" class="btn btn-sm btn-primary" data-g="test">Virar teste</button>' : ''}
      ${x.status === 'testando' ? '<button type="button" class="btn btn-sm" data-g="won">Validou</button><button type="button" class="btn btn-sm" data-g="lost">Não validou</button>' : ''}
      ${x.status === 'ideia' ? '<button type="button" class="btn btn-sm" data-g="drop">Descartar</button>' : ''}
      ${['validada', 'descartada'].includes(x.status) ? '<button type="button" class="btn btn-sm" data-g="reopen">Reabrir</button>' : ''}
    </div>
  </article>`;
}

export function renderGrowth() {
  if (!Sync.v4()) return '<p class="notice">O servidor ainda está sendo atualizado.</p>';
  if (!Sync.serverIdeas) return '<p class="notice">O servidor está terminando de atualizar para guardar as ideias. Recarregue em um minuto.</p>';
  const all = live();
  const open = view.status === 'aberto';
  const list = all
    .filter((x) => (open ? ['ideia', 'testando'].includes(x.status) : ['validada', 'descartada'].includes(x.status)))
    .filter((x) => view.pillar === 'todos' || x.pillar === view.pillar)
    .sort((a, b) => (a.status === 'testando' ? -1 : 0) - (b.status === 'testando' ? -1 : 0) || C.iceScore(b) - C.iceScore(a));
  const testing = all.filter((x) => x.status === 'testando').length;
  const won = all.filter((x) => x.status === 'validada').length;
  const decided = won + all.filter((x) => x.status === 'descartada').length;
  const pillars = ['todos', 'comunidade', 'socio', 'merchan', 'crm', 'inferno', 'kings'];
  const sugg = view.suggestions.length
    ? `<section class="card idea-sugg"><div class="owner-head"><strong>Sugestões da IA</strong><button type="button" class="link-btn" data-g="sugg-clear">Fechar</button></div>
      ${view.suggestions.map((s, i) => `<div class="sugg-row"><div><strong>${esc(s.title)}</strong><span class="hint">${esc(pillarName(s.pillar))} · ICE ${C.iceScore(s)} · ${esc(s.metric)}</span><p>${esc(s.hypothesis)}</p></div>
        ${s.added ? '<span class="hint">Adicionada</span>' : `<button type="button" class="btn btn-sm" data-g="sugg-add" data-i="${i}">Adicionar</button>`}</div>`).join('')}</section>`
    : '';
  return `<div class="growth-head">
      <div class="status-kpis"><span><strong>${all.filter((x) => x.status === 'ideia').length}</strong> no backlog</span><span><strong>${testing}</strong> testando</span><span><strong>${decided ? Math.round((won / decided) * 100) : 0}%</strong> de acerto</span></div>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-g="new">Nova ideia</button><button type="button" class="btn btn-sm btn-primary" data-g="suggest" ${view.loading ? 'disabled' : ''}>${view.loading ? 'Pensando…' : '✨ Sugerir com IA'}</button></div>
    </div>
    <p class="hint">Regra de growth: no máximo 2 ou 3 testes ao mesmo tempo, cada um com uma métrica e prazo. ${testing > 3 ? '<strong>Você tem ' + testing + ' testes abertos: feche alguns antes de abrir novos.</strong>' : ''}</p>
    <div class="chips"><button type="button" class="chip" data-g-status="aberto" aria-pressed="${open}">Backlog e testes</button><button type="button" class="chip" data-g-status="fechado" aria-pressed="${!open}">Aprendizados</button>
      ${pillars.map((p) => `<button type="button" class="chip" data-g-pillar="${p}" aria-pressed="${view.pillar === p}">${p === 'todos' ? 'Todos' : esc(pillarName(p))}</button>`).join('')}</div>
    ${sugg}
    <div class="idea-list">${list.map(card).join('') || `<p class="hint">${open ? 'Nenhuma ideia ainda. Toque em "Sugerir com IA" ou anote a sua.' : 'Nenhum teste concluído ainda.'}</p>`}</div>`;
}

async function suggest() {
  view.loading = true;
  H.render();
  try {
    const r = await Sync.call('ideasSuggest', { pillar: view.pillar }, { timeout: 90000 });
    view.suggestions = r.ideas || [];
    if (!view.suggestions.length) H.toast('A IA não trouxe sugestões agora.');
  } catch (err) {
    H.toast(err.code === 'ai_not_configured' ? 'A IA ainda não foi configurada no servidor.' : err.message);
  } finally {
    view.loading = false;
    H.render();
  }
}

let editing = null;
function editIdea(x) {
  editing = x;
  const f = $('#ideaForm');
  f.reset();
  $('#ideaDialogTitle').textContent = x ? 'Editar ideia' : 'Nova ideia';
  f.iTitle.value = x ? x.title : '';
  f.iHyp.value = x ? x.hypothesis : '';
  f.iMetric.value = x ? x.metric : '';
  f.iPillar.innerHTML = C.PILLARS.filter((p) => p.id !== 'marca').map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  f.iPillar.value = x ? x.pillar : view.pillar === 'todos' ? 'geral' : view.pillar;
  $('#ideaDelete').hidden = !x;
  $('#ideaDialog').showModal();
}
async function submitIdea(e) {
  e.preventDefault();
  const f = $('#ideaForm');
  const title = f.iTitle.value.trim();
  if (!title) return f.iTitle.focus();
  await save(Object.assign({}, editing || { createdAt: nowIso() }, { title, hypothesis: f.iHyp.value.trim(), metric: f.iMetric.value.trim(), pillar: f.iPillar.value }));
  $('#ideaDialog').close();
  H.toast(editing ? 'Ideia atualizada' : 'Ideia adicionada. Ajuste as notas ICE no card.');
}

export function initGrowth(helpers) {
  H = helpers;
  $('#ideaForm').addEventListener('submit', submitIdea);
  $('#ideaDelete').addEventListener('click', async () => {
    if (!editing) return;
    $('#ideaDialog').close();
    if (await H.confirmDialog({ title: 'Excluir ideia?', message: editing.title, confirmLabel: 'Excluir' })) await Sync.remove('ideas', editing.id);
  });
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const st = e.target.closest('[data-g-status]');
    if (st) return ((view.status = st.dataset.gStatus), H.render());
    const pl = e.target.closest('[data-g-pillar]');
    if (pl) return ((view.pillar = pl.dataset.gPillar), H.render());
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const a = b.dataset.g;
    if (a === 'new') return editIdea(null);
    if (a === 'suggest') return suggest();
    if (a === 'sugg-clear') return ((view.suggestions = []), H.render());
    if (a === 'sugg-add') {
      const s = view.suggestions[Number(b.dataset.i)];
      if (!s || s.added) return;
      await save(Object.assign({ createdAt: nowIso() }, s));
      s.added = true;
      return H.render();
    }
    const el = b.closest('[data-idea]');
    const x = el && live().find((i) => i.id === el.dataset.idea);
    if (!x) return;
    if (a === 'edit') return editIdea(x);
    if (a === 'test') {
      const t = await Tasks.create({ title: 'Testar: ' + x.title, area: areaFor(x.pillar), priority: 'high', dueDate: C.addDays(C.toDateKey(new Date()), 14), description: `${x.hypothesis}\nMétrica: ${x.metric || 'definir'}\nPrazo do teste: 2 semanas. No fim, registre o resultado em Growth.` });
      await save(Object.assign({}, x, { status: 'testando', taskId: t.id }));
      return H.toast('Teste criado como tarefa, com prazo de 2 semanas');
    }
    if (a === 'won' || a === 'lost') {
      const result = prompt(a === 'won' ? 'O que validou? (números e o que vai virar rotina)' : 'O que aprendeu? (por que não funcionou)', x.result || '');
      if (result == null) return;
      await save(Object.assign({}, x, { status: a === 'won' ? 'validada' : 'descartada', result: result.trim() }));
      return H.toast(a === 'won' ? 'Validada. Vire rotina ou playbook.' : 'Aprendizado registrado');
    }
    if (a === 'drop') return save(Object.assign({}, x, { status: 'descartada' }));
    if (a === 'reopen') return save(Object.assign({}, x, { status: 'ideia' }));
  });
  document.addEventListener('change', (e) => {
    const r = e.target.closest && e.target.closest('[data-ice]');
    if (!r) return;
    const x = live().find((i) => i.id === r.closest('[data-idea]').dataset.idea);
    if (x) save(Object.assign({}, x, { [r.dataset.ice]: Number(r.value) }));
  });
  document.addEventListener('input', (e) => {
    const r = e.target.closest && e.target.closest('[data-ice]');
    if (r) r.nextElementSibling.textContent = r.value;
  });
}
