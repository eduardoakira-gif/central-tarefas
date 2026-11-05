/*
 * areas.js
 * Uma aba para cada área do B2C (Comunidade, Inferno Roxo, Sócio-Torcedor,
 * Merchan, Kings League e CRM): demandas da área, indicadores, OKRs, bloco
 * próprio (financeiro, campanhas), plano de 90 dias e referências.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import * as UI from './ui.js';
import { Metrics, metricCard, okrCard, defaultMonth, monthLabel, view as b2cView } from './b2c.js';
import { CASES } from './references.js';
import { R } from './radar.js';

const C = window.Core;
const esc = UI.esc;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const AREAS = [
  { id: 'comunidade', name: 'Comunidade', color: '#14A38B', keys: ['comunidade'], mission: 'Transformar audiência em comunidade ativa: o pilar mais importante.', ask: 'Como está a Comunidade e o que faço esta semana para aumentar os torcedores ativos?' },
  { id: 'inferno', name: 'Inferno Roxo', color: '#7C3AED', keys: ['inferno'], mission: 'Fazer da torcida organizada uma marca e um produto, liderada pela torcida.', ask: 'Como está o Inferno Roxo e qual o próximo passo do plano de 90 dias?' },
  { id: 'socio', name: 'Sócio-Torcedor', color: '#8B5CF6', keys: ['socio', 'segue o fx'], mission: 'Receita recorrente: mais sócios pagantes, menos cancelamento.', ask: 'Como está o Sócio-Torcedor (sócios, churn, campanhas) e qual campanha eu rodo este mês?' },
  { id: 'merchan', name: 'Merchan', color: '#DB4C9A', keys: ['merchan', 'e-commerce', 'ecommerce', 'loja'], mission: 'Produto ligado aos ídolos, drops e margem, com o financeiro em dia.', ask: 'Como está o Merchan (vendas, drops, NFs a pagar) e o que faço esta semana?' },
  { id: 'kings', name: 'Kings League', color: '#C08A1E', keys: ['kings', 'fluxo fc'], mission: 'Transformar a audiência do Fluxo FC em cadastro, caravana, merchan e sócio.', ask: 'Como transformo os próximos jogos da Kings League em receita B2C? Sugira as tarefas.' },
  { id: 'crm', name: 'CRM e Newsletter', color: '#3B82F6', keys: ['crm', 'newsletter', 'rd station'], mission: 'Base única do torcedor e comunicação que converte.', ask: 'Analise meu CRM e minha newsletter e me diga as 3 melhorias para o próximo envio.' },
];
const BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));

// Planos de 90 dias (viram tarefas da área). [título, funil, dias até o prazo]
const PLANS = {
  comunidade: [
    ['Definir calendário fixo de eventos de comunidade (watch parties, campeonatos, encontros no office)', 'consideracao', 7],
    ['Criar canal oficial de comunidade com moderação e agenda semanal', 'consideracao', 14],
    ['Lançar programa de embaixadores da comunidade (fãs que lideram grupos)', 'advocacy', 30],
    ['Colocar QR code de cadastro em todo evento e live (todo fã entra no CRM)', 'conversao', 14],
    ['Série de bastidores: 1 jogador por modalidade por mês', 'awareness', 30],
    ['Medir e lançar no Painel: torcedores ativos, presença em eventos e engajamento', 'operacao', 10],
  ],
  inferno: [
    ['Conversar com as lideranças atuais do Inferno Roxo e formar o conselho', 'advocacy', 7],
    ['Mapear a base do Inferno Roxo: quantos são, onde estão, quais modalidades', 'operacao', 14],
    ['Construir e publicar o código de conduta junto com o conselho', 'operacao', 21],
    ['Criar cadastro de membro grátis ligado ao CRM (carteirinha digital)', 'conversao', 21],
    ['Votação da identidade: grito, mascote e arte do bandeirão', 'advocacy', 35],
    ['Pré-venda do kit de boas-vindas (camiseta, bandeira, carteirinha)', 'conversao', 45],
    ['Caravana paga piloto na Kings League com ônibus patrocinado', 'conversao', 50],
    ['Primeiro núcleo regional piloto', 'advocacy', 60],
    ['Plano "Inferno" no Sócio-Torcedor', 'conversao', 75],
    ['Fechar o primeiro patrocinador da torcida (bandeirão ou caravana)', 'conversao', 90],
  ],
  socio: [
    ['Benchmark dos programas de sócio: MyBlue (Liquid), Sócio Sofredor (G3X), Torcedor Premiado, Avanti', 'operacao', 7],
    ['Campanha de primeiro mês com preço de entrada (modelo R$ 1,99)', 'conversao', 21],
    ['Missões e pontos no sócio: assistir jogo, ir em evento, indicar amigo', 'retencao', 45],
    ['Campanha "indique um amigo" com recompensa para os dois', 'advocacy', 30],
    ['Régua de renovação e de reativação de quem cancelou', 'retencao', 21],
    ['Rede de descontos com os patrocinadores (BB, ASICS, Redragon, Rehidrat)', 'retencao', 60],
    ['Comunicar todo mês o que o sócio ganhou (economia, sorteios, experiências)', 'retencao', 30],
  ],
  merchan: [
    ['Separar linha de torcedor (jogo) e linha lifestyle', 'conversao', 14],
    ['Drop mensal com contagem regressiva e acesso antecipado para sócios', 'conversao', 30],
    ['Linha assinada por um jogador ou creator (modelo T1)', 'conversao', 60],
    ['Pré-venda para validar cada produto novo antes de produzir', 'conversao', 21],
    ['Ponto de venda nos jogos da Kings League e eventos do office', 'conversao', 45],
    ['Fechar o mês: NFs e XMLs enviados ao financeiro até o dia 5', 'operacao', 5],
  ],
  kings: [
    ['Pacote "Dia de jogo": transporte + ingresso + kit, com ônibus patrocinado', 'conversao', 21],
    ['QR code no ingresso, no ônibus e no telão para cadastro no CRM', 'conversao', 14],
    ['Cupons e links da loja por presidente (Nobru, Cerol, Toguro)', 'conversao', 14],
    ['Drop de vitória: produto comemorativo por 48 horas', 'conversao', 30],
    ['Pacote comercial com presença nas lives dos presidentes', 'conversao', 45],
    ['Pré-venda de ingresso para sócio e desconto com cartão BB', 'conversao', 30],
    ['Validar com a liga o que pode ser vendido com a marca da Kings', 'operacao', 10],
  ],
  crm: [
    ['Régua de boas-vindas de 4 a 6 e-mails no RD Station (modelo Tottenham)', 'retencao', 21],
    ['Perguntar a modalidade favorita no cadastro e segmentar a newsletter', 'consideracao', 30],
    ['Separar inativos de 90 dias numa régua de reativação', 'retencao', 14],
    ['Teste A/B de assunto em todo envio', 'consideracao', 7],
    ['E-mail automático pós-jogo com 1 chamada (modelo NHL)', 'conversao', 45],
    ['UTM em todos os links para medir venda e adesão', 'operacao', 7],
    ['Registrar cada envio na tela CRM para acompanhar abertura e clique', 'operacao', 3],
  ],
};

export const view = { id: null };

/** Áreas da central que pertencem a este pilar. */
export function centralAreasFor(pid) {
  const keys = BY_ID[pid].keys;
  return (Sync.central.areas || []).filter((a) => keys.some((k) => fold(a.name).includes(k)));
}

