/*
 * brand.js
 * Marca pessoal: posicionamento, pilares de conteúdo, guia por rede
 * (LinkedIn, Instagram e X), calendário de posts sincronizado, banco de
 * ideias tiradas do próprio trabalho e metas de seguidores.
 */
import { Sync } from './sync.js';
import { esc } from './ui.js';
import { Metrics, defaultMonth, view as b2cView } from './b2c.js';
import { R } from './radar.js';
import { termOfDay } from './learn.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const kv = { get: (k) => C.idb.get('kv', k), set: (k, v) => C.idb.put('kv', v, k) };
const nowIso = () => new Date().toISOString();

export const NETWORKS = {
  linkedin: { name: 'LinkedIn', color: '#0A66C2', freq: '3 posts por semana (ter, qua e qui, 8h ou 12h)', how: 'Gancho forte na 1ª linha, parágrafos de 1 a 2 frases, um aprendizado concreto e uma pergunta no fim. Carrossel em PDF para estudos de caso. Comente em posts de executivos de esports e marketing esportivo todo dia.', role: 'Autoridade: o executivo que entende de B2C, comunidade e receita no esport.' },
  instagram: { name: 'Instagram', color: '#E1306C', freq: '2 reels por semana + stories todo dia de trabalho', how: 'Bastidores reais: office, eventos, caravana, jogos. Reels de 20 a 40 segundos com legenda na tela. Carrossel de 5 a 7 telas para aprendizados. Stories com enquete para conversar com a comunidade.', role: 'Proximidade: o dia a dia de quem faz o esport acontecer.' },
  x: { name: 'X', color: '#15171C', freq: '1 a 3 posts por dia, curtos', how: 'Opinião rápida sobre o mercado, comentários ao vivo em jogos e anúncios do cenário, threads de 5 a 8 posts com estudos de caso. Responda e cite gente relevante do cenário.', role: 'Conversa: estar no assunto do dia do cenário.' },
};

export const PILLARS_CONTENT = [
  { id: 'bastidor', name: 'Bastidores do B2C', share: '35%', desc: 'O que você está construindo no Fluxo W7M: sócio, caravana, Inferno Roxo, merchan, Kings League. Processo, erros e aprendizados.' },
  { id: 'caso', name: 'Estudos de caso', share: '25%', desc: 'O que T1, Karmine, Liquid, FURIA, G3X e clubes fazem, e o que dá para aprender. Vem do Radar e das Referências.' },
  { id: 'opiniao', name: 'Opinião de mercado', share: '20%', desc: 'Sua leitura sobre o negócio dos esports, Kings League, comunidade e creators.' },
  { id: 'carreira', name: 'Carreira e gestão', share: '20%', desc: 'Sua trajetória (de gerente de projetos a head de B2C), liderança de equipe, rotina, aprendizado de marketing.' },
];

const WEEK = [
  ['Seg', 'Instagram', 'Stories: planejamento da semana'],
  ['Ter', 'LinkedIn', 'Bastidor do B2C (o que estou construindo)'],
  ['Qua', 'X + Instagram', 'Thread de estudo de caso + reel de bastidor'],
  ['Qui', 'LinkedIn', 'Estudo de caso ou opinião de mercado'],
  ['Sex', 'LinkedIn + Instagram', 'Aprendizado da semana (carreira e gestão)'],
  ['Sáb/Dom', 'Instagram + X', 'Dia de jogo/evento: stories e comentários ao vivo'],
];

const DEFAULT_POSITIONING = 'Head de B2C e Novas Receitas do Fluxo W7M. Transformo torcida em comunidade e comunidade em receita: sócio-torcedor, merchan, Inferno Roxo, Kings League e CRM. Compartilho os bastidores e o que aprendo com as maiores organizações de esports do mundo.';

let H = null;
export const state = { positioning: null, editing: null, filter: 'proximos' };

export const Posts = {
  all: () => Sync.posts.filter((p) => !p.deletedAt).sort((a, b) => a.date.localeCompare(b.date)),
  get: (id) => Sync.posts.find((p) => p.id === id) || null,
  async save(data) {
    const cur = data.id ? this.get(data.id) : null;
    const p = C.normalizePost(Object.assign({}, cur || { createdAt: nowIso() }, data, { updatedAt: nowIso() }));
    await Sync.upsert('posts', p);
    return p;
  },
  remove: (id) => Sync.remove('posts', id),
};

