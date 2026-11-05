/*
 * assistant.js
 * Assistente com visão de dono: lê tarefas, indicadores, OKRs, NFs e o radar
 * (no servidor, com a Claude API) e responde com cobrança e direcionamento.
 * A conversa fica salva neste aparelho.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const kv = { get: (k) => C.idb.get('kv', k), set: (k, v) => C.idb.put('kv', v, k) };

const PROMPTS = [
  ['Briefing do dia', 'Me dá o briefing do dia como dono: o que está atrasado, o que travou, as 3 prioridades de hoje em ordem e o que eu devo cobrar de quem.'],
  ['O que faço primeiro?', 'Olhando minhas demandas agora, o que eu faço primeiro e por quê? Seja direto.'],
  ['Como estão meus KPIs?', 'Analise meus indicadores e OKRs do Painel B2C: onde estou bem, onde estou mal e quais 3 ações movem mais o resultado este mês.'],
  ['Plano da semana', 'Monte meu plano da semana priorizando Comunidade, depois Sócio-Torcedor, Merchan e CRM. Sugira as tarefas.'],
  ['Lições do radar', 'O que as organizações de referência fizeram nos últimos dias que eu deveria copiar ou testar? Traga ideias práticas para o Fluxo W7M.'],
  ['Inferno Roxo', 'Como está o Inferno Roxo e qual o próximo passo para transformar a torcida em marca e produto? Use referências como Blue Wall da Karmine, Dezorganizada Furiosa e a Tribo do G3X.'],
  ['Kings League em receita', 'Como transformar a Kings League em receita B2C este mês? Pense em caravana, ingresso, merchan do Fluxo FC, sócio, cupons dos presidentes e CRM. Sugira as tarefas.'],
  ['Revisar newsletter', 'Vou colar o assunto e o texto da próxima newsletter. Revise como um especialista em CRM de clubes: assunto, pré-cabeçalho, ordem das seções (sem assuntos repetidos), chamada principal e segmentação, comparando com meus números de abertura e clique. Me devolva a versão melhorada.'],
  ['Campanhas de sócio', 'Me dê 3 campanhas de aquisição e 2 de retenção para o Sócio-Torcedor, inspiradas no MyBlue da Team Liquid, no Torcedor Premiado (Flamengo e Santos), no Segue o FX e no que os clubes fazem. Inclua meta, canal e as tarefas.'],
  ['Fechamento do mês', 'Como está o fechamento do merchan: NFs, XMLs, envio ao financeiro e pagamentos? O que falta e qual a ordem?'],
  ['Post da semana', 'Escolha o melhor assunto da minha semana de trabalho para um post no LinkedIn que aumente minha relevância no cenário de esports. Escreva o post (gancho forte na primeira linha, parágrafos curtos, aprendizado concreto, pergunta no fim), adapte para um carrossel do Instagram e uma thread curta no X. Não use números internos.'],
  ['Reunião de diretoria', 'Prepare a pauta da minha próxima reunião mensal de diretoria: resultados por pilar contra as metas, o que explica cada desvio, o plano para o próximo mês e as decisões que preciso pedir. Linguagem de diretoria, curta e com números.'],
  ['Cobrar a equipe', 'Olhando as demandas com responsável, quem da equipe eu preciso cobrar hoje e como? Escreva uma mensagem curta e respeitosa para cada pessoa.'],
  ['Brief de campanha', 'Monte um brief de campanha completo para a próxima ação mais importante da minha área (pergunte qual se não estiver claro): objetivo de negócio, etapa do funil, público e persona, mensagem principal e proposta de valor, canais, criativos, cronograma, orçamento estimado, KPIs com meta e como medir (UTM, cupom, CRM). Use referências de organizações de esports e sugira as tarefas.'],
  ['Meu funil', 'Analise minhas demandas e indicadores pela lente do funil de marketing (atenção, consideração, conversão, retenção, indicação). Onde está o gargalo, onde estou gastando esforço demais e quais 3 ações destravam receita?'],
  ['Aula de marketing', 'Me dá uma aula curta de marketing de hoje: escolha 1 conceito (ex.: funil, posicionamento, LTV/CAC, awareness), explique em português simples, mostre como uma organização de esports aplica, como eu falo disso numa reunião de diretoria e um exercício prático para eu fazer no Fluxo W7M esta semana.'],
  ['Me ensina', 'Escolha um conceito de gestão ou de B2C que eu deveria dominar agora (ex.: LTV/CAC, churn, comunidade como produto) e me ensine com exemplos de organizações de esports.'],
];

export const A = { messages: [], loaded: false, sending: false };
let H = null;

async function loadChat() {
  if (A.loaded) return;
  A.messages = (await kv.get('chat:' + Sync.id)) || [];
  A.loaded = true;
}
const saveChat = () => kv.set('chat:' + Sync.id, A.messages.slice(-60));

/** Markdown mínimo e seguro: negrito, itálico, títulos, listas e links. */
function md(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let list = null;
  const inline = (s) =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const close = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^\s*[-•*]\s+(.*)$/))) {
      if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = l.match(/^#{1,4}\s+(.*)$/))) {
      close();
      html += `<h3>${inline(m[1])}</h3>`;
    } else if (!l.trim()) {
      close();
    } else {
      close();
      html += `<p>${inline(l)}</p>`;
    }
  }
  close();
  return html;
}

