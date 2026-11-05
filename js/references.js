/*
 * references.js
 * Biblioteca de referências por área (o que as maiores organizações de esports,
 * clubes e empresas fazem e que funciona) + o radar filtrado por área.
 * Cada caso tem "como aplicar no Fluxo W7M" e vira tarefa com 1 toque.
 */
import { esc } from './ui.js';
import { R } from './radar.js';

export const AREAS = [
  { id: 'comunidade', name: 'Comunidade', color: '#14A38B' },
  { id: 'socio', name: 'Sócio-Torcedor', color: '#8B5CF6' },
  { id: 'merchan', name: 'Merchan', color: '#DB4C9A' },
  { id: 'crm', name: 'CRM e Newsletter', color: '#3B82F6' },
  { id: 'inferno', name: 'Inferno Roxo', color: '#7C3AED' },
  { id: 'kings', name: 'Kings League', color: '#C08A1E' },
];

// type: caso | campanha | prática
export const CASES = {
  comunidade: [
    { org: 'Karmine Corp', type: 'caso', title: 'Blue Wall: cultura de torcida de futebol no esport', what: 'A torcida tem nome (Blue Wall), cânticos, cor e presença em massa. O evento próprio KCX virou produto que lota arenas.', apply: 'Dar nome e rituais à torcida do Fluxo W7M (Inferno Roxo) e criar um evento próprio anual com ingresso pago.', warn: 'Em 2026 a KC precisou cortar custos: comunidade forte não paga a conta sozinha.' },
    { org: 'FURIA', type: 'caso', title: 'Dezorganizada Furiosa: movimento orgânico', what: 'Torcida criada pelos fãs, com samba e cultura brasileira. Levou mais de 130 torcedores ao Major de Budapeste e passou de 44 mil seguidores.', apply: 'Apoiar (e não controlar) quem já lidera a torcida: dar palco, kit e estrutura para as viagens.' },
    { org: 'G3X FC / Gaules', type: 'caso', title: 'Tribo: comunidade de creator que virou time', what: 'A comunidade da live do Gaules foi transferida para o time da Kings League; patrocinadores ativam dentro da live.', apply: 'Usar as lives de Nobru e Cerol como o principal canal de comunidade do Fluxo FC, com chamada para cadastro.' },
    { org: 'T1', type: 'caso', title: 'Fandom no modelo K-pop', what: 'Jogadores tratados como ídolos (Faker), conteúdo de bastidores e encontros com fãs alimentam uma base global.', apply: 'Série de bastidores com 1 jogador por modalidade por mês e encontros com fãs no office.' },
    { org: 'LOUD', type: 'caso', title: 'Crescimento por creators e conteúdo', what: 'A LOUD virou a maior base de fãs do Brasil com creators, linguagem jovem e presença em todas as redes.', apply: 'Calendário fixo de conteúdo com creators do Fluxo W7M e cortes diários para TikTok e Reels.' },
    { org: 'Barcelona', type: 'prática', title: 'Núcleos oficiais (penyes)', what: 'Grupos regionais de torcedores reconhecidos pelo clube, com líder, carteirinha e benefícios.', apply: 'Núcleos do Inferno Roxo por cidade, começando por SP e mais 2 capitais com maior base de sócios.' },
    { org: 'Fluxo W7M (próprio)', type: 'campanha', title: 'Segue o FX levou fãs para a EWC em Paris', what: 'Ação do sócio-torcedor que escolheu fãs para acompanhar a Esports World Cup com viagem paga.', apply: 'Repetir o formato como campanha anual de aquisição: "seja sócio e concorra à viagem do mundial".' },
  ],
  socio: [
    { org: 'Team Liquid', type: 'caso', title: 'MyBlue e Liquid+: fidelidade com missões', what: 'Fã cria a conta, completa missões (assistir, interagir, Discord, quiz), ganha pontos e troca por camisas autografadas, descontos na loja, acesso a jogadores e até viagem para evento.', apply: 'Missões semanais no sócio: assistir jogo, ir em evento, indicar amigo. Pontos trocados por itens e experiências.' },
    { org: 'Flamengo e Santos', type: 'campanha', title: 'Torcedor Premiado: R$ 1,99 no 1º mês e bônus por gol', what: 'Assinatura de benefícios de R$ 1,99 no primeiro mês e R$ 15 depois; cada gol do time dá bônus ao assinante.', apply: 'Primeiro mês a R$ 1,99 no plano de entrada e "cada vitória do Fluxo = pontos" para manter o sócio engajado.' },
    { org: 'paiN Gaming', type: 'caso', title: 'Pioneira no sócio de esports', what: 'Já em 2016 tinha mais de 3,6 mil sócios, mais que clubes do Brasileirão, com descontos na loja e brindes.', apply: 'Mostra que sócio de esports funciona: falta dar desconto ou vantagem na loja para o sócio do Fluxo.' },
    { org: 'Palmeiras (Avanti)', type: 'caso', title: 'Sócio para quem mora longe', what: 'Dois em cada três sócios vivem fora da Grande SP, graças a conta digital e benefícios fora do estádio.', apply: 'Benefícios 100% digitais para o sócio de fora de SP: conteúdo exclusivo, lives, sorteios online.' },
    { org: 'Fortaleza', type: 'caso', title: 'Rede de parceiros como benefício', what: 'Em 2025 os sócios economizaram mais de R$ 3,4 milhões em descontos com marcas parceiras.', apply: 'Usar os patrocinadores (BB, ASICS, Redragon, Rehidrat) para montar uma rede de descontos do sócio e comunicar a economia.' },
    { org: 'G3X', type: 'prática', title: 'Sócio Sofredor', what: 'Programa de sócio do G3X ligado à comunidade do Gaules. Não achei detalhes públicos confiáveis dos planos; vale analisar o site e os benefícios atuais.', apply: 'Fazer benchmark direto: preços, benefícios e comunicação, comparando com Cria, Vapo, Bicho Papão e Apelão.' },
    { org: 'Clubes de futebol', type: 'campanha', title: 'Campanhas que mais convertem', what: 'Membro fundador com preço travado, indique um amigo, renovação antecipada com brinde, reativação de quem cancelou e sorteio de experiência.', apply: 'Calendário: 1 campanha de aquisição por mês e 1 de retenção por mês, cada uma com meta no Painel.' },
  ],
  merchan: [
    { org: 'T1', type: 'caso', title: 'Produto ligado ao ídolo', what: 'Coleções e itens assinados por jogadores, com o Faker como carro-chefe, são a maior parte da força de B2C.', apply: 'Linha assinada por 1 jogador ou creator por trimestre (Free Fire e Kings League primeiro).' },
    { org: '100 Thieves', type: 'caso', title: 'Drops com escassez', what: 'Merchan como marca de lifestyle, com lançamentos limitados e data marcada que esgotam.', apply: 'Drop mensal com contagem regressiva no e-mail e nas lives, e acesso antecipado para sócios.' },
    { org: 'FURIA', type: 'caso', title: 'Marca lifestyle e collabs', what: 'Roupas para o dia a dia, collabs com marcas e experiências físicas.', apply: 'Separar a linha de torcedor (jogo) da linha lifestyle e buscar uma collab com patrocinador (ASICS).' },
    { org: 'Kings League + Netshoes', type: 'caso', title: 'Loja física dentro da arena', what: 'A Netshoes é parceira de e-commerce da Kings Cup e tem uma loja física na arena.', apply: 'Ponto de venda nos jogos do Fluxo FC e nos eventos do office, com pagamento por QR e cadastro no CRM.' },
    { org: 'Clubes de futebol', type: 'campanha', title: 'Campanhas que vendem', what: 'Pré-venda (só produz o que vendeu), personalização com nome e número, kit de aniversário do sócio e camisa comemorativa de título.', apply: 'Drop de vitória por 48 horas e pré-venda para validar cada produto novo antes de produzir.' },
  ],
  crm: [
    { org: 'Tottenham Hotspur', type: 'caso', title: 'Série de boas-vindas automática', what: 'Deu ao fã seis chances extras de abrir os e-mails de boas-vindas e aumentou em 233% o engajamento e a receita da loja.', apply: 'Criar no RD Station uma régua de boas-vindas de 4 a 6 e-mails para todo novo cadastro e sócio.' },
    { org: 'Voetbal International', type: 'caso', title: 'Personalização por time', what: 'Newsletters do clube preferido do leitor tiveram abertura 55% maior e 150% mais cliques.', apply: 'Perguntar a modalidade favorita no cadastro e mandar a newsletter certa para cada uma (Free Fire, R6, Kings League...).' },
    { org: 'NHL', type: 'caso', title: 'Resumo automático depois do jogo', what: 'E-mails de resumo enviados logo após cada partida tiveram abertura 53% maior e o dobro de cliques em ingresso e compartilhamento.', apply: 'E-mail curto no dia seguinte a cada jogo importante: resultado, melhor momento e 1 chamada (loja ou sócio).' },
    { org: 'Federação Inglesa (FA)', type: 'prática', title: 'Assunto com o time do fã', what: 'Só personalizar o assunto com o time que a pessoa torce já deu grandes ganhos de abertura.', apply: 'Assunto com nome da modalidade ou do jogador. Ex.: "Nobru convocou você para sábado".' },
    { org: 'Team GB', type: 'prática', title: 'Horário certo para cada fã', what: 'Usa IA para enviar cada e-mail na hora em que aquele fã costuma abrir.', apply: 'Testar envio entre 18h e 20h (pós-aula e trabalho) contra o horário atual de manhã.' },
    { org: 'Boas práticas', type: 'prática', title: 'Checklist da newsletter', what: '1 assunto por e-mail, 1 chamada principal no topo, texto curto, botão grande para celular, segmentação por engajamento e limpeza de inativos.', apply: 'Use o diagnóstico da tela CRM: abertura e clique de cada envio contra a referência do setor.' },
  ],
  inferno: [
    { org: 'Karmine Corp', type: 'caso', title: 'Rituais e evento próprio', what: 'Cânticos, cor, presença em massa e um evento anual que lota arenas.', apply: 'Grito oficial, bandeirão e o "Dia do Inferno": um evento anual da torcida.' },
    { org: 'Dezorganizada Furiosa', type: 'caso', title: 'Torcida criada pelos fãs', what: 'Cresceu por conta própria, com acolhimento e cultura brasileira.', apply: 'Conselho do Inferno Roxo eleito pela torcida e identidade escolhida em votação.' },
    { org: 'G3X', type: 'campanha', title: 'Financiamento coletivo de um sonho', what: 'O G3X lançou financiamento coletivo para construir um CT.', apply: 'Bandeirão financiado pela torcida, com o nome de quem contribuiu impresso nele.' },
    { org: 'Barcelona', type: 'prática', title: 'Núcleos regionais', what: 'Núcleos reconhecidos pelo clube escalam a torcida sem custo fixo.', apply: 'Kit do líder de núcleo + meta de membros por cidade.' },
    { org: 'Torcidas organizadas', type: 'prática', title: 'O que copiar e o que evitar', what: 'Copiar: sede, bateria, produtos próprios e eventos. Evitar: violência e brigas, que destroem marca e patrocínio.', apply: 'Código de conduta público e carteirinha que pode ser suspensa.' },
  ],
  kings: [
    { org: 'G3X FC', type: 'caso', title: 'Patrocínio integrado à live', what: 'Seara e Philips patrocinam o time com inserções na live do presidente e conteúdo com atletas.', apply: 'Pacote comercial do Fluxo FC com presença nas lives de Nobru, Cerol e Toguro.' },
    { org: 'Visa', type: 'campanha', title: 'Pré-venda e desconto de ingresso', what: 'A Visa dá pré-venda e desconto para quem paga com o cartão. A pesquisa dela mostrou que 90% dos fãs jogam videogame e 94% compram itens digitais.', apply: 'Pré-venda de ingresso e caravana para o sócio, e desconto com cartão BB.' },
    { org: 'Kings League Fantasy', type: 'caso', title: 'Cartas e fantasy', what: 'Jogo oficial com pacotes de cartas, coleção e ligas entre fãs.', apply: 'Bolão gratuito "Palpite do Inferno" com prêmios de patrocinador (sem dinheiro, para não virar aposta).' },
    { org: 'Fluxo FC (próprio)', type: 'campanha', title: 'Caravana só para sócio', what: 'Ônibus do office até a arena, com ingresso, para quem tem cadastro no sócio.', apply: 'Versão paga com ônibus patrocinado e kit, vendida por jogo ou por split.' },
    { org: 'Kings League', type: 'prática', title: 'A liga vive de patrocínio', what: 'Cerca de 75% da receita da Kings League Brasil vem de patrocínio; o clube precisa capturar o fã.', apply: 'QR code no ingresso, no ônibus e no telão: todo torcedor da Kings entra no CRM.' },
  ],
};