/** Ideias tiradas do próprio trabalho: entregas, radar, referências e o termo do dia. */
function ideas() {
  const out = [];
  const since = Date.now() - 21 * 86400000;
  const done = Sync.tasks.filter((t) => !t.deletedAt && t.status === 'done' && t.completedAt && Date.parse(t.completedAt) > since).slice(-6).reverse();
  for (const t of done.slice(0, 3)) out.push({ pillar: 'bastidor', network: 'linkedin', title: `Bastidor: como entregamos "${t.title}"`, hint: 'O desafio, o que vocês fizeram e o aprendizado. Sem números internos.' });
  for (const it of R.items.filter((x) => x.relevance >= 4).slice(0, 3)) out.push({ pillar: 'caso', network: 'x', title: `Estudo de caso: ${it.org} – ${it.title}`, hint: it.lesson || it.summary });
  const t = termOfDay();
  out.push({ pillar: 'carreira', network: 'linkedin', title: `O que aprendi sobre ${t.term} na prática`, hint: t.what });
  out.push({ pillar: 'opiniao', network: 'linkedin', title: 'Por que comunidade vale mais que audiência no esport', hint: 'Sua tese: audiência aluga atenção, comunidade gera receita recorrente.' });
  out.push({ pillar: 'bastidor', network: 'instagram', title: 'Reel: um dia de trabalho no B2C do Fluxo W7M', hint: '20 a 40 segundos: office, reunião, evento, torcida.' });
  out.push({ pillar: 'opiniao', network: 'x', title: 'Thread: o que a Kings League ensina sobre transformar creator em receita', hint: 'Patrocínio na live, caravana, merchan dos presidentes e CRM.' });
  out.push({ pillar: 'carreira', network: 'linkedin', title: 'De gerente de projetos a head de B2C: 3 lições', hint: 'Sua trajetória com aprendizados práticos para quem está começando.' });
  return out;
}

const weekStart = () => C.weekStart(new Date());
function weekCount() {
  const ws = weekStart();
  const we = C.addDays(ws, 6);
  const list = Posts.all().filter((p) => p.date >= ws && p.date <= we);
  return { planned: list.length, published: list.filter((p) => p.status === 'publicado').length };
}

export function brandAlert() {
  if (!Sync.v4()) return null;
  const today = C.toDateKey(new Date());
  const dueToday = Posts.all().filter((p) => p.date === today && p.status !== 'publicado');
  if (dueToday.length) return { level: 'amber', route: '#/marca', text: `${dueToday.length === 1 ? '1 post' : dueToday.length + ' posts'} da sua marca pessoal para publicar hoje.` };
  const wc = weekCount();
  const wd = new Date().getDay();
  if (wd >= 3 && wd <= 5 && wc.published < 2) return { level: 'muted', route: '#/marca', text: `Marca pessoal: ${wc.published} ${wc.published === 1 ? 'post publicado' : 'posts publicados'} nesta semana. A meta é pelo menos 4 nas três redes.` };
  return null;
}

export function renderBrandAlert() {
  const a = brandAlert();
  return a ? `<a class="card term-card brand-alert" href="#/marca"><span class="label">Marca pessoal</span><strong>${esc(a.text)}</strong></a>` : '';
}

function postRow(p) {
  const n = NETWORKS[p.network];
  const today = C.toDateKey(new Date());
  const late = p.status !== 'publicado' && p.date < today;
  return `<div class="post-row${late ? ' is-late' : ''}" data-post-id="${esc(p.id)}">
    <span class="post-net" style="--net:${n.color}">${n.name}</span>
    <button type="button" class="post-main" data-brand="edit"><strong>${esc(p.title)}</strong><span class="bill-meta">${C.fromDateKey(p.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} · ${esc(p.status)}${late ? ' · atrasado' : ''}</span></button>
    ${p.status === 'publicado' ? '<span class="hint">✓</span>' : `<button type="button" class="btn btn-sm" data-brand="published">Publiquei</button>`}
  </div>`;
}

