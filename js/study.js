/*
 * study.js
 * Plano de estudo focado na área: trilha de 10 módulos com cursos gratuitos,
 * podcasts, leituras e vídeos, progresso por item e a meta da semana.
 */
import { esc } from './ui.js';
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';

const C = window.Core;
const kv = { get: (k) => C.idb.get('kv', k), set: (k, v) => C.idb.put('kv', v, k) };
const yt = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

// tipo: curso | podcast | leitura | vídeo | livro | prática
export const MODULES = [
  { id: 'fund', name: 'Fundamentos de marketing', why: 'A base para falar a língua do marketing na diretoria.', items: [
    ['curso', 'Digital Marketing (HubSpot Academy)', 'Certificação gratuita: estratégia digital, SEO, redes, e-mail e anúncios. Substitui o Google Ateliê Digital, que foi desativado.', 'https://academy.hubspot.com/courses/digital-marketing'],
    ['curso', 'Fundamentos de Marketing (FGV)', 'Curso livre gratuito da FGV: conceitos, mix de marketing e terminologia.', 'https://educacao-executiva.fgv.br/cursos/online/curta-media-duracao-online/fundamentos-de-marketing'],
    ['curso', 'A Importância Estratégica da Marca: Conceitos Básicos (FGV)', 'Gratuito, 5 horas: identidade, imagem, reputação e projeto de branding.', 'https://educacao-executiva.fgv.br/cursos/online/curta-media-duracao-online/importancia-estrategica-da-marca-conceitos-basicos'],
    ['prática', 'Glossário da Central: 1 termo por dia', 'Leia o termo do dia e use em uma conversa ou post.', '#/aprender'],
  ] },
  { id: 'sport', name: 'Negócio do esporte e marketing esportivo', why: 'Entender patrocínio, torcida e receita como um gestor esportivo.', items: [
    ['curso', 'O Mercado de Trabalho no Esporte (FGV)', 'Gratuito: visão de gestão esportiva e carreira na indústria do esporte.', 'https://educacao-executiva.fgv.br/cursos/95428/curso-online'],
    ['leitura', 'Máquina do Esporte (toda semana)', 'Principal portal brasileiro de negócios do esporte: patrocínios, sócios e marketing.', 'https://maquinadoesporte.com.br/'],
    ['vídeo', 'Palestras de marketing esportivo e fan engagement', 'Busca no YouTube: escolha 1 por semana.', yt('marketing esportivo fan engagement palestra')],
    ['prática', 'Próximo nível (pago): FGV/FIFA/CIES Gestão de Esportes', 'Quando quiser certificação forte: inclui Marketing e Estratégias de Patrocínio no Esporte.', 'https://educacao-executiva.fgv.br/cursos/108359/curso-online'],
  ] },
  { id: 'esports', name: 'O negócio dos esports', why: 'Saber como orgs, ligas e marcas ganham dinheiro no esport.', items: [
    ['podcast', 'Business of Esports (Paul Dawalibi)', 'Podcast sobre a interseção entre negócios e esports.', 'https://podcasts.apple.com/podcast/id1441808951'],
    ['podcast', 'Esports Insider Podcast', 'Episódios com executivos do setor (ex.: como o esport é comercializado).', 'https://podcasts.apple.com/podcast/id1521150630'],
    ['podcast', 'The Esports Observer Podcast', 'Discussões sobre os temas de negócio do ecossistema.', 'https://podcasts.apple.com/podcast/id1268629233'],
    ['leitura', 'The Esports Advocate e Esports Insider', 'Notícias de negócio do esport no mundo. Assine as newsletters.', 'https://esportsinsider.com/'],
    ['vídeo', 'Modelo de negócio da Kings League', 'Busca no YouTube para entender a liga por dentro.', yt('Kings League modelo de negócio Piqué receita')],
  ] },
  { id: 'crm', name: 'CRM e e-mail marketing', why: 'Sua newsletter tem 13% de abertura e 0,5% de clique: aqui está o caminho para subir.', items: [
    ['curso', 'Email Marketing (HubSpot Academy)', 'Certificação gratuita, cerca de 4 horas, com segmentação, automação e métricas.', 'https://academy.hubspot.com/courses/email-marketing'],
    ['curso', 'Cursos gratuitos da RD University (Inbound e Marketing Digital)', 'Gratuitos, com certificado da RD Station, a ferramenta que vocês usam.', 'https://university.rdstation.com/cursos'],
    ['prática', 'Aplicar: régua de boas-vindas no RD Station', 'Monte a régua de 4 a 6 e-mails da aba Áreas › CRM.', '#/area/crm'],
  ] },
  { id: 'comunidade', name: 'Comunidade e fãs', why: 'O seu pilar mais importante: transformar audiência em comunidade.', items: [
    ['vídeo', 'Community building: palestras e casos', 'Busca no YouTube: comunidade como estratégia de negócio.', yt('community led growth palestra comunidade estratégia')],
    ['vídeo', 'Karmine Corp e a cultura de torcida', 'Busca no YouTube: KCX e Blue Wall.', yt('Karmine Corp KCX Blue Wall fans')],
    ['livro', 'Superfans (Pat Flynn)', 'Como transformar seguidores em superfãs. Leitura curta e prática.', 'https://patflynn.com/superfans/'],
    ['prática', 'Aplicar: plano de 90 dias da Comunidade', 'Transforme em tarefas na aba Áreas.', '#/area/comunidade'],
  ] },
  { id: 'socio', name: 'Assinatura e fidelidade (sócio)', why: 'Receita recorrente: churn, LTV e programas de fidelidade.', items: [
    ['leitura', 'Team Liquid: MyBlue', 'Como funciona o programa de missões e recompensas.', 'https://teamliquid.com/news/introducing-myblue'],
    ['livro', 'Subscribed (Tien Tzuo)', 'O livro de referência sobre economia de assinaturas.', 'https://books.apple.com/br/book/subscribed/id1326615127'],
    ['vídeo', 'Churn e retenção de assinantes', 'Busca no YouTube: como reduzir churn em assinatura.', yt('como reduzir churn assinatura retenção')],
  ] },
  { id: 'merchan', name: 'E-commerce e merchan', why: 'Drops, margem e conversão da loja.', items: [
    ['curso', 'Como construir uma loja virtual (Sebrae)', 'Gratuito, 2 horas, com certificado.', 'https://sebrae.com.br/sites/PortalSebrae/cursosonline/como-construir-uma-loja-virtual,a5d0b8a6a28bb610VgnVCM1000004c00210aRCRD'],
    ['vídeo', 'Estratégia de drops e lifestyle (100 Thieves)', 'Busca no YouTube.', yt('100 Thieves apparel drop strategy')],
    ['prática', 'Aplicar: plano de 90 dias do Merchan', 'Transforme em tarefas na aba Áreas.', '#/area/merchan'],
  ] },
  { id: 'gestao', name: 'Gestão, OKRs e prioridade', why: 'Visão de dono: foco, metas e rituais de gestão.', items: [
    ['leitura', 'Guia de OKRs do Google re:Work', 'Gratuito: como definir objetivos e resultados-chave.', 'https://rework.withgoogle.com/en/guides/set-goals-with-okrs'],
    ['livro', 'Measure What Matters / Avalie o que Importa (John Doerr)', 'O livro dos OKRs.', 'https://www.martinsfontespaulista.com.br/avalie-o-que-importa-853630/p'],
    ['livro', 'Ganhando Tração / Traction (Gino Wickman)', 'Método EOS: scorecard semanal e prioridades do trimestre.', 'https://www.martinsfontespaulista.com.br/ganhando-tracao-942387/p'],
  ] },
  { id: 'dados', name: 'Dados e analytics', why: 'Medir o que funciona e falar com números.', items: [
    ['curso', 'Certificação Google Analytics (Skillshop)', 'Trilha oficial e gratuita do GA4, com certificado do Google.', 'https://skillshop.exceedlms.com/student/path/525060'],
    ['prática', 'Aplicar: UTM em todos os links', 'Medir quanto cada canal vende e quantos sócios traz.', '#/area/crm'],
  ] },
  { id: 'marca', name: 'Marca pessoal e comunicação', why: 'Ser mais relevante no cenário e falar bem em público e na diretoria.', items: [
    ['curso', 'Social Media Marketing (HubSpot Academy)', 'Certificação gratuita sobre estratégia de redes sociais.', 'https://academy.hubspot.com/courses/social-media'],
    ['curso', 'Storytelling e Técnicas de Apresentação (FGV)', 'Gratuito: técnicas para falar em público e apresentar na diretoria.', 'https://educacao-executiva.fgv.br/cursos/online/curta-media-duracao-online/storytelling-e-tecnicas-de-apresentacao-conceitos-gerais-de-comunicacao'],
    ['vídeo', 'Como escrever bons posts no LinkedIn', 'Busca no YouTube: escolha 2 criadores e estude o formato.', yt('como escrever post linkedin gancho storytelling')],
    ['prática', 'Aplicar: plano de conteúdo da Marca pessoal', 'Publique 4 posts por semana.', '#/marca'],
  ] },
];

