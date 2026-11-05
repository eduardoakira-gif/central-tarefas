/*
 * crm.js
 * CRM e Newsletter (RD Station): registro das campanhas, indicadores contra a
 * referência do setor esportivo, diagnóstico automático e checklist.
 */
import { Sync } from './sync.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const nowIso = () => new Date().toISOString();
const BENCH = { open: 22, click: 3, unsub: 0.3 }; // referência do setor esportivo (%)
const KINDS = [
  ['newsletter', 'Newsletter'], ['promo', 'Promoção / loja'], ['socio', 'Sócio-Torcedor'],
  ['reativacao', 'Reativação'], ['automacao', 'Automação / régua'], ['outro', 'Outro'],
];
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (a, b) => (b ? (a / b) * 100 : null);
const fp = (v) => (v == null ? '–' : nf.format(v) + '%');

let H = null;
let editing = null;

export const Campaigns = {
  all: () => Sync.campaigns.filter((c) => !c.deletedAt).sort((a, b) => b.date.localeCompare(a.date)),
  get: (id) => Sync.campaigns.find((c) => c.id === id) || null,
  async save(data) {
    const cur = data.id ? this.get(data.id) : null;
    const c = C.normalizeCampaign(Object.assign({}, cur || { createdAt: nowIso() }, data, { updatedAt: nowIso() }));
    await Sync.upsert('campaigns', c);
    return c;
  },
  remove: (id) => Sync.remove('campaigns', id),
};

function stats(list) {
  const sum = (k) => list.reduce((a, c) => a + (c[k] || 0), 0);
  const d = sum('delivered');
  return {
    n: list.length, delivered: d, open: pct(sum('opens'), d), click: pct(sum('clicks'), d),
    ctor: pct(sum('clicks'), sum('opens')), unsub: pct(sum('unsubs'), d), revenue: sum('revenue'),
  };
}

function diagnosis(list) {
  if (!list.length) return [];
  const s = stats(list.slice(0, 6));
  const out = [];
  if (s.open != null && s.open < BENCH.open * 0.7) {
    out.push({ level: 'red', text: `Abertura média de ${fp(s.open)}, abaixo da referência do setor (cerca de ${BENCH.open}%). O problema começa no assunto e na base.`, fix: ['Assunto com nome da modalidade, do jogador ou do creator ("Nobru convocou você para sábado").', 'Separar quem não abre há 90 dias numa régua de reativação e parar de mandar a newsletter para eles: melhora a entrega para o resto.', 'Testar A/B de assunto em todo envio (o RD Station faz isso).', 'Testar envio entre 18h e 20h.'] });
  }
  if (s.click != null && s.click < 1) {
    out.push({ level: 'red', text: `Clique médio de ${fp(s.click)} (referência: cerca de ${BENCH.click}%). Quem abre não encontra o que clicar.`, fix: ['1 chamada principal no topo, com botão grande para celular.', 'Menos seções e texto curto: cada seção puxa um assunto diferente.', 'Chamada concreta: "Garanta seu ingresso", "Resgate sua camisa", não "Saiba mais".', 'Oferta exclusiva para quem está na lista (cupom ou pré-venda).'] });
  }
  if (s.ctor != null && s.ctor < 8 && s.open >= BENCH.open * 0.7) {
    out.push({ level: 'amber', text: `Só ${fp(s.ctor)} de quem abre clica. O conteúdo não está levando para a ação.`, fix: ['Colocar a ação no primeiro bloco, antes das notícias.'] });
  }
  const opens = list.slice(0, 6).map((c) => pct(c.opens, c.delivered)).filter((x) => x != null);
  if (opens.length >= 3 && opens[0] < opens[opens.length - 1] * 0.7) {
    out.push({ level: 'amber', text: 'A abertura vem caindo nos últimos envios. Sinal de cansaço da base ou de frequência alta demais.', fix: ['Trocar a newsletter semanal por uma quinzenal mais forte, com envios extras só quando houver novidade real (jogo, drop, ingresso).'] });
  }
  if (!out.length) out.push({ level: 'green', text: 'Indicadores no nível da referência do setor. Agora o foco é receita: medir conversões e vendas por campanha.', fix: [] });
  return out;
}

const CHECKLIST = [
  'Assunto curto e específico, com nome de pessoa, modalidade ou benefício.',
  'Pré-cabeçalho que completa o assunto (não repete).',
  '1 objetivo por e-mail e 1 botão principal no topo.',
  'Seções sem assuntos repetidos ou parecidos.',
  'Pensado para celular: fonte grande, botões grandes, imagens leves.',
  'Segmentado: sócio x não sócio, modalidade favorita, engajados x inativos.',
  'Teste A/B do assunto.',
  'Link com UTM para medir venda e adesão no site.',
  'Régua automática: boas-vindas, pós-jogo, carrinho abandonado, renovação de sócio e reativação.',
];

