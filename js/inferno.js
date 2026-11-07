/*
 * inferno.js
 * Estrutura profissional do Inferno Roxo: setores (modelo de torcidas
 * organizadas, atléticas universitárias e torcidas de esports como a
 * Dezorganizada Furiosa), voluntariado, governança e plano de implantação.
 * O andamento de cada setor fica na coleção "crew" (sincronizada).
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';


const vol = { token: null, filter: 'nova' };
const formUrl = (t) => new URL('voluntario.html?f=' + t, location.href.split('#')[0].split('?')[0]).href;
const APP_STATUS = { nova: 'Nova', contatada: 'Contatada', aprovada: 'Aprovada', recusada: 'Recusada' };
const sectorName = (id) => (SECTORS.find((x) => x[0] === id) || [id, id || 'Sem preferência'])[1];

function renderApplicants() {
  if (!Sync.v4() || !(Sync.serverColls || []).includes('applicants')) return '';
  const list = (Sync.applicants || []).filter((a) => !a.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = list.filter((a) => vol.filter === 'todas' || a.status === vol.filter);
  const count = (s) => list.filter((a) => a.status === s).length;
  const row = (a) => `<div class="applicant" data-applicant="${esc(a.id)}">
      <div class="ap-main"><strong>${esc(a.name)}</strong><span class="hint">${esc(sectorName(a.sector))}${a.city ? ' · ' + esc(a.city) : ''}${a.instagram ? ' · @' + esc(a.instagram) : ''} · ${new Date(a.createdAt).toLocaleDateString('pt-BR')}</span>
        ${a.availability ? `<span class="hint">Disponibilidade: ${esc(a.availability)}</span>` : ''}${a.why ? `<p>${esc(a.why)}</p>` : ''}${a.experience ? `<p class="hint">Experiência: ${esc(a.experience)}</p>` : ''}</div>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" data-ap="wa">WhatsApp</button>
        <select class="select select-sm" data-ap-status aria-label="Situação">${Object.entries(APP_STATUS).map(([k, n]) => `<option value="${k}"${a.status === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </div></div>`;
  return `<h3 class="sub-h">Inscrições de voluntários <span class="hint">(${count('nova')} novas)</span></h3>
    <section class="card report-card vol-card">
      <div class="closing-head"><span>Página pública de inscrição para divulgar no Instagram e no grupo da torcida. Quem se inscreve não vê nada da sua Central.</span>
        <div class="btn-row">${vol.token ? `<button type="button" class="btn btn-sm" data-vol="copy">Copiar link</button><a class="btn btn-sm" href="${esc(formUrl(vol.token))}" target="_blank" rel="noopener">Abrir</a>` : '<button type="button" class="btn btn-sm btn-primary" data-vol="link">Link de inscrição</button>'}</div></div>
      ${vol.token ? `<input class="input vol-link" readonly value="${esc(formUrl(vol.token))}" aria-label="Link de inscrição">` : ''}
      <div class="chips">${['nova', 'contatada', 'aprovada', 'recusada', 'todas'].map((s) => `<button type="button" class="chip" data-vol-filter="${s}" aria-pressed="${vol.filter === s}">${s === 'todas' ? 'Todas' : APP_STATUS[s]} <span class="chip-count">${s === 'todas' ? list.length : count(s) || ''}</span></button>`).join('')}</div>
      ${shown.map(row).join('') || `<p class="hint">${list.length ? 'Nada nesta situação.' : 'Nenhuma inscrição ainda. Gere o link e divulgue com o post de vagas.'}</p>`}
      <p class="hint">Ao aprovar, o voluntário entra na contagem do setor escolhido. Combine a integração pelo WhatsApp.</p>
    </section>`;
}

const C = window.Core;
const nowIso = () => new Date().toISOString();

// [id, nome, missão, responsabilidades, perfil do voluntário, indicador, voluntários sugeridos]
export const SECTORS = [
  ['conselho', 'Conselho e coordenação geral', 'Dar direção, decidir junto e falar em nome da torcida com o Fluxo W7M.', ['Reunião mensal com o Fluxo W7M', 'Aprovar calendário e orçamento', 'Cuidar do código de conduta', 'Escolher e acompanhar os coordenadores'], 'Lideranças antigas e respeitadas, eleitas pela torcida.', 'Reunião mensal feita e decisões registradas', 5],
  ['festa', 'Festa e arquibancada', 'Fazer a torcida ser vista e sentida: bandeirão, mosaico, coreografia, sinalizadores permitidos.', ['Criar e produzir bandeirão e faixas', 'Planejar mosaicos e coreografias', 'Montar o setor do Inferno Roxo nos eventos', 'Guardar e cuidar do material'], 'Quem gosta de criar, montar e chegar cedo.', 'Ações de arquibancada por evento', 8],
  ['musica', 'Música e bateria', 'Cânticos oficiais e bateria: a identidade sonora da torcida.', ['Compor e ensaiar cânticos', 'Montar e treinar a bateria', 'Publicar letras para a torcida aprender', 'Puxar os cantos nos jogos'], 'Quem toca instrumento, canta ou compõe.', 'Cânticos oficiais e ensaios por mês', 8],
  ['logistica', 'Logística e caravanas', 'Levar a torcida aos eventos com segurança e organização.', ['Organizar caravanas e transporte', 'Lista de presença e ingressos', 'Ponto de encontro e horários', 'Contato com a arena e com a segurança'], 'Organizado, pontual, bom com planilhas e pessoas.', 'Ocupação da caravana e atrasos', 6],
  ['vestuario', 'Vestuário e produtos', 'A linha do Inferno Roxo: camisa, bandeira, cachecol, kit do membro.', ['Criar a linha da torcida com o Fluxo W7M', 'Pré-venda e entrega dos kits', 'Controle de estoque da torcida', 'Ideias de produto vindas da torcida'], 'Quem curte moda, design ou vendas.', 'Kits vendidos e receita da torcida', 4],
  ['comunicacao', 'Comunicação e mídia', 'Instagram, X, TikTok e grupo oficial: mostrar a força da torcida.', ['Calendário de posts e stories', 'Fotos e vídeos nos eventos', 'Convocações para jogos e ações', 'Responder seguidores'], 'Quem filma, edita, escreve ou faz design.', 'Seguidores, alcance e convocações', 6],
  ['acolhimento', 'Acolhimento e membros', 'Receber bem quem chega e manter o cadastro de membros em dia.', ['Cadastro e carteirinha dos membros', 'Boas-vindas aos novos', 'Grupo oficial e moderação', 'Ações para membros ativos'], 'Comunicativo, paciente, que gosta de gente.', 'Membros cadastrados e ativos no mês', 5],
  ['nucleos', 'Núcleos regionais', 'Levar o Inferno Roxo para outras cidades.', ['Abrir e acompanhar núcleos', 'Escolher o líder de cada núcleo', 'Watch parties regionais', 'Kit do líder de núcleo'], 'Quem mora fora de SP e quer liderar a torcida na cidade.', 'Núcleos ativos', 3],
  ['parcerias', 'Parcerias e patrocínio da torcida', 'Gerar recurso para a torcida com marcas parceiras, junto com o Fluxo W7M.', ['Propostas como bandeirão e caravana patrocinados', 'Entregar a contrapartida para o parceiro', 'Relatório para o parceiro'], 'Quem tem perfil comercial.', 'Parceiros e receita de patrocínio', 2],
  ['financeiro', 'Financeiro e prestação de contas', 'Transparência com cada real da torcida.', ['Caixa da torcida (vaquinhas, kits, patrocínios)', 'Prestação de contas mensal', 'Compras do material'], 'Organizado e de confiança.', 'Prestação de contas publicada', 2],
  ['conduta', 'Conduta e segurança', 'Garantir que a torcida seja festa: zero violência, assédio ou discriminação.', ['Aplicar o código de conduta', 'Orientar a torcida nos eventos', 'Registrar ocorrências e aplicar medidas', 'Contato com a segurança do evento'], 'Calmo, firme e respeitado.', 'Ocorrências por evento', 3],
];

const REFS = [
  ['Dezorganizada Furiosa (FURIA)', 'Como você contou: a torcida é dividida em setores (festa, logística, vestuário, música) e abre vagas de trabalho voluntário para quem quer ajudar em cada área. É assim que organiza o crescimento. Ela também levou mais de 130 torcedores a um Major em Budapeste.'],
  ['Torcidas organizadas de futebol', 'Diretoria, departamentos de bandeiras e faixas, bateria, caravanas, sede e produtos próprios. O que copiar: organização e identidade. O que evitar: violência e brigas, que destroem marca e patrocínio.'],
  ['Atléticas universitárias', 'Diretoria com pastas (eventos, marketing, produtos, financeiro, esportes), mandato com eleição, novos membros entrando pela base e prestação de contas. Ótimo modelo de voluntariado com rodízio e formação de novas lideranças.'],
  ['Karmine Corp (Blue Wall)', 'Cultura de ultras no esport: rituais, cânticos e presença em massa, com um evento próprio que lota arenas.'],
  ['Núcleos oficiais do Barcelona (penyes)', 'Torcida regional reconhecida pelo clube, com líder, carteirinha e benefícios: escala sem custo fixo.'],
];

const GOVERNANCE = [
  'Estatuto simples (1 página): missão, setores, como se entra, como se elege e como se sai.',
  'Código de conduta público, assinado por todo membro e voluntário. Descumpriu: suspensão da carteirinha.',
  'Mandato de 1 ano para conselho e coordenadores, com eleição aberta aos membros ativos.',
  'Reunião mensal do conselho com o Fluxo W7M e reunião quinzenal de cada setor.',
  'Prestação de contas mensal de todo dinheiro da torcida.',
  'O Fluxo W7M apoia (estrutura, palco, produto), quem lidera é a torcida.',
];

const VOLUNTEER_FLOW = [
  ['Abrir vagas', 'Post no Instagram e no grupo com os setores e o que cada um faz.'],
  ['Inscrição', 'Formulário curto: nome, idade, cidade, setor desejado, experiência e disponibilidade.'],
  ['Conversa', 'Bate-papo de 15 minutos com o coordenador do setor.'],
  ['Integração', 'Boas-vindas, código de conduta, grupo do setor e primeira tarefa.'],
  ['Experiência de 30 dias', 'Participa de pelo menos 2 ações. Depois confirma ou muda de setor.'],
  ['Reconhecimento', 'Crachá e camisa de voluntário, acesso ao setor nos eventos, destaque nas redes e certificado de voluntariado.'],
];

const crewOf = (id) => Sync.crew.find((c) => c.id === id) || C.normalizeCrew({ id });
const STATUS = { montar: 'A montar', recrutando: 'Recrutando', ativo: 'Ativo' };

export function renderInfernoStructure() {
  const rows = SECTORS.map(([id, name, mission, resp, profile, kpi, sug]) => {
    const c = crewOf(id);
    const goal = c.goal || sug;
    return `<details class="card sector" data-sector="${id}">
      <summary>
        <span><strong>${esc(name)}</strong><br><span class="hint">${c.coordinator ? 'Coord.: ' + esc(c.coordinator) : 'Sem coordenador'} · ${c.volunteers}/${goal} voluntários</span></span>
        <span class="sector-status st-${c.status}">${STATUS[c.status]}</span>
      </summary>
      <p>${esc(mission)}</p>
      <ul class="checklist-static">${resp.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="hint"><strong>Perfil do voluntário:</strong> ${esc(profile)} · <strong>Indicador:</strong> ${esc(kpi)}</p>
      <div class="sector-edit">
        <label><span>Coordenador(a)</span><input class="input input-sm" data-crew="coordinator" value="${esc(c.coordinator)}" placeholder="Nome"></label>
        <label><span>Voluntários</span><input class="input input-sm" type="number" min="0" data-crew="volunteers" value="${c.volunteers}"></label>
        <label><span>Meta</span><input class="input input-sm" type="number" min="0" data-crew="goal" value="${goal}"></label>
        <label><span>Situação</span><select class="select select-sm" data-crew="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === c.status ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" data-inferno="vaga" data-id="${id}">Post de vagas deste setor</button>
      </div>
    </details>`;
  }).join('');
  const sum = SECTORS.reduce((a, [id, , , , , , sug]) => {
    const c = crewOf(id);
    a.vol += c.volunteers;
    a.goal += c.goal || sug;
    a.coord += c.coordinator ? 1 : 0;
    a.active += c.status === 'ativo' ? 1 : 0;
    return a;
  }, { vol: 0, goal: 0, coord: 0, active: 0 });

  return `<section class="card report-card inferno-plan">
    <div class="closing-head"><h2>Estrutura da torcida (planejamento estratégico)</h2>
      <div class="btn-row">
        <button type="button" class="btn btn-sm btn-primary" data-inferno="tasks">Criar tarefas da estruturação</button>
        <button type="button" class="btn btn-sm" data-inferno="ask">Direcionamento com IA</button>
      </div>
    </div>
    <p>O Inferno Roxo já existe e tem Instagram. O próximo passo é virar uma organização: <strong>setores com coordenador, voluntários com função clara, governança e calendário</strong>. É o modelo da Dezorganizada Furiosa, das torcidas organizadas de futebol e das atléticas universitárias.</p>
    <div class="kpis kpis-4">
      <div class="card kpi"><span class="stat-label">Setores ativos</span><span class="stat-num">${sum.active}/${SECTORS.length}</span><span class="stat-sub">com coordenador e rotina</span></div>
      <div class="card kpi"><span class="stat-label">Coordenadores</span><span class="stat-num">${sum.coord}/${SECTORS.length}</span><span class="stat-sub">um por setor</span></div>
      <div class="card kpi"><span class="stat-label">Voluntários</span><span class="stat-num">${sum.vol}/${sum.goal}</span><span class="stat-sub">meta somando os setores</span></div>
      <div class="card kpi"><span class="stat-label">Fase</span><span class="stat-num">${sum.coord < 4 ? '1' : sum.active < 6 ? '2' : '3'}</span><span class="stat-sub">${sum.coord < 4 ? 'montar o conselho e os coordenadores' : sum.active < 6 ? 'abrir vagas e ativar os setores' : 'escalar: núcleos e patrocínio'}</span></div>
    </div>

    ${renderApplicants()}

    <h3 class="sub-h">Organograma</h3>
    <div class="org">
      <div class="org-top">Conselho do Inferno Roxo<span>eleito pela torcida · fala com o Fluxo W7M</span></div>
      <div class="org-row">${SECTORS.filter(([id]) => id !== 'conselho').map(([id, name]) => `<span class="org-box st-${crewOf(id).status}">${esc(name.split(' e ')[0])}</span>`).join('')}</div>
    </div>

    <h3 class="sub-h">Setores <span class="hint">(toque para abrir, definir coordenador e acompanhar)</span></h3>
    <div class="sectors">${rows}</div>

    <h3 class="sub-h">Voluntariado: como abrir e preencher as vagas</h3>
    <ol class="plan-list">${VOLUNTEER_FLOW.map(([t, d]) => `<li><strong>${esc(t)}:</strong> ${esc(d)}</li>`).join('')}</ol>
    <div class="btn-row">
      <button type="button" class="btn btn-sm" data-inferno="copy-form">Copiar perguntas do formulário</button>
      <button type="button" class="btn btn-sm" data-inferno="vaga" data-id="todos">Post de vagas (todos os setores)</button>
    </div>

    <h3 class="sub-h">Governança</h3>
    <ul class="checklist-static">${GOVERNANCE.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>

    <h3 class="sub-h">Referências</h3>
    <div class="ref-grid">${REFS.map(([t, d]) => `<article class="card ref-card" style="--area:#7C3AED"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('')}</div>

    <h3 class="sub-h">Calendário de implantação</h3>
    <ol class="plan-list">
      <li><strong>Semanas 1 e 2:</strong> conversar com as lideranças, formar o conselho e escrever estatuto e código de conduta.</li>
      <li><strong>Semanas 3 e 4:</strong> escolher os coordenadores de Festa, Música, Logística, Comunicação e Acolhimento.</li>
      <li><strong>Semanas 5 e 6:</strong> abrir as primeiras vagas de voluntário e fazer a integração.</li>
      <li><strong>Semanas 7 e 8:</strong> primeira ação completa com todos os setores (jogo da Kings League com caravana, bandeirão, bateria e cobertura).</li>
      <li><strong>Semanas 9 a 12:</strong> Vestuário (kit), primeiro núcleo regional e primeiro parceiro da torcida.</li>
    </ol>
  </section>`;
}

const FORM = `Formulário de voluntário do Inferno Roxo

1. Nome completo
2. Idade
3. Cidade e estado
4. Instagram
5. Em qual setor você quer ajudar? (Festa e arquibancada, Música e bateria, Logística e caravanas, Vestuário e produtos, Comunicação e mídia, Acolhimento, Núcleos regionais, Parcerias, Financeiro, Conduta e segurança)
6. O que você já sabe fazer que ajuda nesse setor?
7. Quanto tempo por semana você consegue dedicar?
8. Vai aos eventos presenciais em SP? (Sempre / às vezes / não)
9. Por que você quer fazer parte do Inferno Roxo?
10. Você concorda com o código de conduta da torcida? (zero violência, assédio ou discriminação)`;

export function initInferno(H) {
  document.addEventListener('change', async (e) => {
    const f = e.target.closest('[data-crew]');
    if (!f) return;
    const id = f.closest('[data-sector]').dataset.sector;
    const cur = crewOf(id);
    const next = C.normalizeCrew(Object.assign({}, cur, { [f.dataset.crew]: f.value, updatedAt: nowIso(), createdAt: cur.createdAt || nowIso() }));
    await Sync.upsert('crew', next);
  });
  document.addEventListener('change', async (e) => {
    const st = e.target.closest && e.target.closest('[data-ap-status]');
    if (!st) return;
    const a = (Sync.applicants || []).find((x) => x.id === st.closest('[data-applicant]').dataset.applicant);
    if (!a) return;
    const was = a.status;
    await Sync.upsert('applicants', C.normalizeApplicant(Object.assign({}, a, { status: st.value, updatedAt: nowIso() })));
    // aprovar ou desaprovar mexe na contagem do setor
    const sec = SECTORS.find((x) => x[0] === a.sector);
    if (sec && (was === 'aprovada') !== (st.value === 'aprovada')) {
      const cur = crewOf(sec[0]);
      await Sync.upsert('crew', C.normalizeCrew(Object.assign({}, cur, { volunteers: Math.max(0, cur.volunteers + (st.value === 'aprovada' ? 1 : -1)), updatedAt: nowIso(), createdAt: cur.createdAt || nowIso() })));
    }
    H.toast(st.value === 'aprovada' ? `Aprovado${sec ? ' em ' + sec[1] : ''}. Faça a integração pelo WhatsApp.` : 'Situação atualizada');
  });
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const vf = e.target.closest('[data-vol-filter]');
    if (vf) return ((vol.filter = vf.dataset.volFilter), H.render());
    const v = e.target.closest('[data-vol]');
    if (v) {
      if (v.dataset.vol === 'link') {
        try {
          vol.token = (await Sync.call('volunteerToken', {})).token;
          H.render();
          return H.copy(formUrl(vol.token), 'Link de inscrição copiado. Divulgue no post de vagas.');
        } catch (err) {
          return H.toast(err.message);
        }
      }
      if (v.dataset.vol === 'copy') return H.copy(formUrl(vol.token), 'Link copiado');
    }
    const ap = e.target.closest('[data-ap]');
    if (ap) {
      const a = (Sync.applicants || []).find((x) => x.id === ap.closest('[data-applicant]').dataset.applicant);
      if (!a) return;
      const first = a.name.split(' ')[0];
      const msg = `Fala, ${first}! Aqui é o Edu, do Fluxo W7M. Vi sua inscrição para ser voluntário do Inferno Roxo${a.sector ? ' no setor ' + sectorName(a.sector) : ''}. Bora conversar sobre como você pode ajudar? 💜🔥`;
      window.open(`https://wa.me/${a.phone.length <= 11 ? '55' + a.phone : a.phone}?text=${encodeURIComponent(msg)}`, '_blank');
      if (a.status === 'nova') await Sync.upsert('applicants', C.normalizeApplicant(Object.assign({}, a, { status: 'contatada', updatedAt: nowIso() })));
      return;
    }
    const b = e.target.closest('[data-inferno]');
    if (!b) return;
    const a = b.dataset.inferno;
    if (a === 'copy-form') return H.copy(FORM, 'Perguntas copiadas. Cole no Google Forms ou no Typeform.');
    if (a === 'vaga') {
      const s = SECTORS.find((x) => x[0] === b.dataset.id);
      const what = s ? `do setor "${s[1]}" (missão: ${s[2]}; o que faz: ${s[3].join(', ')}; perfil: ${s[4]})` : `de todos os setores (${SECTORS.map((x) => x[1]).join(', ')})`;
      return H.ask(`Escreva o post de abertura de vagas de voluntário do Inferno Roxo, torcida organizada do Fluxo W7M, ${what}. Entregue: legenda do Instagram com chamada forte e emojis na medida, texto dos 5 slides do carrossel (o que é o setor, o que faz, quem procuramos, o que o voluntário ganha, como se inscrever), 3 stories para divulgar e a mensagem para o grupo da torcida. Tom de torcida: paixão, pertencimento e respeito ao código de conduta.`);
    }
    if (a === 'ask') {
      return H.ask(`Com base na estrutura de setores do Inferno Roxo (${SECTORS.map((x) => x[1]).join(', ')}) e no andamento atual (${SECTORS.map((x) => { const c = crewOf(x[0]); return `${x[1]}: ${STATUS[c.status]}, ${c.volunteers} voluntários${c.coordinator ? ', coord. ' + c.coordinator : ''}`; }).join('; ')}), qual o próximo passo para estruturar a torcida de forma profissional? Use referências de torcidas organizadas de futebol, atléticas universitárias e da Dezorganizada Furiosa. Sugira as tarefas.`);
    }
    if (a === 'tasks') {
      const areas = (Sync.central.areas || []).filter((x) => x.name.toLowerCase().includes('inferno'));
      let areaId = areas[0] && areas[0].id;
      if (!areaId) {
        const list = Sync.central.areas.map((x) => Object.assign({}, x));
        const na = { id: C.newAreaId(), name: 'Inferno Roxo', color: '#7C3AED' };
        list.push(na);
        await Sync.patchCentral({ areas: list });
        areaId = na.id;
      }
      const today = C.toDateKey(new Date());
      const plan = [
        ['Inferno Roxo: formar o conselho com as lideranças atuais', 7, 'advocacy'],
        ['Inferno Roxo: escrever estatuto de 1 página e código de conduta', 14, 'operacao'],
        ['Inferno Roxo: definir coordenadores de Festa, Música, Logística, Comunicação e Acolhimento', 28, 'operacao'],
        ['Inferno Roxo: criar formulário de voluntário e abrir as primeiras vagas', 35, 'advocacy'],
        ['Inferno Roxo: integração dos voluntários (boas-vindas, conduta, grupos por setor)', 42, 'retencao'],
        ['Inferno Roxo: primeira ação completa com todos os setores num jogo da Kings League', 56, 'advocacy'],
        ['Inferno Roxo: lançar o kit do setor de Vestuário em pré-venda', 70, 'conversao'],
        ['Inferno Roxo: abrir o primeiro núcleo regional', 84, 'advocacy'],
      ];
      let n = 0;
      for (const [title, d, funnel] of plan) {
        if (Sync.tasks.some((t) => !t.deletedAt && t.title === title)) continue;
        await Tasks.create({ title, area: areaId, funnel, dueDate: C.addDays(today, d), priority: d <= 14 ? 'high' : 'normal' });
        n++;
      }
      return H.toast(n ? `${n} tarefas da estruturação criadas com prazo` : 'As tarefas da estruturação já existem');
    }
  });
}
