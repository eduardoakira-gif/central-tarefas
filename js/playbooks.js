/*
 * playbooks.js
 * Processos padrão do B2C: escolha o playbook e a data do "dia D" (lançamento,
 * evento, envio) e a Central cria todas as tarefas com prazos contados a partir
 * dela. Também a Triagem: tarefas paradas sem prazo, para decidir rápido.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
let H = null;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// d = dias em relação ao dia D (negativo = antes). p = prioridade.
export const PLAYBOOKS = [
  {
    id: 'drop', name: 'Drop de merch', area: 'merchan', dLabel: 'Dia do lançamento',
    desc: 'Do fornecedor à NF: lançamento com acesso antecipado para sócio, conteúdo com jogador e fechamento financeiro.',
    steps: [
      { d: -30, t: 'Definir peça, fornecedor, custo unitário e preço de venda', p: 'high' },
      { d: -25, t: 'Aprovar arte e mockup da peça' },
      { d: -21, t: 'Fechar pedido com o fornecedor e agendar o pagamento com o financeiro', p: 'high' },
      { d: -14, t: 'Fotos do produto e peça modelo com jogador' },
      { d: -10, t: 'Cadastrar o produto no e-commerce (estoque, tamanhos, frete)' },
      { d: -7, t: 'Teaser nas redes (sem revelar a peça inteira)' },
      { d: -5, t: 'E-mail de pré-venda com acesso antecipado para sócios (RD Station)' },
      { d: -3, t: 'Gravar conteúdo de lançamento com jogador ou creator' },
      { d: -1, t: 'Checar estoque, links, cupom e frete' , p: 'high' },
      { d: 0, t: 'Lançar: post, stories, push e e-mail para a base', p: 'urgent' },
      { d: 2, t: 'Analisar vendas das primeiras 48h e ajustar comunicação' },
      { d: 7, t: 'Enviar NF e XML do fornecedor ao financeiro e fechar o relatório do drop' },
    ],
  },
  {
    id: 'socio', name: 'Campanha de sócio-torcedor', area: 'socio', dLabel: 'Início da campanha',
    desc: 'Meta, oferta, landing page, régua de e-mails e ativação com jogadores, com checagem de conversão no meio.',
    steps: [
      { d: -21, t: 'Definir meta (novos sócios e reativações), oferta e período', p: 'high' },
      { d: -14, t: 'Landing page e segmentação no RD Station (ativos, inativos, leads)' },
      { d: -10, t: 'Peças criativas: feed, stories, e-mail e banner' },
      { d: -7, t: 'Montar a régua de e-mails (anúncio, lembrete, último dia)' },
      { d: -3, t: 'Briefar jogadores e creators para divulgar' },
      { d: 0, t: 'Lançar a campanha em todos os canais', p: 'urgent' },
      { d: 3, t: 'Checar conversão por canal e ajustar o que não performa', p: 'high' },
      { d: 7, t: 'Disparar o lembrete de último dia' },
      { d: 10, t: 'Encerrar e fazer o relatório: meta x realizado, CAC e aprendizados' },
    ],
  },
  {
    id: 'evento', name: 'Evento ou watch party', area: 'comunidade', dLabel: 'Dia do evento',
    desc: 'Local, ingresso com benefício para sócio, fornecedores, Inferno Roxo escalado e pesquisa depois.',
    steps: [
      { d: -21, t: 'Definir local, capacidade, data e orçamento', p: 'high' },
      { d: -14, t: 'Abrir ingressos com benefício para sócio' },
      { d: -10, t: 'Divulgação: redes, Discord, WhatsApp e e-mail' },
      { d: -7, t: 'Contratar fornecedores (som, telão, comida, segurança)' },
      { d: -5, t: 'Escalar os setores do Inferno Roxo (festa, logística, música)' },
      { d: -2, t: 'Checklist de logística e roteiro do dia', p: 'high' },
      { d: 0, t: 'Evento: captação de conteúdo e venda de merch no local', p: 'urgent' },
      { d: 1, t: 'Enviar pesquisa de satisfação (NPS) aos participantes' },
      { d: 3, t: 'Relatório: público, receita, NPS e aprendizados' },
    ],
  },
  {
    id: 'newsletter', name: 'Newsletter Resenha do Sócio', area: 'crm', dLabel: 'Dia do envio',
    desc: 'Pauta sem repetir assuntos, texto, layout no RD Station, teste e leitura das métricas.',
    steps: [
      { d: -5, t: 'Pauta da edição: seções sem assuntos repetidos ou parecidos' },
      { d: -3, t: 'Escrever os textos e escolher as imagens' },
      { d: -2, t: 'Montar o layout no RD Station (alinhamento de logos e ícones)' },
      { d: -1, t: 'Enviar teste e revisar no celular e no desktop', p: 'high' },
      { d: 0, t: 'Disparar a newsletter', p: 'urgent' },
      { d: 2, t: 'Ler abertura, cliques e descadastros e anotar os aprendizados' },
    ],
  },
  {
    id: 'kings', name: 'Jogo da Kings League', area: 'kings', dLabel: 'Dia do jogo',
    desc: 'Ingresso e caravana, conteúdo pré-jogo, CRM, ativação no jogo e recap com venda.',
    steps: [
      { d: -6, t: 'Ação de ingresso e caravana para a torcida' },
      { d: -4, t: 'Conteúdo pré-jogo com os jogadores e presidentes' },
      { d: -2, t: 'E-mail e WhatsApp para a base com chamada para o jogo' },
      { d: 0, t: 'Ativação no jogo: Inferno Roxo, merch e captação de leads', p: 'urgent' },
      { d: 1, t: 'Recap do jogo e oferta de merch pós-jogo' },
    ],
  },
  {
    id: 'fechamento', name: 'Fechamento do mês do merchan', area: 'merchan', dLabel: 'Prazo do financeiro',
    desc: 'NFs e XMLs do mês anterior conferidos e pagamentos programados com o financeiro.',
    steps: [
      { d: -4, t: 'Levantar todas as NFs e XMLs dos fornecedores do mês' },
      { d: -2, t: 'Conferir NFs com pedidos e valores combinados' },
      { d: -1, t: 'Programar os pagamentos com o financeiro', p: 'high' },
      { d: 0, t: 'Enviar NFs, XMLs e planilha ao financeiro', p: 'urgent' },
      { d: 2, t: 'Confirmar recebimento e datas de pagamento' },
    ],
  },
  {
    id: 'patrocinio', name: 'Ativação de patrocinador', area: 'geral', dLabel: 'Data da entrega',
    desc: 'Briefing, proposta criativa, aprovação, produção e relatório de entrega com números.',
    steps: [
      { d: -21, t: 'Briefing com o patrocinador: objetivo, público e entregas' , p: 'high' },
      { d: -14, t: 'Proposta criativa da ativação' },
      { d: -10, t: 'Aprovação do patrocinador' },
      { d: -5, t: 'Produção das peças e conteúdos' },
      { d: 0, t: 'Entrega da ativação', p: 'urgent' },
      { d: 3, t: 'Relatório de entrega com alcance, engajamento e prints' },
    ],
  },
];

const AREA_HINTS = {
  merchan: ['merchan', 'e-commerce', 'ecommerce', 'loja'],
  socio: ['socio', 'sócio'],
  comunidade: ['comunidade'],
  crm: ['crm', 'newsletter'],
  kings: ['kings'],
  geral: ['b2c', 'geral', 'patroc', 'comercial'],
};
function areaFor(key) {
  const areas = (Sync.central && Sync.central.areas) || [];
  const hints = AREA_HINTS[key] || [];
  const a = areas.find((x) => hints.some((h) => fold(x.name).includes(fold(h))));
  return (a || areas[0] || {}).id || null;
}

// -----------------------------------------------------------------------------
// Diálogo
// -----------------------------------------------------------------------------
let current = null;
function preview() {
  const pb = current;
  const d = $('#pbDate').value;
  const today = C.toDateKey(new Date());
  if (!pb || !d) return;
  const rows = pb.steps.map((s, i) => {
    const due = C.addDays(d, s.d);
    const past = due < today;
    return `<label class="check-row pb-step${past ? ' is-past' : ''}"><input type="checkbox" data-pb-step="${i}" ${past ? '' : 'checked'}>
      <span><strong>${C.fromDateKey(due).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</strong> · ${esc(s.t)}${s.d === 0 ? ' <em>(dia D)</em>' : ''}</span></label>`;
  });
  const late = pb.steps.filter((s) => C.addDays(d, s.d) < today).length;
  $('#pbSteps').innerHTML = rows.join('') + (late ? `<p class="hint">${late === 1 ? '1 etapa já passou do prazo e ficou desmarcada' : late + ' etapas já passaram do prazo e ficaram desmarcadas'}. Marque se ainda precisa fazer (entra com prazo para hoje).</p>` : '');
}

export function openPlaybook(id) {
  current = PLAYBOOKS.find((p) => p.id === id);
  if (!current) return;
  $('#pbTitle').textContent = current.name;
  $('#pbDesc').textContent = current.desc;
  $('#pbDateLabel').textContent = current.dLabel;
  const max = Math.max(...current.steps.map((s) => -s.d), 0);
  $('#pbDate').value = C.addDays(C.toDateKey(new Date()), max);
  $('#pbName').value = '';
  preview();
  $('#pbDialog').showModal();
}

async function submit(e) {
  e.preventDefault();
  const pb = current;
  const d = $('#pbDate').value;
  if (!pb || !d) return;
  const today = C.toDateKey(new Date());
  const name = $('#pbName').value.trim();
  const tag = name ? `${pb.name}: ${name}` : pb.name;
  const area = areaFor(pb.area);
  const idx = Array.from(document.querySelectorAll('[data-pb-step]')).filter((x) => x.checked).map((x) => Number(x.dataset.pbStep));
  for (const i of idx) {
    const s = pb.steps[i];
    const due = C.addDays(d, s.d);
    await Tasks.create({
      title: name ? `${s.t} (${name})` : s.t,
      area,
      priority: s.p || 'normal',
      dueDate: due < today ? today : due,
      description: `Playbook ${tag}. Dia D: ${C.fromDateKey(d).toLocaleDateString('pt-BR')}.`,
    });
  }
  $('#pbDialog').close();
  H.toast(`${idx.length} tarefas criadas para ${tag}`);
  location.hash = '#/';
}

export function renderPlaybooks() {
  return `<p class="summary">Escolha um processo e a data do dia D. A Central cria as tarefas com os prazos certos, na área certa.</p>
    <div class="pb-grid">${PLAYBOOKS.map((p) => `<button type="button" class="card pb-card" data-pb="${p.id}">
      <strong>${esc(p.name)}</strong><span>${esc(p.desc)}</span><span class="hint">${p.steps.length} etapas · ${Math.max(...p.steps.map((s) => -s.d))} dias antes até ${Math.max(...p.steps.map((s) => s.d))} depois</span></button>`).join('')}</div>`;
}

// -----------------------------------------------------------------------------
// Triagem: abertas há mais de 10 dias sem prazo, ou sem mexer há 21 dias
// -----------------------------------------------------------------------------
export function stale() {
  const now = Date.now();
  return Tasks.all()
    .filter((t) => t.status !== 'done' && t.status !== 'waiting' && !t.recurrence)
    .filter((t) => (!t.dueDate && now - Date.parse(t.createdAt) > 10 * 86400000) || now - Date.parse(t.updatedAt) > 21 * 86400000)
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}
export function renderTriageCard() {
  const list = stale();
  if (list.length < 3) return '';
  const days = (t) => Math.floor((Date.now() - Date.parse(t.updatedAt)) / 86400000);
  return `<section class="card triage-card">
    <div class="owner-head"><strong>Triagem: ${list.length} tarefas paradas</strong><button type="button" class="link-btn" data-triage="ai">Decidir com a IA</button></div>
    <p class="hint">Tarefa parada sem prazo vira ruído. Para cada uma: faça, agende, delegue ou apague.</p>
    ${list.slice(0, 4).map((t) => `<div class="triage-row" data-id="${esc(t.id)}"><button type="button" class="day-title" data-action="edit">${esc(t.title)}<span class="hint"> · ${days(t)} dias</span></button>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-triage="week">Esta semana</button><button type="button" class="icon-btn" data-action="delete" title="Excluir" aria-label="Excluir">×</button></div></div>`).join('')}
  </section>`;
}

export function initPlaybooks(helpers) {
  H = helpers;
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const p = e.target.closest('[data-pb]');
    if (p) return openPlaybook(p.dataset.pb);
    const t = e.target.closest('[data-triage]');
    if (!t) return;
    if (t.dataset.triage === 'ai') {
      const lines = stale().slice(0, 25).map((x) => `- ${x.title}`).join('\n');
      return H.ask(`Faça a triagem das minhas tarefas paradas (lista abaixo). Para cada uma, use propor_acoes: adiar com uma data realista, delegar para alguém da equipe, prioridade, ou concluir se parecer já feita. As que não fazem mais sentido, diga que posso apagar.\n\n${lines}`);
    }
    if (t.dataset.triage === 'week') {
      const id = t.closest('[data-id]').dataset.id;
      // sexta desta semana (no fim de semana, a sexta da semana que vem)
      const today = C.toDateKey(new Date());
      const wd = new Date().getDay();
      const fri = C.addDays(today, wd === 6 ? 6 : wd === 0 ? 5 : 5 - wd);
      await Tasks.update(id, { dueDate: fri });
      H.toast('Prazo: ' + C.fromDateKey(fri).toLocaleDateString('pt-BR', { weekday: 'long' }));
    }
  });
  $('#pbDate').addEventListener('change', preview);
  $('#pbForm').addEventListener('submit', submit);
}