export function renderCrm() {
  if (!Sync.v4()) return `<p class="notice">O servidor ainda está sendo atualizado. As campanhas ficam salvas neste aparelho e sincronizam sozinhas assim que a atualização terminar.</p>`;
  const list = Campaigns.all();
  const s = stats(list.slice(0, 6));
  const tile = (label, v, sub, bad) => `<div class="card kpi${bad ? ' is-alert' : ''}"><span class="stat-label">${label}</span><span class="stat-num">${v}</span><span class="stat-sub">${sub}</span></div>`;
  const rows = list
    .map((c) => {
      const o = pct(c.opens, c.delivered);
      const k = pct(c.clicks, c.delivered);
      return `<button type="button" class="crm-row" data-crm-edit="${esc(c.id)}">
        <span class="crm-main"><strong>${esc(c.name)}</strong><span class="bill-meta">${C.fromDateKey(c.date).toLocaleDateString('pt-BR')} · ${esc((KINDS.find((x) => x[0] === c.kind) || KINDS[0])[1])}${c.subject ? ' · ' + esc(c.subject) : ''}</span></span>
        <span class="crm-num">${nf.format(c.delivered)}<small>entregues</small></span>
        <span class="crm-num ${o != null && o < BENCH.open * 0.7 ? 'is-bad' : 'is-ok'}">${fp(o)}<small>abertura</small></span>
        <span class="crm-num ${k != null && k < 1 ? 'is-bad' : 'is-ok'}">${fp(k)}<small>clique</small></span>
      </button>`;
    })
    .join('');
  const diag = diagnosis(list)
    .map((d) => `<div class="diag diag-${d.level}"><p><strong>${esc(d.text)}</strong></p>${d.fix.length ? `<ul>${d.fix.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>`)
    .join('');
  return `<div class="kpis kpis-4">
      ${tile('Abertura média', fp(s.open), `referência ~${BENCH.open}% · últimos ${s.n || 0} envios`, s.open != null && s.open < BENCH.open * 0.7)}
      ${tile('Clique médio', fp(s.click), `referência ~${BENCH.click}%`, s.click != null && s.click < 1)}
      ${tile('Cliques ÷ aberturas', fp(s.ctor), 'quanto do conteúdo vira ação')}
      ${tile('Receita atribuída', brl.format(s.revenue || 0), 'nos envios registrados')}
    </div>
    ${list.length ? `<section class="card report-card"><h2>Diagnóstico da sua newsletter</h2>${diag}</section>` : ''}
    <section class="card report-card">
      <div class="closing-head"><h2>Campanhas</h2><button type="button" class="btn btn-primary btn-sm" data-crm-new>Registrar envio</button></div>
      ${rows ? `<div class="crm-list">${rows}</div>` : '<p class="hint">Registre cada envio do RD Station (entregues, aberturas e cliques ficam no relatório da campanha). Com 3 envios o diagnóstico aparece.</p>'}
    </section>
    <section class="card report-card">
      <h2>Checklist antes de enviar</h2>
      <ul class="checklist-static">${CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <p class="hint">No Assistente, toque em “Revisar newsletter” e cole o assunto e o texto: ele aponta o que mudar antes do envio.</p>
    </section>
    <p class="hint">Referências: média do setor esportivo de cerca de 22% de abertura e 3% de clique. Veja os casos de Tottenham, NHL e Voetbal International em Referências › CRM e Newsletter.</p>`;
}

function openDialog(id) {
  const c = id ? Campaigns.get(id) : null;
  editing = c ? c.id : null;
  const f = $('#campaignForm');
  f.reset();
  $('#campaignDialogTitle').textContent = c ? 'Editar envio' : 'Registrar envio';
  f.cKind.innerHTML = KINDS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  const v = c || { date: C.toDateKey(new Date()), kind: 'newsletter' };
  f.cName.value = v.name || '';
  f.cKind.value = v.kind;
  f.cDate.value = v.date;
  f.cSubject.value = v.subject || '';
  f.cAudience.value = v.audience || '';
  ['delivered', 'opens', 'clicks', 'unsubs', 'conversions', 'revenue'].forEach((k) => (f['c_' + k].value = c ? c[k] : ''));
  f.cNotes.value = v.notes || '';
  $('#campaignDelete').hidden = !c;
  $('#campaignDialog').showModal();
  setTimeout(() => f.cName.focus(), 30);
}

async function submit(e) {
  e.preventDefault();
  const f = $('#campaignForm');
  if (!f.cName.value.trim()) return f.cName.focus();
  const data = { id: editing || undefined, name: f.cName.value, kind: f.cKind.value, date: f.cDate.value, subject: f.cSubject.value, audience: f.cAudience.value, notes: f.cNotes.value };
  ['delivered', 'opens', 'clicks', 'unsubs', 'conversions', 'revenue'].forEach((k) => (data[k] = f['c_' + k].value));
  await Campaigns.save(data);
  $('#campaignDialog').close();
  H.toast(editing ? 'Envio atualizado' : 'Envio registrado');
}

export function initCrm(helpers) {
  H = helpers;
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    if (e.target.closest('[data-crm-new]')) return openDialog();
    const ed = e.target.closest('[data-crm-edit]');
    if (ed) openDialog(ed.dataset.crmEdit);
  });
  $('#campaignForm').addEventListener('submit', submit);
  $('#campaignDelete').addEventListener('click', async () => {
    const c = Campaigns.get(editing);
    if (!c) return;
    const ok = await H.confirmDialog({ title: 'Excluir este envio?', message: `“${c.name}” sai do histórico de campanhas.`, confirmLabel: 'Excluir' });
    if (!ok) return;
    await Campaigns.remove(c.id);
    $('#campaignDialog').close();
    H.toast('Envio excluído');
  });
}