function stats(pid) {
  const ids = new Set(centralAreasFor(pid).map((a) => a.id));
  const now = new Date();
  const open = Tasks.all().filter((t) => ids.has(t.area) && t.status !== 'done');
  const late = open.filter((t) => C.classify(t, now).overdue).length;
  return { open: open.length, late, list: open };
}

export function renderAreasHub() {
  const ym = b2cView.month || defaultMonth();
  return `<div class="area-hub"><a class="card area-tile" href="#/marca" style="--area:#0A66C2"><strong>Marca pessoal</strong><span class="area-mission">Seu plano de conteúdo no LinkedIn, Instagram e X para ser mais relevante no cenário.</span><span class="area-nums">Calendário de posts, ideias e metas de seguidores</span></a><a class="card area-tile" href="#/estudos" style="--area:#7C3AED"><strong>Plano de estudo</strong><span class="area-mission">Trilha de 12 semanas focada na sua área, com cursos gratuitos, podcasts e leituras.</span><span class="area-nums">Meta: 3 itens por semana</span></a>${AREAS.map((a) => {
    const s = stats(a.id);
    const ms = Metrics.all().filter((m) => m.pillar === a.id);
    const filled = ms.filter((m) => m.values[ym] != null).length;
    return `<a class="card area-tile" href="#/area/${a.id}" style="--area:${a.color}">
      <strong>${esc(a.name)}</strong>
      <span class="area-mission">${esc(a.mission)}</span>
      <span class="area-nums"><b>${s.open}</b> abertas${s.late ? ` · <b class="is-bad">${s.late}</b> atrasadas` : ''}${ms.length ? ` · ${filled}/${ms.length} indicadores lançados` : ''}</span>
    </a>`;
  }).join('')}</div>`;
}

