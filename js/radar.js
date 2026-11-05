/*
 * radar.js
 * Radar das organizações de esports: notícias buscadas pelo servidor de hora em
 * hora (GitHub Actions + Claude API com busca na web), com resumo e a lição
 * prática para a sua área.
 */
import { Sync } from './sync.js';
import { Local } from './storage.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const kv = { get: (k) => C.idb.get('kv', k), set: (k, v) => C.idb.put('kv', v, k) };

export const DEFAULT_CONTEXT = `Sou head de B2C do Fluxo W7M, organização brasileira de esports (Free Fire, Rainbow Six, LoL, Valorant, CS2, EA FC, Mobile Legends, Kings League, Fortnite e Delta Force), patrocinada pelo Banco do Brasil. Minha área cuida das novas receitas com o torcedor.
Pilares em ordem de prioridade: 1) Comunidade (o mais importante), 2) Sócio-Torcedor, 3) Merchan/E-commerce, 4) CRM (régua de comunicação que conecta tudo).
Referências: Karmine Corp (comunidade e eventos), T1 (fandom e merchan ligado a ídolos), Team Liquid (fidelidade e CRM), 100 Thieves (merchan lifestyle e drops), FURIA, LOUD e MIBR no Brasil.`;

export const R = {
  items: [],
  status: { lastAt: null, lastError: null },
  defaultOrgs: [],
  loadedAt: 0,
  loading: false,
  filter: { cat: '', org: '', starred: false },
  seenAt: null,
};

let H = null;

async function load(force = false) {
  if (!Sync.v4()) return;
  if (R.loading || (!force && Date.now() - R.loadedAt < 120000)) return;
  R.loading = true;
  try {
    const r = await Sync.call('radarList');
    R.items = r.items || [];
    R.status = r.radar || R.status;
    R.defaultOrgs = r.defaultOrgs || [];
    R.loadedAt = Date.now();
    await kv.set('radar:' + Sync.id, { items: R.items, status: R.status, defaultOrgs: R.defaultOrgs });
  } catch (err) {
    if (!R.items.length) H.toast(err.message);
  } finally {
    R.loading = false;
    H.render();
  }
}

export async function openRadar() {
  if (!R.items.length) {
    const cache = await kv.get('radar:' + Sync.id);
    if (cache) Object.assign(R, { items: cache.items || [], status: cache.status || R.status, defaultOrgs: cache.defaultOrgs || [] });
  }
  if (R.seenAt === null) R.seenAt = (await Local.loadDevice(Sync.id)).radarSeenAt || null;
  load();
}

export function leaveRadar() {
  const now = new Date().toISOString();
  R.seenAt = now;
  Local.patchDevice(Sync.id, { radarSeenAt: now });
}