// radar → área (pelas categorias e pelo texto)
function radarArea(it) {
  const t = (it.title + ' ' + it.summary + ' ' + it.org).toLowerCase();
  if (/kings league|kings cup|fut7/.test(t)) return 'kings';
  if (/torcida|ultras|fã-clube|fan club|supporters/.test(t)) return 'inferno';
  if (it.category === 'Sócio/Membership') return 'socio';
  if (it.category === 'Merchan') return 'merchan';
  if (/newsletter|e-mail|email|crm|app oficial/.test(t)) return 'crm';
  if (['Comunidade', 'Eventos', 'Conteúdo/Creators'].includes(it.category)) return 'comunidade';
  if (it.category === 'B2C') return 'merchan';
  return null;
}

export const view = { area: 'comunidade', type: '' };

export function renderReferences() {
  const area = AREAS.find((a) => a.id === view.area) || AREAS[0];
  const list = (CASES[area.id] || []).filter((c) => !view.type || c.type === view.type);
  const radar = R.items.filter((it) => radarArea(it) === area.id).slice(0, 6);
  const tabs = AREAS.map((a) => `<button type="button" class="chip" data-ref-area="${a.id}" aria-pressed="${a.id === area.id}" style="--area:${a.color}">${esc(a.name)}</button>`).join('');
  const types = [['', 'Tudo'], ['caso', 'Casos'], ['campanha', 'Campanhas'], ['prática', 'Práticas']]
    .map(([id, n]) => `<button type="button" class="chip chip-sm" data-ref-type="${id}" aria-pressed="${view.type === id}">${n}</button>`).join('');
  const cards = list
    .map(
      (c, i) => `<article class="card ref-card" style="--area:${area.color}" data-ref-i="${i}">
        <div class="ref-top"><span class="radar-org">${esc(c.org)}</span><span class="radar-cat">${esc(c.type)}</span></div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.what)}</p>
        <div class="radar-lesson"><strong>Como aplicar no Fluxo W7M</strong><p>${esc(c.apply)}</p></div>
        ${c.warn ? `<p class="ref-warn">${esc(c.warn)}</p>` : ''}
        <div class="btn-row"><button type="button" class="btn btn-sm" data-ref-task="${i}">Virar tarefa</button></div>
      </article>`
    )
    .join('');
  return `<div class="chips ref-tabs">${tabs}</div>
    <div class="chips ref-types">${types}</div>
    <div class="ref-grid">${cards || '<p class="hint">Nada com esse filtro.</p>'}</div>
    <section class="ref-radar">
      <h2 class="group-title">Novidades do radar em ${esc(area.name)}</h2>
      ${radar.length
        ? radar.map((it) => `<a class="card ref-news" href="${esc(it.url)}" target="_blank" rel="noopener"><strong>${esc(it.org)}: ${esc(it.title)}</strong><span>${esc(it.lesson || it.summary)}</span></a>`).join('')
        : '<p class="hint">Quando o radar estiver ligado, as notícias desta área aparecem aqui automaticamente.</p>'}
    </section>
    <p class="hint">Peça mais no Assistente: “me dá 3 campanhas de ${esc(area.name.toLowerCase())} inspiradas nessas referências”.</p>`;
}

export function initReferences(H) {
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const a = e.target.closest('[data-ref-area]');
    if (a) {
      view.area = a.dataset.refArea;
      return H.render();
    }
    const t = e.target.closest('[data-ref-type]');
    if (t) {
      view.type = t.dataset.refType;
      return H.render();
    }
    const k = e.target.closest('[data-ref-task]');
    if (k) {
      const list = (CASES[view.area] || []).filter((c) => !view.type || c.type === view.type);
      const c = list[Number(k.dataset.refTask)];
      H.openTaskDialog({ title: ('Aplicar referência ' + c.org + ': ' + c.apply).slice(0, 200), description: c.title + '\n\n' + c.what, priority: 'normal' });
    }
  });
}
