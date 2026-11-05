/*
 * learn.js
 * Aprender marketing: glossário simples (o que é, exemplo no Fluxo W7M e como
 * falar na reunião), organizado por tema, e o "termo do dia".
 */
import { esc } from './ui.js';

const C = window.Core;

// [termo, tema, o que é, exemplo no Fluxo W7M, como falar na reunião]
const T = [
  // Funil
  ['Funil de marketing', 'Funil', 'O caminho da pessoa desde conhecer a marca até comprar e virar fã: atenção, consideração, conversão, retenção e indicação.', 'Viu o Nobru jogar (atenção) → segue o Fluxo (consideração) → vira sócio (conversão) → renova (retenção) → chama amigos (indicação).', '“Nosso gargalo está no meio do funil: muita gente conhece, pouca vira cadastro.”'],
  ['Awareness (reconhecimento)', 'Funil', 'Quantas pessoas sabem que a marca existe e lembram dela. É o topo do funil.', 'Um corte viral do Free Fire aumenta o awareness do Fluxo W7M.', '“Essa ação é de awareness: a meta é alcance, não venda.”'],
  ['Consideração', 'Funil', 'Quando a pessoa já conhece e passa a avaliar se quer se envolver ou comprar.', 'O torcedor visita a página do sócio e compara os planos.', '“Precisamos de conteúdo de consideração: mostrar o que o sócio ganha de verdade.”'],
  ['Conversão', 'Funil', 'Quando a pessoa faz a ação que você queria: comprar, assinar, se cadastrar.', 'Visitante da loja que finaliza o pedido.', '“A campanha teve 2% de conversão: de cada 100 visitas, 2 compraram.”'],
  ['Retenção', 'Funil', 'Manter quem já é cliente: que continue comprando ou assinando.', 'Sócio que renova todo mês.', '“Está mais barato reter do que adquirir: vamos atacar o churn.”'],
  ['Advocacy (defesa da marca)', 'Funil', 'Quando o fã recomenda e defende a marca por conta própria.', 'Membro do Inferno Roxo que leva amigos para a caravana.', '“O Inferno Roxo é o nosso motor de advocacy.”'],
  ['Lead', 'Funil', 'Pessoa que deixou um contato (e-mail, telefone) e pode virar cliente.', 'Quem se cadastrou para ganhar ingresso da Kings League.', '“O evento gerou 800 leads para a régua do sócio.”'],
  ['Topo, meio e fundo de funil', 'Funil', 'Topo: atrair. Meio: educar e engajar. Fundo: converter.', 'Topo: cortes no TikTok. Meio: newsletter. Fundo: cupom de primeiro mês.', '“Estamos fortes no topo e fracos no fundo de funil.”'],
  // Métricas
  ['CAC (custo de aquisição)', 'Métricas', 'Quanto custa conquistar um cliente novo: investimento em marketing ÷ clientes novos.', 'Gastou R$ 1.000 em anúncios e ganhou 50 sócios: CAC de R$ 20.', '“Nosso CAC do sócio está em R$ 20.”'],
  ['LTV (valor do cliente no tempo)', 'Métricas', 'Quanto um cliente deixa de receita durante todo o tempo com a marca.', 'Plano de R$ 24,90 que dura 8 meses: LTV perto de R$ 200.', '“Com LTV de R$ 200 e CAC de R$ 20, cada sócio se paga 10 vezes.”'],
  ['LTV ÷ CAC', 'Métricas', 'Compara o que o cliente traz com o que custou trazer. Acima de 3 é saudável.', 'R$ 200 ÷ R$ 20 = 10.', '“O LTV/CAC está em 10, dá para investir mais em aquisição.”'],
  ['Churn (cancelamento)', 'Métricas', 'Porcentagem de clientes que saem num período.', 'Começou o mês com 1.000 sócios e 80 cancelaram: churn de 8%.', '“O churn subiu para 8%, precisamos de uma ação de retenção.”'],
  ['MRR (receita recorrente mensal)', 'Métricas', 'Receita que entra todo mês de assinaturas.', 'Soma das mensalidades do sócio-torcedor.', '“O MRR do sócio cresceu 12% no mês.”'],
  ['ARPU (receita por usuário)', 'Métricas', 'Receita total dividida pelo número de clientes ou fãs ativos.', 'R$ 30 mil de receita B2C ÷ 3 mil fãs ativos = R$ 10 por fã.', '“Nossa métrica-norte é o ARPU: quanto cada fã ativo gera.”'],
  ['Ticket médio', 'Métricas', 'Valor médio de cada compra.', 'R$ 15 mil em 100 pedidos: ticket médio de R$ 150.', '“Com o kit combo, o ticket médio subiu de R$ 120 para R$ 150.”'],
  ['Taxa de engajamento', 'Métricas', 'Interações (curtidas, comentários, compartilhamentos) divididas pelo alcance.', 'Post com 10 mil de alcance e 800 interações: 8%.', '“O engajamento dos cortes do Free Fire está acima da média.”'],
  ['Alcance x impressões', 'Métricas', 'Alcance: pessoas diferentes que viram. Impressões: quantas vezes foi visto no total.', '10 mil pessoas viram o post 25 mil vezes.', '“Tivemos 25 mil impressões e 10 mil de alcance.”'],
  ['CTR (taxa de clique)', 'Métricas', 'Cliques ÷ quem recebeu ou viu.', 'Newsletter entregue a 1.400 pessoas com 7 cliques: 0,5%.', '“O CTR da newsletter está em 0,5%, a referência é 3%.”'],
  ['CTOR', 'Métricas', 'Cliques ÷ aberturas. Mostra se o conteúdo do e-mail convence.', '177 aberturas e 7 cliques: 4%.', '“O CTOR baixo mostra que o problema está no conteúdo, não só no assunto.”'],
  ['Taxa de abertura', 'Métricas', 'Aberturas ÷ e-mails entregues.', '1.382 entregues e 307 aberturas: 22%.', '“A abertura caiu de 22% para 8% em outubro.”'],
  ['ROI e ROAS', 'Métricas', 'ROI: lucro ÷ investimento. ROAS: receita gerada por cada real investido em anúncio.', 'R$ 1.000 em anúncio que vendeu R$ 4.000: ROAS de 4.', '“O ROAS da campanha de Black Friday foi 4.”'],
  ['CPM e CPC', 'Métricas', 'CPM: custo por mil visualizações. CPC: custo por clique.', 'Anúncio com CPM de R$ 12 e CPC de R$ 0,80.', '“O CPM está barato, mas o CPC está alto: o criativo não convence.”'],
  ['NPS', 'Métricas', 'Nota de 0 a 10 de quanto a pessoa recomendaria. Promotores (9-10) menos detratores (0-6).', 'Pesquisa pós-caravana.', '“O NPS da caravana foi 72, excelente.”'],
  ['KPI', 'Métricas', 'Indicador-chave: o número que mostra se a meta está sendo cumprida.', 'Sócios ativos, churn, receita do merchan.', '“Nosso KPI principal do trimestre é sócios ativos.”'],
  ['OKR', 'Métricas', 'Objetivo (onde quer chegar) + resultados-chave (números que provam que chegou).', 'Objetivo: comunidade ativa. KR: 5 mil membros no Discord.', '“Esse OKR está atrasado: estamos em 36% e o esperado era 50%.”'],
  ['Métrica-norte (North Star)', 'Métricas', 'O número único que melhor resume se o negócio está indo bem.', 'Receita por torcedor ativo.', '“Toda ação precisa mover nossa métrica-norte.”'],
  // Estratégia
  ['Posicionamento', 'Estratégia', 'O lugar que a marca quer ocupar na cabeça das pessoas, diferente dos concorrentes.', '“O Fluxo W7M é a org da comunidade e dos creators do Free Fire.”', '“Isso reforça nosso posicionamento de org da comunidade.”'],
  ['Persona', 'Estratégia', 'Perfil detalhado do cliente ideal: idade, hábitos, o que quer e o que trava.', 'Lucas, 17 anos, joga Free Fire, assiste Nobru, gasta com skins.', '“Para a persona Lucas, o canal certo é TikTok, não e-mail.”'],
  ['Público-alvo e segmentação', 'Estratégia', 'Dividir a base em grupos com características parecidas para falar com cada um do jeito certo.', 'Sócios x não sócios; fãs de Free Fire x fãs de Kings League.', '“Vamos segmentar a newsletter por modalidade.”'],
  ['Jornada do cliente', 'Estratégia', 'Todos os pontos de contato da pessoa com a marca, do primeiro ao último.', 'Vê o jogo → entra no Discord → recebe e-mail → vira sócio → vai na caravana.', '“Mapeamos a jornada e o e-mail de boas-vindas estava faltando.”'],
  ['Branding e brand equity', 'Estratégia', 'Branding: construir a marca. Brand equity: o valor que a marca tem na cabeça do público.', 'Torcedor que paga mais por uma camisa porque é do Fluxo.', '“Ação de branding: não vende hoje, mas aumenta o valor da marca.”'],
  ['Proposta de valor', 'Estratégia', 'Por que alguém deveria escolher você: o benefício principal em uma frase.', 'Sócio: “viva o Fluxo de perto: ingresso, bastidores e caravana”.', '“A proposta de valor do sócio não está clara na página.”'],
  ['Share of voice', 'Estratégia', 'Quanto a sua marca aparece nas conversas comparada aos concorrentes.', 'Menções ao Fluxo x LOUD x FURIA no Free Fire.', '“Nosso share of voice no Free Fire caiu depois do campeonato.”'],
  ['Flywheel', 'Estratégia', 'Ciclo que se alimenta sozinho: cada parte faz a próxima girar mais rápido.', 'Comunidade → sócio → merchan → dados no CRM → comunidade mais forte.', '“O CRM é o que fecha o nosso flywheel.”'],
  ['Go-to-market', 'Estratégia', 'Plano de lançamento: para quem, com qual mensagem, por quais canais e com que preço.', 'Lançamento do plano Inferno no sócio.', '“Antes de lançar, precisamos fechar o go-to-market.”'],
  ['Product-market fit', 'Estratégia', 'Quando o produto resolve tão bem um desejo do público que ele quase se vende sozinho.', 'Caravana que esgota em horas.', '“A caravana tem product-market fit, vamos escalar.”'],
  ['Benchmark', 'Estratégia', 'Comparar o que você faz com as melhores referências do mercado.', 'Comparar o sócio do Fluxo com o MyBlue da Liquid.', '“Fizemos o benchmark com Liquid e Flamengo.”'],
  ['Growth', 'Estratégia', 'Crescimento por testes rápidos e dados: testar, medir, repetir o que funciona.', 'Testar 2 preços do primeiro mês do sócio.', '“Vamos rodar como growth: 1 teste por semana.”'],
  // CRM e conteúdo
  ['CRM', 'CRM e conteúdo', 'Gestão do relacionamento com o cliente: a base de contatos e tudo o que você conversa com cada um.', 'O RD Station com todos os torcedores cadastrados.', '“Todo torcedor da Kings precisa entrar no CRM.”'],
  ['Régua de relacionamento', 'CRM e conteúdo', 'Sequência automática de mensagens disparadas por comportamento ou data.', 'Boas-vindas, aniversário, renovação, carrinho abandonado.', '“Falta uma régua de reativação para quem não abre há 90 dias.”'],
  ['Opt-in e opt-out', 'CRM e conteúdo', 'Opt-in: a pessoa autorizou receber. Opt-out: pediu para sair.', 'Checkbox “quero receber novidades do Fluxo”.', '“Só mandamos para quem deu opt-in, por causa da LGPD.”'],
  ['Teste A/B', 'CRM e conteúdo', 'Mandar duas versões para grupos diferentes e ver qual funciona melhor.', 'Dois assuntos de newsletter para 20% da base cada; o vencedor vai para o resto.', '“O assunto B ganhou o A/B com 30% a mais de abertura.”'],
  ['UTM', 'CRM e conteúdo', 'Etiqueta no link que mostra de onde veio cada visita ou venda.', 'Link da newsletter com ?utm_source=newsletter.', '“Com UTM sabemos quanto a newsletter vendeu.”'],
  ['Call to action (CTA)', 'CRM e conteúdo', 'A chamada para a ação: o botão ou a frase que diz o que fazer.', '“Garanta sua vaga na caravana”.', '“O CTA precisa estar no topo do e-mail.”'],
  ['UGC', 'CRM e conteúdo', 'Conteúdo criado pelos fãs, não pela marca.', 'Torcedor postando vídeo da caravana marcando o Fluxo.', '“Vamos incentivar UGC com um desafio no TikTok.”'],
  ['Storytelling', 'CRM e conteúdo', 'Contar uma história para gerar emoção e lembrança, em vez de só dar a informação.', 'A trajetória de um jogador da base até o mundial.', '“O lançamento precisa de storytelling, não só de preço.”'],
  ['Always on x campanha', 'CRM e conteúdo', 'Always on: comunicação constante. Campanha: ação com início, meio e fim.', 'Cortes diários (always on) x lançamento da camisa (campanha).', '“Temos campanha, mas falta o always on.”'],
  ['Hero, hub e help', 'CRM e conteúdo', 'Hero: grandes ações. Hub: conteúdo recorrente. Help: conteúdo útil que responde dúvidas.', 'Hero: documentário. Hub: série semanal. Help: “como resgatar o ingresso”.', '“Nosso calendário está todo em hero, falta hub e help.”'],
  // Esports e fãs
  ['Fandom', 'Esports e fãs', 'O conjunto dos fãs e da cultura que eles criam em volta da marca ou dos ídolos.', 'O fandom do Nobru.', '“A T1 transforma o fandom do Faker em produto.”'],
  ['Superfã', 'Esports e fãs', 'O fã mais engajado, que consome, compra e defende. Pequeno em número, grande em receita.', 'Membro do Inferno Roxo que vai a todos os eventos.', '“10% dos fãs geram a maior parte da receita: são os superfãs.”'],
  ['Ativação de patrocínio', 'Esports e fãs', 'Ação que faz o patrocinador aparecer de forma útil para o fã, além do logo na camisa.', 'Desconto com cartão BB para caravana.', '“Essa ativação do BB conecta o patrocínio ao sócio.”'],
  ['Drop', 'Esports e fãs', 'Lançamento limitado, com data marcada, que gera escassez e urgência.', 'Camisa comemorativa à venda por 48 horas.', '“O próximo drop sai só para sócios no primeiro dia.”'],
  ['Collab', 'Esports e fãs', 'Produto ou ação feita junto com outra marca.', 'Coleção Fluxo W7M x ASICS.', '“Uma collab com a ASICS levaria o merchan para fora do público gamer.”'],
];