export function renderArea() {
  const a = BY_ID[view.id] || AREAS[0];
  const now = new Date();
  const ym = b2cView.month || defaultMonth(now);
  const mine = centralAreasFor(a.id);
  const s = stats(a.id);
  const areaMap = UI.areaMapOf(Sync.central.areas);
  const tabs = AREAS.map((x) => `<a class="chip" href="#/area/${x.id}" aria-pressed="${x.id === a.id}" style="--area:${x.color}">${esc(x.name)}</a>`).join('');
  const sorted = C.sortTasks(s.list, now);
  const tasksHtml = !mine.length
    ? `<div class="notice"><span>Ainda não existe a área <strong>${esc(a.name)}</strong> nas suas tarefas.</span><button type="button" class="btn btn-sm" data-area-create="${a.id}">Criar área</button></div>`
    : sorted.length
      ? `<div class="group-list">${sorted.slice(0, 12).map((t) => UI.taskCard(t, now, areaMap)).join('')}</div>${sorted.length > 12 ? `<p class="hint">Mais ${sorted.length - 12} na aba Tarefas (filtre pela área).</p>` : ''}`
      : '<p class="hint">Nenhuma demanda aberta nesta área.</p>';
  const metrics = Metrics.all().filter((m) => m.pillar === a.id);
  const okrs = Sync.okrs.filter((o) => !o.deletedAt && o.pillar === a.id && o.quarter === C.quarterOf(now));
  const plan = PLANS[a.id] || [];
  const planDone = plan.filter(([title]) => Sync.tasks.some((t) => !t.deletedAt && t.title === title)).length;
  const refs = (CASES[a.id] || []).slice(0, 3);
  const news = R.items.filter((it) => fold(it.title + it.summary + it.category).includes(fold(a.name.split(' ')[0])) || (a.id === 'socio' && it.category === 'Sócio/Membership') || (a.id === 'merchan' && it.category === 'Merchan')).slice(0, 3);

  let special = '';
  if (a.id === 'merchan') {
    const open = Sync.bills.filter((b) => !b.deletedAt && !b.paidAt);
    const today = C.toDateKey(now);
    const late = open.filter((b) => b.dueDate && b.dueDate < today);
    special = `<section class="card report-card"><div class="closing-head"><h2>Financeiro do merchan</h2><a class="btn btn-sm" href="#/financeiro">Abrir financeiro</a></div>
      <p>${open.length} NFs em aberto (${brl.format(open.reduce((x, b) => x + (b.amount || 0), 0))})${late.length ? ` · <strong class="is-bad">${late.length} vencidas</strong>` : ''} · ${Sync.bills.filter((b) => !b.deletedAt && (!b.nfOk || !b.xmlOk)).length} sem NF ou XML</p></section>`;
  }
  if (a.id === 'crm') {
    const c = Sync.campaigns.filter((x) => !x.deletedAt).slice(-6);
    const d = c.reduce((x, y) => x + y.delivered, 0);
    special = `<section class="card report-card"><div class="closing-head"><h2>Newsletter</h2><a class="btn btn-sm" href="#/crm">Abrir CRM</a></div>
      <p>${c.length ? `Últimos ${c.length} envios: abertura ${d ? nf.format((c.reduce((x, y) => x + y.opens, 0) / d) * 100) : '–'}% e clique ${d ? nf.format((c.reduce((x, y) => x + y.clicks, 0) / d) * 100) : '–'}% (referência do setor: 22% e 3%).` : 'Registre os envios do RD Station para ver o diagnóstico.'}</p></section>`;
  }
  if (a.id === 'inferno' || a.id === 'kings') {
    special = `<section class="card report-card"><h2>Planejamento estratégico</h2><p>O plano completo de Inferno Roxo e Kings League (referências, produto, receita, riscos e metas) está no documento que montamos. Use o plano de 90 dias abaixo para transformar em tarefas.</p></section>`;
  }

  return `<div class="chips area-tabs">${tabs}</div>
    <div class="area-head" style="--area:${a.color}">
      <div><h2>${esc(a.name)}</h2><p>${esc(a.mission)}</p></div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-area-new="${a.id}">Nova tarefa</button>
        <button type="button" class="btn" data-area-ask="${a.id}">Pedir direcionamento</button>
      </div>
    </div>
    <div class="kpis kpis-4 area-kpis">
      <div class="card kpi"><span class="stat-label">Demandas abertas</span><span class="stat-num">${s.open}</span><span class="stat-sub">nesta área</span></div>
      <div class="card kpi${s.late ? ' is-alert' : ''}"><span class="stat-label">Atrasadas</span><span class="stat-num">${s.late}</span><span class="stat-sub">resolver ou renegociar hoje</span></div>
      <div class="card kpi"><span class="stat-label">Indicadores</span><span class="stat-num">${metrics.filter((m) => m.values[ym] != null).length}/${metrics.length}</span><span class="stat-sub">lançados em ${esc(monthLabel(ym))}</span></div>
      <div class="card kpi"><span class="stat-label">Plano de 90 dias</span><span class="stat-num">${planDone}/${plan.length}</span><span class="stat-sub">etapas viraram tarefa</span></div>
    </div>
    ${special}
    <section class="pillar"><h2 class="group-title">Demandas</h2>${tasksHtml}</section>
    <section class="pillar" style="--area:${a.color}"><div class="closing-head"><h2 class="group-title">Indicadores · ${esc(monthLabel(ym))}</h2><a class="link-muted" href="#/painel">Lançar no Painel ›</a></div>
      ${metrics.length ? `<div class="kpi-grid">${metrics.map((m) => metricCard(m, ym, false)).join('')}</div>` : '<p class="hint">Carregue os indicadores recomendados no Painel B2C.</p>'}</section>
    ${okrs.length ? `<section class="pillar"><h2 class="group-title">OKRs do trimestre</h2><div class="okr-grid">${okrs.map((o) => okrCard(o, Metrics.all(), now)).join('')}</div></section>` : ''}
    <section class="card report-card">
      <div class="closing-head"><h2>Plano de 90 dias</h2>${planDone < plan.length ? `<button type="button" class="btn btn-sm btn-primary" data-area-plan="${a.id}">Criar as ${plan.length - planDone} etapas como tarefas</button>` : '<span class="hint">Todas as etapas já são tarefas.</span>'}</div>
      <ol class="plan-list">${plan.map(([t, f, d]) => `<li class="${Sync.tasks.some((x) => !x.deletedAt && x.title === t) ? 'is-done' : ''}">${esc(t)} <span class="hint">· ${esc(C.FUNNEL_MAP[f].short)} · em ${d} dias</span></li>`).join('')}</ol>
    </section>
    <section class="pillar"><div class="closing-head"><h2 class="group-title">Referências</h2><a class="link-muted" href="#/referencias">Ver todas ›</a></div>
      <div class="ref-grid">${refs.map((c) => `<article class="card ref-card" style="--area:${a.color}"><div class="ref-top"><span class="radar-org">${esc(c.org)}</span><span class="radar-cat">${esc(c.type)}</span></div><h3>${esc(c.title)}</h3><div class="radar-lesson"><strong>Como aplicar</strong><p>${esc(c.apply)}</p></div></article>`).join('')}</div>
      ${news.length ? news.map((it) => `<a class="card ref-news" href="${esc(it.url)}" target="_blank" rel="noopener"><strong>${esc(it.org)}: ${esc(it.title)}</strong><span>${esc(it.lesson || it.summary)}</span></a>`).join('') : ''}
    </section>`;
}