export function renderBrand() {
  if (!Sync.v4()) return `<p class="notice">O servidor ainda está sendo atualizado.</p>`;
  if (state.positioning === null) {
    kv.get('brand:' + Sync.id).then((v) => {
      state.positioning = v || DEFAULT_POSITIONING;
      H.render();
    });
    state.positioning = DEFAULT_POSITIONING;
  }
  const today = C.toDateKey(new Date());
  const all = Posts.all();
  const list = state.filter === 'proximos' ? all.filter((p) => p.status !== 'publicado' || p.date >= C.addDays(today, -7)) : all.filter((p) => p.status === 'publicado').reverse();
  const wc = weekCount();
  const ym = b2cView.month || defaultMonth();
  const metrics = Metrics.all().filter((m) => m.pillar === 'marca');
  return `<section class="card report-card brand-pos">
      <div class="closing-head"><h2>Seu posicionamento</h2><button type="button" class="btn btn-sm" data-brand="ask-bio">Gerar bios com IA</button></div>
      <textarea class="input" id="brandPositioning" rows="3">${esc(state.positioning)}</textarea>
      <p class="hint">É a frase que guia tudo: bio dos perfis, o que você posta e o que você não posta. Ser relevante = ser lembrado por um assunto. O seu: <strong>comunidade e receita no esport</strong>.</p>
    </section>

    <div class="kpis kpis-4">
      <div class="card kpi"><span class="stat-label">Nesta semana</span><span class="stat-num">${wc.published}/${Math.max(wc.planned, 4)}</span><span class="stat-sub">posts publicados (meta: 4+)</span></div>
      ${metrics.slice(0, 3).map((m) => `<div class="card kpi"><span class="stat-label">${esc(m.name.replace('Seguidores no ', 'Seguidores · '))}</span><span class="stat-num">${m.values[ym] ?? '–'}</span><span class="stat-sub">${m.target != null ? 'meta ' + m.target : 'defina a meta no Painel'}</span></div>`).join('') || '<div class="card kpi"><span class="stat-label">Metas</span><span class="stat-num">–</span><span class="stat-sub">carregue os indicadores no Painel</span></div>'}
    </div>

    <section class="card report-card">
      <div class="closing-head"><h2>Calendário de posts</h2>
        <div class="btn-row">
          <button type="button" class="chip chip-sm" data-brand-filter="proximos" aria-pressed="${state.filter === 'proximos'}">Próximos</button>
          <button type="button" class="chip chip-sm" data-brand-filter="publicados" aria-pressed="${state.filter === 'publicados'}">Publicados</button>
          <button type="button" class="btn btn-sm btn-primary" data-brand="new">Novo post</button>
          <button type="button" class="btn btn-sm" data-brand="plan-month">Plano do mês com IA</button>
        </div>
      </div>
      ${list.length ? `<div class="bill-list">${list.map(postRow).join('')}</div>` : '<p class="hint">Nenhum post planejado. Use o banco de ideias abaixo ou peça o plano do mês com IA.</p>'}
    </section>

    <section class="pillar">
      <h2 class="group-title">Banco de ideias (do seu trabalho)</h2>
      <div class="ref-grid">${ideas().map((i, k) => `<article class="card ref-card" style="--area:${NETWORKS[i.network].color}">
          <div class="ref-top"><span class="radar-org">${esc(NETWORKS[i.network].name)}</span><span class="radar-cat">${esc(PILLARS_CONTENT.find((p) => p.id === i.pillar).name)}</span></div>
          <h3>${esc(i.title)}</h3><p>${esc(i.hint)}</p>
          <div class="btn-row"><button type="button" class="btn btn-sm btn-primary" data-brand-write="${k}">Escrever com IA</button><button type="button" class="btn btn-sm" data-brand-plan="${k}">Pôr no calendário</button></div>
        </article>`).join('')}</div>
    </section>

    <section class="card report-card">
      <h2>Pilares de conteúdo</h2>
      <ul class="owner-list">${PILLARS_CONTENT.map((p) => `<li><span><strong>${esc(p.name)}</strong><br><span class="hint">${esc(p.desc)}</span></span><strong>${p.share}</strong></li>`).join('')}</ul>
    </section>

    <section class="pillar">
      <h2 class="group-title">Como usar cada rede</h2>
      <div class="ref-grid">${Object.values(NETWORKS).map((n) => `<article class="card ref-card" style="--area:${n.color}"><h3>${n.name}</h3><p><strong>Papel:</strong> ${esc(n.role)}</p><p><strong>Frequência:</strong> ${esc(n.freq)}</p><div class="radar-lesson"><strong>Formato que funciona</strong><p>${esc(n.how)}</p></div></article>`).join('')}</div>
    </section>

    <section class="card report-card">
      <h2>Semana modelo</h2>
      <ul class="owner-list">${WEEK.map(([d, n, w]) => `<li><span><strong>${d}</strong> · ${esc(w)}</span><span class="hint">${esc(n)}</span></li>`).join('')}</ul>
    </section>

    <section class="card report-card">
      <h2>Regras de ouro</h2>
      <ul class="checklist-static">
        <li>Constância vence viralização: 4 posts por semana durante 3 meses fazem mais que 1 post viral.</li>
        <li>Mostre o processo, não só o resultado: erros e aprendizados geram mais conexão.</li>
        <li>Nunca exponha números internos, contratos ou patrocinadores sem aprovação. Use porcentagens e aprendizados.</li>
        <li>Marque e valorize o time, os creators e os parceiros: sua marca cresce junto com a do Fluxo W7M.</li>
        <li>Responda todo comentário nas primeiras 2 horas e comente todo dia em perfis relevantes do cenário.</li>
        <li>Toda segunda, lance os seguidores no Painel (pilar Marca pessoal) para acompanhar a evolução.</li>
      </ul>
    </section>`;
}

