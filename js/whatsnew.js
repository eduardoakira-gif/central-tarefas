/*
 * whatsnew.js
 * Novidades de cada versão (mostradas uma vez depois de atualizar) e o guia
 * com a rotina recomendada de uso da Central.
 */
import { esc } from './ui.js';

const $ = (sel, el = document) => el.querySelector(sel);
const KEY = 'ct-seen-version';

export const CHANGELOG = [
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