const ALL = MODULES.flatMap((m) => m.items.map((it, i) => ({ key: m.id + ':' + i, mod: m, type: it[0], title: it[1], desc: it[2], url: it[3] })));
export const state = { done: null, open: null };
let H = null;

async function load() {
  if (state.done !== null) return;
  state.done = (await kv.get('study:' + Sync.id)) || {};
  H.render();
}
const save = () => kv.set('study:' + Sync.id, state.done);

export function studyAlert() {
  if (!state.done) return null;
  const ws = C.weekStart(new Date());
  const week = Object.values(state.done).filter((d) => d >= ws).length;
  const wd = new Date().getDay();
  if (wd >= 4 && week < 2) return `Estudo da semana: ${week} de 3 itens. Separe 30 minutos hoje.`;
  return null;
}

export function renderStudy() {
  if (state.done === null) {
    load();
    return '<p class="hint">Carregando…</p>';
  }
  const ws = C.weekStart(new Date());
  const weekDone = Object.values(state.done).filter((d) => d >= ws).length;
  const total = ALL.length;
  const doneN = ALL.filter((x) => state.done[x.key]).length;
  const next = ALL.filter((x) => !state.done[x.key]).slice(0, 3);
  const link = (x) => (x.url.startsWith('#') ? `<a class="btn btn-sm" href="${esc(x.url)}">Abrir</a>` : `<a class="btn btn-sm" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir</a>`);
  return `<div class="kpis kpis-4">
      <div class="card kpi"><span class="stat-label">Nesta semana</span><span class="stat-num">${weekDone}/3</span><span class="stat-sub">itens concluídos (meta: 3)</span></div>
      <div class="card kpi"><span class="stat-label">Trilha</span><span class="stat-num">${Math.round((doneN / total) * 100)}%</span><span class="stat-sub">${doneN} de ${total} itens</span></div>
      <div class="card kpi"><span class="stat-label">Ritmo</span><span class="stat-num">3h</span><span class="stat-sub">por semana: 30 min por dia útil</span></div>
      <div class="card kpi"><span class="stat-label">Duração</span><span class="stat-num">12</span><span class="stat-sub">semanas, cerca de 1 módulo por semana</span></div>
    </div>
    <section class="card report-card">
      <div class="closing-head"><h2>Próximos passos</h2><div class="btn-row"><button type="button" class="btn btn-sm" data-study="ask">Montar meu cronograma com IA</button><button type="button" class="btn btn-sm" data-study="habit">Criar hábito semanal</button></div></div>
      ${next.length ? `<div class="bill-list">${next.map((x) => `<div class="post-row"><span class="post-net" style="--net:#7C3AED">${esc(x.type)}</span><span class="post-main"><strong>${esc(x.title)}</strong><span class="bill-meta">${esc(x.mod.name)}</span></span>${link(x)}</div>`).join('')}</div>` : '<p>Trilha completa. Parabéns! Peça ao Assistente a próxima trilha.</p>'}
      <p class="hint">Regra: estude e aplique na mesma semana. Todo módulo tem uma prática ligada à sua área.</p>
    </section>
    ${MODULES.map((m, mi) => {
      const items = ALL.filter((x) => x.mod.id === m.id);
      const d = items.filter((x) => state.done[x.key]).length;
      return `<details class="card study-mod"${state.open === m.id || (state.open === null && mi === 0) ? ' open' : ''} data-study-mod="${m.id}">
        <summary><span><strong>${mi + 1}. ${esc(m.name)}</strong><span class="hint"> · ${d}/${items.length}</span></span><span class="kpi-bar study-bar"><i style="width:${(d / items.length) * 100}%"></i></span></summary>
        <p class="hint">${esc(m.why)}</p>
        <div class="study-items">${items.map((x) => `<label class="study-item${state.done[x.key] ? ' is-done' : ''}">
            <input type="checkbox" data-study-done="${esc(x.key)}"${state.done[x.key] ? ' checked' : ''}>
            <span><strong>${esc(x.title)}</strong> <span class="radar-cat">${esc(x.type)}</span><br><span class="hint">${esc(x.desc)}</span></span>
            ${link(x)}
          </label>`).join('')}</div>
        <button type="button" class="link-btn" data-study-quiz="${m.id}">Testar o que aprendi com o Assistente ›</button>
      </details>`;
    }).join('')}
    <p class="hint">Links de busca levam ao Google ou ao YouTube para você escolher a versão mais atual. Os cursos gratuitos podem mudar de endereço: se algum link quebrar, me avise que eu atualizo.</p>`;
}