const ago = (iso) => {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

function dayLabel(iso) {
  const key = C.toDateKey(new Date(iso));
  const today = C.toDateKey(new Date());
  if (key === today) return 'Hoje';
  if (key === C.addDays(today, -1)) return 'Ontem';
  const s = C.fromDateKey(key).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function card(it) {
  const isNew = R.seenAt && it.createdAt > R.seenAt;
  return `<article class="card radar-item${it.starred ? ' is-starred' : ''}" data-radar-id="${esc(it.id)}">
    <div class="radar-top">
      <span class="radar-org">${esc(it.org)}</span>
      <span class="radar-cat">${esc(it.category)}</span>
      ${isNew ? '<span class="badge badge-new">Nova</span>' : ''}
      <span class="radar-rel" title="Relevância para a sua área">${'●'.repeat(it.relevance)}${'○'.repeat(5 - it.relevance)}</span>
    </div>
    <a class="radar-title" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
    <p class="radar-summary">${esc(it.summary)}</p>
    ${it.lesson ? `<div class="radar-lesson"><strong>Lição para você</strong><p>${esc(it.lesson)}</p></div>` : ''}
    <div class="radar-foot">
      <span class="hint">${esc(it.source || new URL(it.url).hostname.replace(/^www\./, ''))}${it.publishedAt ? ' · ' + C.fromDateKey(it.publishedAt).toLocaleDateString('pt-BR') : ''}</span>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" data-radar="star">${it.starred ? '★ Salva' : '☆ Salvar referência'}</button>
        <button type="button" class="btn btn-sm" data-radar="task">Virar tarefa</button>
        <button type="button" class="icon-btn" data-radar="delete" title="Remover" aria-label="Remover notícia">×</button>
      </div>
    </div>
  </article>`;
}

export function renderRadar() {
  const s = C.mergeSettings(Sync.central.settings);
  if (!Sync.v4()) return `<p class="notice">O servidor ainda está sendo atualizado. O radar começa a funcionar assim que a atualização terminar.</p>`;
  if (!s.radarEnabled) {
    return `<section class="card empty-panel">
      <h2>Ligue o radar das organizações</h2>
      <p>De hora em hora, a Central busca na web o que as maiores organizações de esports do mundo e do Brasil publicaram (T1, Karmine Corp, Team Liquid, 100 Thieves, G2, FURIA, LOUD, MIBR e outras), resume em português e escreve a lição prática para a sua área. As novidades relevantes chegam como notificação no celular.</p>
      <p class="hint">Usa seus créditos da Claude API: cerca de US$ 0,05 a 0,08 por busca. De hora em hora, das ${s.startTime} às ${s.endTime}, fica em torno de US$ 0,70 por dia. Dá para trocar a frequência em Configurações.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-radar="enable">Ligar o radar</button></div>
    </section>`;
  }
  const items = R.items.filter((it) => (!R.filter.cat || it.category === R.filter.cat) && (!R.filter.org || it.org === R.filter.org) && (!R.filter.starred || it.starred));
  const cats = [...new Set(R.items.map((i) => i.category))].sort();
  const orgs = [...new Set(R.items.map((i) => i.org))].sort((a, b) => a.localeCompare(b));
  const next = R.status.lastAt ? new Date(Date.parse(R.status.lastAt) + s.radarFrequencyHours * 3600000) : null;

  let list = '';
  let day = '';
  for (const it of items) {
    const d = dayLabel(it.createdAt);
    if (d !== day) {
      list += `<h2 class="group-title radar-day">${d}</h2>`;
      day = d;
    }
    list += card(it);
  }
  return `<div class="radar-status">
      <span>Última busca: <strong>${ago(R.status.lastAt)}</strong>${next && next > new Date() ? ` · próxima por volta de ${next.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      <button type="button" class="btn btn-sm" data-radar="run" id="radarRun">Buscar agora</button>
    </div>
    ${R.status.lastError ? `<p class="notice">A última busca falhou: ${esc(R.status.lastError)}</p>` : ''}
    <div class="toolbar radar-toolbar">
      <div class="chips">
        <button type="button" class="chip" data-radar-cat="" aria-pressed="${!R.filter.cat && !R.filter.starred}">Todas <span class="chip-count">${R.items.length}</span></button>
        <button type="button" class="chip" data-radar="only-starred" aria-pressed="${R.filter.starred}">★ Salvas <span class="chip-count">${R.items.filter((i) => i.starred).length || ''}</span></button>
        ${cats.map((c) => `<button type="button" class="chip" data-radar-cat="${esc(c)}" aria-pressed="${R.filter.cat === c}">${esc(c)}</button>`).join('')}
      </div>
      ${orgs.length > 1 ? `<select class="select" id="radarOrg" aria-label="Filtrar por organização"><option value="">Todas as organizações</option>${orgs.map((o) => `<option${o === R.filter.org ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="radar-list">${list || `<div class="empty"><div class="empty-title">${R.loading ? 'Carregando…' : 'Nenhuma notícia ainda'}</div><p class="empty-text">${R.items.length ? 'Nada com esse filtro.' : 'A primeira busca roda na próxima hora cheia. Toque em “Buscar agora” para não esperar.'}</p></div>`}</div>`;
}

async function mark(id, patch) {
  const it = R.items.find((x) => x.id === id);
  if (it) Object.assign(it, patch);
  H.render();
  try {
    await Sync.call('radarMark', { itemId: id, patch });
  } catch (err) {
    H.toast(err.message);
  }
}

async function onAction(action, el) {
  const id = el.closest('[data-radar-id]') && el.closest('[data-radar-id]').dataset.radarId;
  const it = id ? R.items.find((x) => x.id === id) : null;
  switch (action) {
    case 'enable': {
      const s = C.mergeSettings(Sync.central.settings);
      await Sync.patchCentral({
        settings: Object.assign({}, s, { radarEnabled: true, context: s.context || DEFAULT_CONTEXT }),
      });
      H.toast('Radar ligado. A primeira busca já está rodando.');
      await Sync.flush().catch(() => {});
      return runNow();
    }
    case 'run':
      return runNow();
    case 'star':
      return mark(id, { starred: !it.starred });
    case 'only-starred':
      R.filter.starred = !R.filter.starred;
      R.filter.cat = '';
      return H.render();
    case 'delete':
      R.items = R.items.filter((x) => x.id !== id);
      H.render();
      return Sync.call('radarDelete', { itemId: id }).catch((err) => H.toast(err.message));
    case 'task':
      return H.openTaskDialog({
        title: `Estudar e aplicar: ${it.org} – ${it.title}`.slice(0, 200),
        description: `${it.summary}\n\nLição: ${it.lesson}`,
        link: it.url,
        priority: it.relevance >= 4 ? 'high' : 'normal',
      });
  }
}

async function runNow() {
  const btn = $('#radarRun');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Buscando… (até 1 min)';
  }
  try {
    const r = await Sync.call('radarRunNow', {}, { timeout: 150000 });
    H.toast(r.added ? `${r.added} ${r.added === 1 ? 'novidade encontrada' : 'novidades encontradas'} (${r.orgs.join(', ')})` : `Nada novo sobre ${r.orgs.join(', ')}. A próxima rodada olha outras organizações.`);
  } catch (err) {
    H.toast(err.message);
  } finally {
    await load(true);
  }
}

export function initRadar(helpers) {
  H = helpers;
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const el = e.target.closest('[data-radar]');
    if (el) return onAction(el.dataset.radar, el);
    const cat = e.target.closest('[data-radar-cat]');
    if (cat) {
      R.filter.cat = R.filter.cat === cat.dataset.radarCat ? '' : cat.dataset.radarCat;
      R.filter.starred = false;
      H.render();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'radarOrg') {
      R.filter.org = e.target.value;
      H.render();
    }
  });
  setInterval(() => {
    if (document.body.dataset.route === 'radar' && !document.hidden) load();
  }, 5 * 60000);
}