function suggestions(msg, mi) {
  if (!msg.tasks || !msg.tasks.length) return '';
  const areas = Sync.central.areas;
  const name = (id) => (areas.find((a) => a.id === id) || areas[0] || { name: '' }).name;
  const pending = msg.tasks.filter((t) => !t.created).length;
  return `<div class="chat-tasks">
    <div class="chat-tasks-head"><strong>Tarefas sugeridas</strong>${pending > 1 ? `<button type="button" class="link-btn" data-chat="create-all" data-mi="${mi}">Criar todas</button>` : ''}</div>
    ${msg.tasks
      .map(
        (t, ti) => `<div class="chat-task${t.created ? ' is-done' : ''}">
          <div><span>${esc(t.title)}</span><span class="hint">${esc(name(t.areaId))} · ${C.PRIORITY_MAP[t.priority].name}${t.dueDate ? ' · ' + C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR') : ''}</span></div>
          ${t.created ? '<span class="hint">Criada</span>' : `<button type="button" class="btn btn-sm" data-chat="create" data-mi="${mi}" data-ti="${ti}">Criar</button>`}
        </div>`
      )
      .join('')}
  </div>`;
}

export function renderAssistant() {
  if (!Sync.v4()) return `<p class="notice">O servidor ainda está sendo atualizado. O assistente começa a funcionar assim que a atualização terminar.</p>`;
  const msgs = A.messages
    .map((m, i) =>
      m.role === 'user'
        ? `<div class="msg msg-user"><p>${esc(m.content)}</p></div>`
        : `<div class="msg msg-ai${m.error ? ' is-error' : ''}">${md(m.content)}${suggestions(m, i)}</div>`
    )
    .join('');
  const intro = `<div class="chat-intro">
      <h2>Seu sócio na Central</h2>
      <p>Eu leio suas demandas, o Painel B2C, os OKRs, as NFs do merchan e o radar das organizações. Pergunte o que quiser ou comece por um atalho.</p>
    </div>`;
  return `<div class="chat">
    <div class="chat-log" id="chatLog">${msgs || intro}${A.sending ? '<div class="msg msg-ai is-typing"><span></span><span></span><span></span></div>' : ''}</div>
    <div class="chat-prompts">${PROMPTS.map(([label], i) => `<button type="button" class="chip" data-chat="prompt" data-i="${i}">${label}</button>`).join('')}</div>
    <form class="chat-form" id="chatForm" novalidate>
      <textarea class="input" id="chatInput" rows="1" placeholder="Pergunte ao assistente…" aria-label="Mensagem"></textarea>
      <button type="submit" class="btn btn-primary" ${A.sending ? 'disabled' : ''}>Enviar</button>
    </form>
    ${A.messages.length ? '<button type="button" class="link-btn link-muted chat-clear" data-chat="clear">Nova conversa</button>' : ''}
  </div>`;
}

function scrollDown() {
  const log = $('#chatLog');
  if (log) log.scrollTop = log.scrollHeight;
  const form = $('#chatForm');
  if (form && innerWidth <= 720) form.scrollIntoView({ block: 'end' });
}

async function send(text) {
  text = String(text || '').trim();
  if (!text || A.sending) return;
  A.messages.push({ role: 'user', content: text, at: new Date().toISOString() });
  A.sending = true;
  H.render();
  scrollDown();
  try {
    const history = A.messages.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content }));
    const r = await Sync.call('assistantChat', { messages: history }, { timeout: 120000 });
    A.messages.push({ role: 'assistant', content: r.reply, tasks: r.tasks || [], at: new Date().toISOString() });
  } catch (err) {
    A.messages.push({ role: 'assistant', content: err.code === 'ai_not_configured' ? 'A IA ainda não foi configurada no servidor.' : err.message, error: true });
  } finally {
    A.sending = false;
    await saveChat();
    H.render();
    scrollDown();
  }
}

async function createTask(mi, ti) {
  const t = A.messages[mi].tasks[ti];
  if (t.created) return;
  await Tasks.create({ title: t.title, area: t.areaId, priority: t.priority, dueDate: t.dueDate, description: t.description });
  t.created = true;
  await saveChat();
}

/** Abre o Assistente já perguntando algo (usado pelo glossário). */
export async function askAssistant(text) {
  await loadChat();
  location.hash = '#/assistente';
  setTimeout(() => send(text), 250);
}

export async function openAssistant() {
  await loadChat();
  H.render();
  setTimeout(scrollDown, 30);
}

export function initAssistant(helpers) {
  H = helpers;
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const el = e.target.closest('[data-chat]');
    if (!el) return;
    const a = el.dataset.chat;
    if (a === 'prompt') return send(PROMPTS[Number(el.dataset.i)][1]);
    if (a === 'clear') {
      const ok = await H.confirmDialog({ title: 'Começar nova conversa?', message: 'A conversa atual será apagada deste aparelho.', confirmLabel: 'Nova conversa', danger: false });
      if (!ok) return;
      A.messages = [];
      await saveChat();
      return H.render();
    }
    if (a === 'create') {
      await createTask(Number(el.dataset.mi), Number(el.dataset.ti));
      H.toast('Tarefa criada');
      return H.render();
    }
    if (a === 'create-all') {
      const mi = Number(el.dataset.mi);
      const list = A.messages[mi].tasks;
      let n = 0;
      for (let i = 0; i < list.length; i++) if (!list[i].created) (await createTask(mi, i), n++);
      H.toast(n === 1 ? '1 tarefa criada' : `${n} tarefas criadas`);
      return H.render();
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'chatForm') return;
    e.preventDefault();
    const input = $('#chatInput');
    const v = input.value;
    input.value = '';
    send(v);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey && innerWidth > 720) {
      e.preventDefault();
      $('#chatForm').requestSubmit();
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'chatInput') return;
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px';
  });
}