export function initAreas(H) {
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const cr = e.target.closest('[data-area-create]');
    if (cr) {
      const a = BY_ID[cr.dataset.areaCreate];
      const list = Sync.central.areas.map((x) => Object.assign({}, x));
      if (list.length >= 20) return H.toast('Use no máximo 20 áreas.');
      list.push({ id: C.newAreaId(), name: a.name, color: a.color });
      await Sync.patchCentral({ areas: list });
      return H.toast(`Área ${a.name} criada`);
    }
    const nw = e.target.closest('[data-area-new]');
    if (nw) {
      const ids = centralAreasFor(nw.dataset.areaNew);
      return H.openTaskDialog(ids.length ? { area: ids[0].id } : {});
    }
    const ask = e.target.closest('[data-area-ask]');
    if (ask) return H.ask(BY_ID[ask.dataset.areaAsk].ask);
    const pl = e.target.closest('[data-area-plan]');
    if (pl) {
      const pid = pl.dataset.areaPlan;
      let areas = centralAreasFor(pid);
      if (!areas.length) {
        const a = BY_ID[pid];
        const list = Sync.central.areas.map((x) => Object.assign({}, x));
        list.push({ id: C.newAreaId(), name: a.name, color: a.color });
        await Sync.patchCentral({ areas: list });
        areas = centralAreasFor(pid);
      }
      const today = C.toDateKey(new Date());
      let n = 0;
      for (const [title, funnel, days] of PLANS[pid]) {
        if (Sync.tasks.some((t) => !t.deletedAt && t.title === title)) continue;
        await Tasks.create({ title, area: areas[0].id, funnel, priority: days <= 14 ? 'high' : 'normal', dueDate: C.addDays(today, days) });
        n++;
      }
      return H.toast(`${n} ${n === 1 ? 'tarefa criada' : 'tarefas criadas'} com prazos do plano de 90 dias`);
    }
  });
}
