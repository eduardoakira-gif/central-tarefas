/*
 * whatsnew.js
 * Novidades de cada versão (mostradas uma vez depois de atualizar) e o guia
 * com a rotina recomendada de uso da Central.
 */
import { esc } from './ui.js';

const $ = (sel, el = document) => el.querySelector(sel);
const KEY = 'ct-seen-version';

export const CHANGELOG = [
  ['10.0.1', 'Sugestões do teclado', ['Os campos de texto agora liberam as sugestões, a correção automática e a letra maiúscula do teclado do celular e do tablet (antes estavam desligadas).']],
  ['10.0', 'Mapa 3D conversa com outras plataformas', [
    'Importar planta em imagem ou PDF (print do Floorplanner, PDF do arquiteto, foto da planta): vira o piso do mapa, na escala que você informar, para montar os itens por cima. Dá para ajustar a largura real e a transparência.',
    'Importar DXF do AutoCAD ou do SketchUp: as linhas viram paredes, com a escala detectada pelo arquivo (mm, cm ou m).',
    'Exportar DXF (AutoCAD, SketchUp, em metros, camadas por tipo de item), 3D .glb (Blender, SketchUp, visualizadores online) e SVG vetorial (Figma, Illustrator).',
  ]],
  ['9.9', 'Mais ideias de outras ferramentas', [
    'Ficha: Esconder até amanhã, segunda ou próximo mês (como o snooze do Linear e do Things). A tarefa some da lista até a data; o filtro Escondidas e a busca ainda acham.',
    'Tarefas recorrentes: selo 🔥 com quantas vezes seguidas você concluiu no prazo (como o habit tracker do TickTick).',
    'Projetos: Postar atualização com a saúde (🟢 no prazo, 🟡 em risco, 🔴 atrasado) e o que mudou, como o Project Updates do Linear. O card mostra a última e avisa quando passou de 7 dias.',
    'Mapa 3D: Planilha de itens com quantidade, medida, valor unitário e total.',
    'CRM: calendário do mês com os dias de envio.',
  ]],
  ['9.8', 'Ideias de outras ferramentas + links dos cursos', [
    'Plano de estudo: todos os cursos e livros agora abrem a página direta (sem busca no Google). Os cursos do Google Ateliê Digital, que saiu do ar, foram trocados por HubSpot Academy e FGV.',
    'Tarefas: modo Matriz (urgente x importante), inspirado no TickTick: Fazer agora, Agendar, Delegar e Depois. ☆ marca como importante.',
    'Tarefas: 📥 Triagem, inspirada no Linear: o que chegou sem prazo aparece um por vez para decidir em 1 toque (hoje, amanhã, semana que vem, urgente, delegar, já fiz ou lixeira).',
    'Projetos: indicadores ao abrir o projeto, inspirados no Todoist: em risco, progresso, concluídas na semana x semana passada e o ritmo necessário até o dia D.',
    'Correção: os botões Lista/Quadro voltaram a funcionar normalmente.',
  ]],
  ['9.7', 'Mais praticidade', [
    'Tarefas: Agrupar a lista por prazo, área, responsável, projeto ou marcação (fica lembrado).',
    'Tela inicial: contagem regressiva do próximo evento do mapa 3D, com atalho para o layout.',
    'Ficha: cole vários passos de uma vez no checklist (um por linha ou separados por ;).',
    'Mapa 3D: novos modelos Estúdio/live e Loja pop-up de merch.',
    'Busca: digite e toque em + Criar tarefa para criar na hora.',
    'Computador: aperte ? para ver os atalhos; novos atalhos T, A, G, P, E e S para ir às telas.',
  ]],
  ['9.6', 'Rodada forte 5', [
    'Ficha: estimativa de tempo (15 min a 1 dia) e responsável com 1 toque. O card mostra ⏱ e o Meu dia soma o trabalho restante, avisando quando passa de 6h focadas.',
    'Quadro (kanban): limite de 5 em andamento, com aviso quando passa.',
    'Painel B2C: Enviar resumo do mês por pilar, com meta, variação e ✅/⚠️.',
    'Projetos: Enviar cronograma com cada etapa, prazo, responsável e situação.',
    'Mapa 3D: 🎬 modo apresentação, com a câmera girando sozinha em volta do espaço (bom para mostrar à presidência ou ao patrocinador).',
    'Inferno Roxo: Escala do próximo evento, com coordenadores e voluntários aprovados por setor, pronta para o grupo.',
    'Growth: Enviar aprendizados dos testes validados e descartados.',
    'CRM: cadência de envios (último envio, intervalo médio, envios em 30 dias) com alerta de base esfriando ou de excesso.',
    'Agenda: Enviar semana, com prazos por dia e eventos do mapa 3D.',
  ]],
  ['9.5', 'Rodada forte 4', [
    'Meu dia: botão ⚡ O que faço agora? escolhe a próxima tarefa (plano de hoje, atraso, prioridade e prazo; pula bloqueadas e dependentes) e abre a ficha.',
    'Ficha: botão Duplicar cria uma cópia com checklist zerado.',
    'Painel B2C: quadro com os indicadores que mais pioraram e mais melhoraram em relação ao mês anterior.',
    'Financeiro: ranking de fornecedores dos últimos 90 dias, com valor e participação.',
    'CRM: desempenho por tipo de envio (newsletter, promoção, sócio, reativação, automação).',
    'Radar: organizações mais ativas em 30 dias, com toque para filtrar.',
    'Mapa 3D: orçamento estimado por item (valor unitário x quantidade), salvo no layout e no PDF do fornecedor.',
    'Equipe e 1:1: aviso quando a carga está desequilibrada entre as pessoas.',
    'Notas de reunião: Cobrar pendências monta a mensagem com as tarefas abertas da reunião, agrupadas por responsável.',
    'Assistente: + Meu atalho para salvar as perguntas que você faz sempre.',
  ]],
  ['9.4', 'Mais uma rodada forte', [
    'Tarefas: dependência na ficha ("Depende de"). O card mostra 🔗 enquanto a outra não termina e, ao concluir, a dependente é liberada com aviso e registro no andamento.',
    'Agenda: dias com mais de 6 tarefas ganham o botão Distribuir, que move as menos prioritárias para os próximos dias úteis mais leves.',
    'Mapa 3D: régua 📏 para medir a distância entre dois pontos do piso (ex.: palco até a primeira fileira).',
    'Financeiro: gráfico de saídas previstas por semana (8 semanas), destacando a semana de maior pagamento.',
    'Marca pessoal: banco de 12 ganchos para a primeira linha dos posts, com 1 toque para copiar.',
    'Inferno Roxo: voluntário aprovado ganha o botão Boas-vindas, com mensagem pronta com setor, missão e coordenador.',
    'Growth: calculadora de quantas pessoas o teste precisa para ser confiável.',
    'Relatório: exportar planilha das tarefas do período (com marcações e última nota).',
    'Projetos: Duplicar para outra data copia todas as etapas com os mesmos intervalos.',
    'Status semanal: botão PDF para mandar ou imprimir.',
  ]],
  ['9.3', 'Melhorias fortes em cada ferramenta', [
    'Ficha da tarefa: blocos de foco de 15, 25 ou 50 min com cronômetro; ao terminar, o tempo entra no andamento e a ficha soma o tempo investido.',
    'Painel B2C: tendência do próximo mês em cada indicador (pelos últimos meses) e se bate a meta.',
    'Financeiro: alerta de NF possivelmente duplicada (mesmo fornecedor, número, vencimento e valor).',
    'CRM: nota de 0 a 100 do assunto antes de enviar, com o que melhorar.',
    'Radar: Resumo da semana com as 8 notícias mais relevantes e as lições, pronto para mandar.',
    'Projetos: Mudar dia D empurra todas as etapas abertas junto.',
    'Notas de reunião: modelos de ata (alinhamento semanal, 1:1, patrocinador, fornecedor e pós-evento).',
    'Mapa 3D: checagem de segurança (itens fora da sala, sobrepostos e portas ou saídas obstruídas), também no PDF.',
    'Assistente: salvar a resposta como nota e copiar com 1 toque.',
    'Growth: calculadora de teste A/B com diferença, confiança e veredito.',
  ]],
  ['9.2', 'Seleção múltipla e alertas', [
    'Tarefas: toque em ☑ Selecionar e marque várias de uma vez para concluir, pôr no plano de hoje, adiar (amanhã ou +1 semana), mudar prioridade, mover de área ou mandar para a lixeira.',
    'Tarefas: filtros rápidos Paradas (em andamento sem nota há 7+ dias) e Bloqueadas (marcação Bloqueado). Só aparecem quando há alguma.',
    'Notificação: o resumo do dia avisa das tarefas paradas e das bloqueadas.',
    'Mapa 3D: botão 👁 mostra a vista de quem chega pela porta, na altura dos olhos (1,7 m).',
    'Mapa 3D: escolha a cor de cada item (ex.: cor do patrocinador no totem e no backdrop).',
  ]],
  ['9.1', 'Rodada avançada nas ferramentas', [
    'Growth: cada teste mostra quantos dias faltam, o checklist e a última nota, com atalho para a ficha. Ao marcar Validou ou Não validou, a tarefa do teste é concluída com o aprendizado.',
    'CRM: ranking dos assuntos que mais abriram e o de menor abertura, para repetir o padrão campeão.',
    'Radar: busca por palavra (organização, assunto, lição) e botão Compartilhar em cada notícia.',
    'Painel B2C: exportar planilha do mês (valor, mês anterior, meta e % da meta).',
    'Financeiro do Merchan: exportar planilha de todas as NFs para o financeiro.',
    'Marca pessoal: constância das últimas 8 semanas e sequência de semanas postando.',
    'Aprender marketing: treino com flashcards e placar de acertos.',
    'Referências: busca por palavra dentro da área.',
    'Inferno Roxo: resumo da estruturação para a presidência, pronto para mandar.',
    'Plano de estudo: criar o hábito de 30 min por dia útil como tarefa recorrente.',
  ]],
  ['9.0', 'Melhorias em cada ferramenta', [
    'Tarefas: selo "Parada há X dias" quando algo está em andamento sem nota nem marcação há 7 dias ou mais.',
    'Ficha da tarefa: mostra o link da tarefa (abrir em 1 toque) e com quem está aguardando.',
    'Status semanal: cada item em andamento leva a última nota da semana, e as tarefas marcadas como Bloqueado aparecem num bloco próprio.',
    'Equipe e 1:1: a pauta traz os bloqueios da pessoa e a última nota de cada entrega.',
    'Agenda: os eventos montados no mapa 3D aparecem no dia, com atalho para o layout.',
    'Projetos: botão Mapa 3D quando existe um layout com o mesmo dia D ou nome.',
    'Relatório da diretoria: bloco de próximos eventos no escritório, com lugares sentados.',
    'Notas de reunião: botão Enviar nota (WhatsApp, e-mail ou copiar).',
    'Relatório: indicador de andamento registrado (notas nas fichas) e quantas tarefas estão paradas.',
    'Playbook de evento: etapa para montar o layout no mapa 3D e contratar fornecedores pelo PDF.',
    'Assistente: atalhos Andamento das tarefas e Planejar o próximo evento.',
  ]],
  ['8.9', 'Mapa 3D mais completo', ['Desfazer e refazer no mapa 3D (botões ↶ ↷; no computador, Ctrl+Z). No computador também: Delete apaga, R gira e as setas movem o item.', 'Lotação estimada do layout: lugares sentados, pessoas em pé e % do piso livre.', 'A busca geral acha os eventos do mapa 3D e as marcações das tarefas, e abre a ficha da tarefa.', 'O Assistente conhece os próximos eventos montados no mapa (itens, sala e observações) para planejar montagem, fornecedores e divulgação.']],
  ['8.8', 'Espaços e eventos em 3D', ['Novo: mapa 3D do escritório em Mais › Espaços e eventos. Crie a base da sala e monte cada evento por modelo (watch party, summit, campeonato, coquetel, ativação).', 'Arraste palco, telão, mesas, PCs, totens e mais; gire, duplique em linha e ajuste medidas. Veja em 3D ou em planta.', 'Baixe a imagem 3D, a planta com medidas, o PDF para fornecedor ou o arquivo do layout, e gere a tarefa de montagem com checklist.']],
  ['8.7', 'Andamento à vista', ['O card mostra a última nota do andamento, sem precisar abrir a tarefa.', 'Na ficha: prazo rápido (Hoje, Amanhã, +3 dias, +1 semana).', 'Botão Enviar na ficha: manda o andamento formatado pelo WhatsApp (situação, checklist e últimas notas).']],
  ['8.6', 'Assistente no dia certo', ['O Assistente sempre usa a data e a hora de Brasília e não trata conversa de ontem como se fosse de hoje.', 'Conversa separada por dia (Hoje, Ontem…) e atalho para começar a conversa do dia.', 'O Assistente lê as marcações e as últimas notas da ficha de cada tarefa.', 'Toque numa marcação do card para ver todas as tarefas com ela.']],
  ['8.5', 'Ficha da tarefa', ['Toque em qualquer tarefa: abre a ficha com marcações de andamento (Orçamento pedido, Aprovado, Pago… ou crie as suas), checklist com progresso e um diário de notas com data e hora.', 'As marcações aparecem no card e a IA lê o diário para sugerir o próximo passo.']],
  ['8.4', 'Diretoria mais completa', ['Relatório mensal com projetos, experimentos de Growth e média do scorecard.']],
  ['8.3', 'Linha do tempo', ['Projetos: próximas 8 semanas com dias D e carga de tarefas, avisando choques e semanas pesadas.']],
  ['8.2', 'Seus playbooks', ['Projetos › Salvar como playbook: o processo vira modelo reaplicável, inclusive pelo Assistente.']],
  ['8.1', 'Assistente monta projetos', ['Peça "monta o drop da camisa para 12/12": o Assistente escolhe o playbook e cria o projeto com um toque.']],
  ['8.0', 'Reagendar com um toque', ['Toque no prazo de qualquer tarefa: Hoje, Amanhã, Sexta, Próxima segunda, 1 semana ou Sem prazo.']],
  ['7.9', 'Voluntários do Inferno Roxo', ['Área Inferno Roxo › Link de inscrição: página pública para divulgar; cada inscrição chega com notificação, WhatsApp e aprovação por setor.']],
  ['7.8', 'Navegação organizada', ['Mais agrupado em Gestão, Receita e dados, Seu crescimento e Sistema.', 'No computador, o menu do topo ganhou Projetos e Status.']],
  ['7.7', 'Área como cockpit', ['Cada área mostra também os projetos e os testes de Growth daquele pilar.']],
  ['7.5', 'Abre na hora', ['A Central abre direto do aparelho, mesmo com internet fraca; as atualizações continuam chegando sozinhas.', 'Sexta: a notificação já traz a nota da semana e o ponto fraco.']],
  ['7.3', 'Novidades e guia', ['Esta tela: o que mudou em cada atualização e a rotina recomendada (Mais › Novidades e guia).']],
  ['7.2', 'Programação de pagamentos', ['Financeiro: contas dos próximos 14 dias por data, pronto para mandar ao financeiro e marcar como agendadas.']],
  ['7.1', 'XML direto do Gmail', ['Anexo XML › Compartilhar › Tarefas: as contas da NF são criadas sozinhas.']],
  ['7.0', 'Scorecard do dono', ['Nota semanal de execução (prazo, foco, plano do dia, retornos e atrasos) no Status semanal.']],
  ['6.9', 'Importar XML da NF-e', ['Financeiro › Importar XML: fornecedor, valor, parcelas e vencimentos sem digitar.']],
  ['6.8', 'Assistente sincronizado', ['A conversa continua do notebook para o celular.']],
  ['6.7', 'Assistente por voz', ['🔊 Ouvir nas respostas e modo mãos livres.']],
  ['6.6', 'Lembrete na hora', ['Tarefa com horário avisa antes (Configurações) e abre a própria tarefa.']],
  ['6.5', 'Delegar e ata', ['→ Delegar: a tarefa vai para a pessoa e o WhatsApp abre com o pedido.', 'Notas: Gerar ata com IA.']],
  ['6.4', 'Tela inicial mais limpa', ['Captura rápida no topo e atalhos compactos.']],
  ['6.3', 'Projetos', ['Playbooks viram projetos com progresso, dia D, próxima etapa e revisão com IA.']],
  ['6.2', 'Várias demandas de uma vez', ['Cole ou compartilhe uma mensagem e a IA separa as tarefas.']],
  ['6.1', 'Peças conectadas', ['Radar vira ideia de growth; o Assistente conhece seus testes.']],
  ['6.0', 'Equipe e 1:1', ['Visão por pessoa e pauta da 1:1 pronta.']],
  ['5.9', 'Growth com ICE', ['Backlog de experimentos com nota ICE e ideias da IA.']],
  ['5.8', 'IA na tarefa', ['✨ Quebrar em passos e Pedir ajuda à IA dentro da tarefa.']],
  ['5.7', 'Quadro Kanban', ['Tarefas › Quadro: arraste entre as colunas.']],
  ['5.6', 'Busca global', ['Lupa no topo (Ctrl+K) busca em tudo.']],
  ['5.5', 'Status semanal', ['Pronto para o gestor, com versão executiva pela IA.']],
  ['5.4', 'Playbooks e triagem', ['Processos padrão viram tarefas com prazo; triagem de paradas.']],
  ['5.3', 'Compartilhar e cobrar', ['Compartilhar do Android, cobrar no WhatsApp, lembrete de fim do dia.']],
  ['5.2', 'Meu dia', ['Plano de hoje, Planejar com IA, Encerrar o dia e ditado por voz.']],
];