export const TOPICS = ['Funil', 'Métricas', 'Estratégia', 'CRM e conteúdo', 'Esports e fãs'];
export const TERMS = T.map(([term, topic, what, example, say]) => ({ term, topic, what, example, say }));
export const view = { topic: '', q: '' };

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function termOfDay(now = new Date()) {
  const day = Math.floor(C.fromDateKey(C.toDateKey(now)).getTime() / 86400000);
  return TERMS[day % TERMS.length];
}

export function renderTermCard() {
  const t = termOfDay();
  return `<a class="card term-card" href="#/aprender"><span class="label">Termo do dia · marketing</span><strong>${esc(t.term)}</strong><span>${esc(t.what)}</span></a>`;
}

export function renderLearn() {
  const q = fold(view.q);
  const list = TERMS.filter((t) => (!view.topic || t.topic === view.topic) && (!q || fold(t.term + ' ' + t.what).includes(q)));
  const today = termOfDay();
  const chips = [['', 'Todos'], ...TOPICS.map((t) => [t, t])]
    .map(([id, n]) => `<button type="button" class="chip" data-learn-topic="${esc(id)}" aria-pressed="${view.topic === id}">${esc(n)}</button>`).join('');
  return `<section class="card term-today">
      <span class="label">Termo do dia</span>
      <h2>${esc(today.term)}</h2>
      <p>${esc(today.what)}</p>
      <p><strong>No Fluxo W7M:</strong> ${esc(today.example)}</p>
      <p class="term-say">${esc(today.say)}</p>
    </section>
    <div class="toolbar toolbar-history">
      <label class="search"><input id="learnSearch" type="search" placeholder="Buscar termo (ex.: churn, awareness)" autocomplete="off" value="${esc(view.q)}" aria-label="Buscar termo"></label>
    </div>
    <div class="chips learn-chips">${chips}</div>
    <div class="term-list">${list
      .map(
        (t) => `<details class="card term">
          <summary><strong>${esc(t.term)}</strong><span class="radar-cat">${esc(t.topic)}</span></summary>
          <p>${esc(t.what)}</p>
          <p><strong>No Fluxo W7M:</strong> ${esc(t.example)}</p>
          <p class="term-say">Na reunião: ${esc(t.say)}</p>
          <button type="button" class="link-btn" data-learn-ask="${esc(t.term)}">Aprofundar com o Assistente ›</button>
        </details>`
      )
      .join('') || '<p class="hint">Nenhum termo encontrado. Pergunte ao Assistente.</p>'}</div>
    <p class="hint">${TERMS.length} termos. Não achou? Pergunte no Assistente: ele explica qualquer termo com exemplos do Fluxo W7M.</p>`;
}

export function initLearn(H) {
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const t = e.target.closest('[data-learn-topic]');
    if (t) {
      view.topic = t.dataset.learnTopic;
      return H.render();
    }
    const a = e.target.closest('[data-learn-ask]');
    if (a) H.ask(`Me explica "${a.dataset.learnAsk}" como se eu estivesse começando em marketing: o que é, como calcular ou aplicar, um exemplo de organização de esports e como eu uso isso no Fluxo W7M esta semana.`);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'learnSearch') return;
    view.q = e.target.value;
    const q = fold(view.q);
    document.querySelectorAll('.term-list .term').forEach((el) => {
      el.hidden = !!q && !fold(el.textContent).includes(q);
    });
  });
}
