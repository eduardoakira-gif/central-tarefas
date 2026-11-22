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

/** Andamento do teste (tarefa ligada): prazo, checklist e última nota. */
function testLine(x) {
  const t = x.taskId && Tasks.get(x.taskId);
  if (!t) return '';
  const today = C.toDateKey(new Date());
  const left = t.dueDate ? Math.round((C.fromDateKey(t.dueDate) - C.fromDateKey(today)) / 86400000) : null;
  const ck = t.checklist || [];
  const n = (t.comments || []).filter((c) => c && c.text && !/^(Marcou|Desmarcou|Situação|Passo concluído)/.test(c.text)).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  return `<div class="idea-test${left != null && left < 0 ? ' is-late' : ''}"><span>🧪 ${left == null ? 'Sem prazo' : left < 0 ? `Prazo do teste venceu há ${-left} dia${left === -1 ? '' : 's'}: registre o resultado` : left === 0 ? 'Último dia do teste' : `Faltam ${left} dia${left === 1 ? '' : 's'} de teste`}${ck.length ? ` · checklist ${ck.filter((c) => c.done).length}/${ck.length}` : ''}</span>${n ? `<span class="hint">↳ ${esc(n.text.replace(/\s+/g, ' ').slice(0, 110))}</span>` : ''}<button type="button" class="link-btn" data-g="opentest">Abrir o teste</button></div>`;
}
/** Teste de duas proporções (z) com confiança bicaudal. */
export function abResult(ab) {
  if (!ab) return '';
  const na = +ab.na, ca = +ab.ca, nb = +ab.nb, cb = +ab.cb;
  if (!(na > 0 && nb > 0) || ca < 0 || cb < 0 || ca > na || cb > nb) return '<p class="hint">Preencha pessoas e conversões de A e B.</p>';
  const pa = ca / na, pb = cb / nb, p = (ca + cb) / (na + nb);
  const se = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  const z = se ? (pb - pa) / se : 0;
  const cdf = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp((-x * x) / 2); const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - q : q; };
  const conf = Math.round((1 - 2 * (1 - cdf(Math.abs(z)))) * 1000) / 10;
  const lift = pa ? ((pb - pa) / pa) * 100 : 0;
  const f = (v) => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  const few = ca + cb < 100;
  const verdict = conf >= 95 && !few ? (pb > pa ? '✅ B venceu de verdade.' : '❌ B perdeu de verdade: fique com A.') : conf >= 80 ? '⏳ Tendência, mas ainda não é conclusivo: deixe rodar mais.' : '🤷 Sem diferença real até agora (pode ser sorte).';
  return `<div class="ab-res"><span>A: <b>${f(pa)}</b></span><span>B: <b>${f(pb)}</b></span><span>Diferença: <b class="${lift >= 0 ? 'is-good' : 'is-bad'}">${lift >= 0 ? '+' : ''}${lift.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b></span><span>Confiança: <b>${conf.toLocaleString('pt-BR')}%</b></span></div><p class="ab-verdict">${verdict}${few ? ' Poucas conversões ainda (menos de 100 somadas).' : ''}</p>`;
}
/** Tamanho de amostra por variante (95% de confiança, 80% de poder). */
export function sampleSize(ss) {
  if (!ss) return '';
  const p1 = Number(ss.base) / 100, lift = Number(ss.lift) / 100;
  if (!(p1 > 0 && p1 < 1 && lift > 0)) return '<p class="hint">Preencha a taxa atual e a melhora.</p>';
  const p2 = Math.min(0.99, p1 * (1 + lift));
  const za = 1.96, zb = 0.8416;
  const n = Math.ceil(Math.pow(za * Math.sqrt(2 * ((p1 + p2) / 2) * (1 - (p1 + p2) / 2)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p2 - p1, 2));
  return `<p class="ab-verdict">${n.toLocaleString('pt-BR')} pessoas em cada versão (${(n * 2).toLocaleString('pt-BR')} no total).</p><p class="hint">Para sair de ${(p1 * 100).toLocaleString('pt-BR')}% para ${(p2 * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%. Se a base for menor, teste uma mudança mais ousada (melhora maior).</p>`;
}
function card(x) {
  const ice = C.iceScore(x);
  return `<article class="card idea-card st-${x.status}" data-idea="${esc(x.id)}">
    <div class="idea-top"><span class="ice" title="Nota ICE (média de Impacto, Confiança e Facilidade)">${ice}</span>
      <div class="idea-main"><button type="button" class="kpi-name" data-g="edit">${esc(x.title)}</button>
      <span class="hint">${esc(pillarName(x.pillar))} · ${STATUS_NAME[x.status]}${x.metric ? ' · ' + esc(x.metric) : ''}</span></div></div>
    ${x.hypothesis ? `<p class="idea-hyp">${esc(x.hypothesis)}</p>` : ''}
    <div class="ice-row">${['impact', 'confidence', 'ease'].map((k) => `<label>${{ impact: 'Impacto', confidence: 'Confiança', ease: 'Facilidade' }[k]}<input type="range" min="1" max="10" value="${x[k]}" data-ice="${k}" aria-label="${k}"><b>${x[k]}</b></label>`).join('')}</div>
    ${x.status === 'testando' ? testLine(x) : ''}
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
      <div class="btn-row"><button type="button" class="btn btn-sm" data-g="new">Nova ideia</button>${won + all.filter((x) => x.status === 'descartada').length ? '<button type="button" class="btn btn-sm" data-g="learnings">Enviar aprendizados</button>' : ''}<button type="button" class="btn btn-sm btn-primary" data-g="suggest" ${view.loading ? 'disabled' : ''}>${view.loading ? 'Pensando…' : '✨ Sugerir com IA'}</button></div>
    </div>
    <p class="hint">Regra de growth: no máximo 2 ou 3 testes ao mesmo tempo, cada um com uma métrica e prazo. ${testing > 3 ? '<strong>Você tem ' + testing + ' testes abertos: feche alguns antes de abrir novos.</strong>' : ''}</p>
    <div class="chips"><button type="button" class="chip" data-g-status="aberto" aria-pressed="${open}">Backlog e testes</button><button type="button" class="chip" data-g-status="fechado" aria-pressed="${!open}">Aprendizados</button>
      ${pillars.map((p) => `<button type="button" class="chip" data-g-pillar="${p}" aria-pressed="${view.pillar === p}">${p === 'todos' ? 'Todos' : esc(pillarName(p))}</button>`).join('')}</div>
    ${sugg}
    <details class="card ab-calc"${view.ab ? ' open' : ''}><summary><strong>Calculadora de teste A/B</strong><span class="hint">o resultado é real ou foi sorte?</span></summary>
      <div class="ab-grid">
        <span></span><span class="hint">Pessoas</span><span class="hint">Conversões</span>
        <strong>A (atual)</strong><input class="input" type="number" min="0" data-ab="na" value="${view.ab?.na ?? ''}" placeholder="ex.: 1200"><input class="input" type="number" min="0" data-ab="ca" value="${view.ab?.ca ?? ''}" placeholder="ex.: 36">
        <strong>B (teste)</strong><input class="input" type="number" min="0" data-ab="nb" value="${view.ab?.nb ?? ''}" placeholder="ex.: 1180"><input class="input" type="number" min="0" data-ab="cb" value="${view.ab?.cb ?? ''}" placeholder="ex.: 52">
      </div>
      <div id="abOut">${abResult(view.ab)}</div>
      <div class="ab-sample"><strong>Quantas pessoas eu preciso?</strong>
        <label>Taxa atual (%)<input class="input" type="number" step="0.1" min="0.1" data-ss="base" value="${view.ss?.base ?? ''}" placeholder="ex.: 3"></label>
        <label>Melhora que quero detectar (%)<input class="input" type="number" step="1" min="1" data-ss="lift" value="${view.ss?.lift ?? ''}" placeholder="ex.: 20"></label>
        <div id="ssOut">${sampleSize(view.ss)}</div></div>
      <p class="hint">Use para e-mail (aberturas ou cliques), landing page (cadastros), cupom ou anúncio. Regra prática: só declare vencedor com 95% de confiança e pelo menos 100 conversões somadas.</p>
    </details>
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
  document.addEventListener('input', (e) => {
    const sk = e.target.dataset && e.target.dataset.ss;
    if (sk) {
      view.ss = Object.assign({}, view.ss, { [sk]: e.target.value });
      const o = document.getElementById('ssOut');
      if (o) o.innerHTML = sampleSize(view.ss);
      return;
    }
    const f = e.target.dataset && e.target.dataset.ab;
    if (!f) return;
    view.ab = Object.assign({}, view.ab, { [f]: e.target.value });
    const out = document.getElementById('abOut');
    if (out) out.innerHTML = abResult(view.ab);
  });
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
    if (a === 'learnings') {
      const done = live().filter((x) => ['validada', 'descartada'].includes(x.status)).sort((p, q) => String(q.updatedAt).localeCompare(String(p.updatedAt))).slice(0, 15);
      const text = [`*Growth B2C – aprendizados dos testes*`, '', ...done.map((x) => `${x.status === 'validada' ? '✅ Validou' : '❌ Não validou'}: ${x.title}${x.metric ? ` (métrica: ${x.metric})` : ''}${x.result ? `\n   → ${x.result}` : ''}`)].join('\n');
      if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
      return H.copy(text, 'Aprendizados copiados');
    }
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
    if (a === 'opentest') return x.taskId && Tasks.get(x.taskId) ? H.openDetail(x.taskId) : H.toast('A tarefa do teste não existe mais.');
    if (a === 'won' || a === 'lost') {
      const result = prompt(a === 'won' ? 'O que validou? (números e o que vai virar rotina)' : 'O que aprendeu? (por que não funcionou)', x.result || '');
      if (result == null) return;
      await save(Object.assign({}, x, { status: a === 'won' ? 'validada' : 'descartada', result: result.trim() }));
      const tt = x.taskId && Tasks.get(x.taskId);
      if (tt && tt.status !== 'done') {
        await Tasks.update(tt.id, { comments: (tt.comments || []).concat({ id: C.uid(), text: (a === 'won' ? 'Teste validou: ' : 'Teste não validou: ') + (result.trim() || '–'), at: new Date().toISOString() }) });
        await Tasks.complete(tt.id);
      }
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