function openDialog(id, prefill) {
  const p = id ? Posts.get(id) : null;
  state.editing = p ? p.id : null;
  const f = $('#postForm');
  f.reset();
  $('#postDialogTitle').textContent = p ? 'Editar post' : 'Novo post';
  f.pPillar.innerHTML = PILLARS_CONTENT.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  const v = p || Object.assign({ network: 'linkedin', pillar: 'bastidor', status: 'rascunho', date: C.toDateKey(new Date()) }, prefill || {});
  f.pTitle.value = v.title || '';
  f.pNetwork.value = v.network;
  f.pPillar.value = v.pillar || 'bastidor';
  f.pDate.value = v.date;
  f.pStatus.value = v.status;
  f.pText.value = v.text || '';
  f.pLink.value = v.link || '';
  $('#postDelete').hidden = !p;
  $('#postDialog').showModal();
}

async function submit(e) {
  e.preventDefault();
  const f = $('#postForm');
  if (!f.pTitle.value.trim()) return f.pTitle.focus();
  await Posts.save({ id: state.editing || undefined, title: f.pTitle.value, network: f.pNetwork.value, pillar: f.pPillar.value, date: f.pDate.value, status: f.pStatus.value, text: f.pText.value, link: f.pLink.value });
  $('#postDialog').close();
  H.toast('Post salvo no calendário');
}

function nextSlot(network) {
  const days = { linkedin: [2, 3, 4], instagram: [3, 5], x: [1, 3, 5] }[network];
  let d = C.toDateKey(new Date());
  for (let i = 0; i < 21; i++) {
    const day = C.fromDateKey(d).getDay();
    if (days.includes(day) && !Posts.all().some((p) => p.date === d && p.network === network)) return d;
    d = C.addDays(d, 1);
  }
  return C.toDateKey(new Date());
}

export function initBrand(helpers) {
  H = helpers;
  document.addEventListener('click', async (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const f = e.target.closest('[data-brand-filter]');
    if (f) {
      state.filter = f.dataset.brandFilter;
      return H.render();
    }
    const w = e.target.closest('[data-brand-write]');
    if (w) {
      const i = ideas()[Number(w.dataset.brandWrite)];
      return H.ask(`Escreva um post para o ${NETWORKS[i.network].name} sobre: "${i.title}". Contexto: ${i.hint}. Siga o formato que funciona nessa rede (${NETWORKS[i.network].how}). Meu posicionamento: ${state.positioning}. Me dê 2 versões e uma sugestão de imagem ou vídeo. Não use números internos.`);
    }
    const pl = e.target.closest('[data-brand-plan]');
    if (pl) {
      const i = ideas()[Number(pl.dataset.brandPlan)];
      await Posts.save({ title: i.title, network: i.network, pillar: i.pillar, status: 'ideia', date: nextSlot(i.network), text: i.hint });
      return H.toast('Ideia colocada no calendário');
    }
    const b = e.target.closest('[data-brand]');
    if (!b) return;
    const id = b.closest('[data-post-id]') && b.closest('[data-post-id]').dataset.postId;
    switch (b.dataset.brand) {
      case 'new':
        return openDialog(null, { date: nextSlot('linkedin') });
      case 'edit':
        return openDialog(id);
      case 'published':
        await Posts.save({ id, status: 'publicado' });
        return H.toast('Publicado! Responda os comentários nas primeiras 2 horas.');
      case 'ask-bio':
        return H.ask(`Com base no meu posicionamento ("${state.positioning}"), escreva minhas bios para LinkedIn (título de até 220 caracteres + seção Sobre curta), Instagram (até 150 caracteres) e X (até 160 caracteres). Tom profissional e próximo, com palavras que o mercado de esports procura.`);
      case 'plan-month':
        return H.ask(`Monte meu plano de conteúdo do próximo mês para LinkedIn, Instagram e X, para eu ser mais relevante no cenário de esports. Meu posicionamento: "${state.positioning}". Pilares: ${PILLARS_CONTENT.map((p) => p.name + ' ' + p.share).join(', ')}. Use o que está acontecendo nas minhas áreas (demandas concluídas, radar, Inferno Roxo, Kings League, sócio). Entregue uma tabela por semana com dia, rede, formato, tema e gancho da primeira linha, e sugira as tarefas.`);
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'brandPositioning') return;
    state.positioning = e.target.value;
    clearTimeout(state._t);
    state._t = setTimeout(() => kv.set('brand:' + Sync.id, state.positioning), 400);
  });
  $('#postForm').addEventListener('submit', submit);
  $('#postDelete').addEventListener('click', async () => {
    const p = Posts.get(state.editing);
    if (!p) return;
    const ok = await H.confirmDialog({ title: 'Excluir este post?', message: `“${p.title}” sai do calendário.`, confirmLabel: 'Excluir' });
    if (!ok) return;
    await Posts.remove(p.id);
    $('#postDialog').close();
    H.toast('Post excluído');
  });
}