export function initStudy(helpers) {
  H = helpers;
  document.addEventListener('change', (e) => {
    const c = e.target.closest('[data-study-done]');
    if (!c) return;
    if (c.checked) state.done[c.dataset.studyDone] = C.toDateKey(new Date());
    else delete state.done[c.dataset.studyDone];
    state.open = c.closest('[data-study-mod]').dataset.studyMod;
    save();
    H.render();
    if (c.checked) H.toast('Boa! Agora aplique na sua área esta semana.');
  });
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const q = e.target.closest('[data-study-quiz]');
    if (q) {
      const m = MODULES.find((x) => x.id === q.dataset.studyQuiz);
      return H.ask(`Me teste sobre o módulo "${m.name}" do meu plano de estudo: faça 5 perguntas, uma por vez, do básico ao avançado, sempre ligadas ao meu trabalho no B2C do Fluxo W7M. Depois de cada resposta, corrija e explique. Comece pela primeira pergunta.`);
    }
    if (e.target.closest('[data-study="habit"]')) {
      const has = Tasks.all().some((t) => t.status !== 'done' && t.recurrence && /^Estudar 30 min/.test(t.title));
      if (has) return H.toast('O hábito de estudo já está nas suas tarefas.');
      const nx = ALL.filter((x) => !state.done[x.key]).slice(0, 3);
      const t = await Tasks.create({ title: 'Estudar 30 min (plano de estudo)', recurrence: 'weekdays', dueDate: C.toDateKey(new Date()), priority: 'normal', area: (Sync.central.areas[0] || {}).id, description: 'Hábito do plano de estudo: 30 minutos por dia útil. Marque o item em Mais › Plano de estudo quando terminar.', checklist: nx.map((x) => ({ id: C.uid(), text: x.title, done: false })) });
      void t;
      return H.toast('Hábito criado: aparece todo dia útil nas suas tarefas');
    }
    if (e.target.closest('[data-study="ask"]')) {
      return H.ask(`Monte meu cronograma de estudo das próximas 12 semanas com 3 horas por semana (30 minutos por dia útil), seguindo esta trilha: ${MODULES.map((m, i) => i + 1 + '. ' + m.name).join('; ')}. Para cada semana: o que estudar, a prática aplicada no meu trabalho e um post que eu posso fazer sobre o que aprendi para a minha marca pessoal.`);
    }
  });
}