const cmp = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

const ROUTINE = [
  ['Ao chegar (5 min)', 'Abra a Central, toque em Planejar com IA e aplique o plano de hoje (3 a 5 tarefas). Na segunda, defina também o foco da semana.'],
  ['Durante o dia', 'Capture tudo na hora (escreva, dite ou compartilhe). Mensagem com várias demandas: Colar mensagem. O que é dos outros: → Delegar.'],
  ['Retornos', 'Use o card Cobrar a equipe e o botão Cobrar. A Central marca a próxima cobrança sozinha.'],
  ['Merchan', 'Recebeu NF? Compartilhe o XML para a Central. Toda semana mande a programação de pagamentos ao financeiro.'],
  ['Fim do dia (3 min)', 'Encerrar o dia: o que ficou vai para amanhã e o aprendizado vira ideia de post.'],
  ['Sexta (15 min)', 'Status semanal + Scorecard do dono para o gestor; feche testes de Growth e registre os aprendizados.'],
  ['Mensal', 'Lance os KPIs no Painel, feche as NFs do mês e prepare a reunião de diretoria.'],
];

export function renderGuide() {
  return `<section class="card guide-card"><h2>Rotina recomendada</h2>
      <ol class="guide-list">${ROUTINE.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join('')}</ol></section>
    <section class="card guide-card"><h2>Novidades</h2>
      <div class="changelog">${CHANGELOG.map(([v, t, items]) => `<div class="cl-item"><span class="cl-v">v${v}</span><div><strong>${esc(t)}</strong>${items.map((i) => `<p>${esc(i)}</p>`).join('')}</div></div>`).join('')}</div></section>`;
}

/** Mostra as novidades uma vez depois da atualização. */
export function maybeShowWhatsNew(appVersion) {
  let seen = null;
  try {
    seen = localStorage.getItem(KEY);
    localStorage.setItem(KEY, appVersion);
  } catch {
    return;
  }
  if (!seen) seen = '6.9.9'; // quem já usava antes desta tela vê as novidades recentes
  if (cmp(seen, appVersion) >= 0) return;
  const items = CHANGELOG.filter(([v]) => cmp(v, seen) > 0 && cmp(v, appVersion) <= 0).slice(0, 6);
  if (!items.length) return;
  $('#wnBody').innerHTML = `<div class="changelog">${items.map(([v, t, list]) => `<div class="cl-item"><span class="cl-v">v${v}</span><div><strong>${esc(t)}</strong>${list.map((i) => `<p>${esc(i)}</p>`).join('')}</div></div>`).join('')}</div>`;
  setTimeout(() => {
    if (!document.querySelector('dialog[open]')) $('#wnDialog').showModal();
  }, 1200);
}
