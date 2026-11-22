/*
 * espacos.js
 * Espaços e eventos: mapa 3D do escritório do Fluxo W7M. Cada evento tem um
 * layout (coleção "layouts", sincronizada): arraste palco, telão, mesas, PCs,
 * totens de patrocinador etc., veja em 3D ou em planta e baixe a planta, a
 * imagem 3D, o PDF para fornecedor e o arquivo do layout.
 * O Three.js só é carregado quando a tela abre.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { esc } from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
let H = null;
let T = null; // módulo three
let OC = null; // OrbitControls

// Catálogo: medidas em metros (largura x profundidade x altura)
export const CATALOG = {
  palco: { name: 'Palco', w: 4, d: 2.5, h: 0.4, color: '#3b3f4a', group: 'Estrutura', resize: true },
  telao: { name: 'Telão / LED', w: 3.5, d: 0.2, h: 2, elev: 0.8, color: '#111318', group: 'Estrutura', resize: true, screen: true },
  tv: { name: 'TV', w: 1.4, d: 0.12, h: 0.8, elev: 1.2, color: '#111318', group: 'Estrutura', screen: true },
  backdrop: { name: 'Backdrop / photo wall', w: 3, d: 0.3, h: 2.4, color: '#6d28d9', group: 'Marca', resize: true },
  totem: { name: 'Totem patrocinador', w: 0.8, d: 0.4, h: 2, color: '#f2c94c', group: 'Marca' },
  bandeira: { name: 'Wind banner', w: 0.6, d: 0.6, h: 2.8, color: '#6d28d9', group: 'Marca' },
  ativacao: { name: 'Estande de ativação', w: 3, d: 3, h: 2.5, color: '#2563eb', group: 'Marca', resize: true, open: true },
  mesa: { name: 'Mesa reta', w: 1.8, d: 0.8, h: 0.75, color: '#c8a27a', group: 'Mobília', resize: true },
  redonda: { name: 'Mesa redonda', w: 1.2, d: 1.2, h: 0.75, color: '#c8a27a', group: 'Mobília', round: true },
  bistro: { name: 'Mesa bistrô', w: 0.6, d: 0.6, h: 1.1, color: '#c8a27a', group: 'Mobília', round: true },
  cadeira: { name: 'Cadeira', w: 0.5, d: 0.5, h: 0.9, color: '#2b2f38', group: 'Mobília', seats: 1 },
  fileira: { name: 'Fileira 6 cadeiras', w: 3.2, d: 0.55, h: 0.9, color: '#2b2f38', group: 'Mobília', seats: 6, row: 6 },
  sofa: { name: 'Sofá', w: 2, d: 0.9, h: 0.8, color: '#4b5563', group: 'Mobília', seats: 3 },
  pufe: { name: 'Pufe', w: 0.6, d: 0.6, h: 0.45, color: '#7c3aed', group: 'Mobília', round: true, seats: 1 },
  setup: { name: 'Setup gamer (PC)', w: 1.2, d: 0.7, h: 0.75, color: '#1f2937', group: 'Gamer', monitors: 1, seats: 1 },
  bancada: { name: 'Bancada 5 PCs', w: 5, d: 0.8, h: 0.75, color: '#1f2937', group: 'Gamer', resize: true, monitors: 5, seats: 5 },
  console: { name: 'Estação console', w: 1.6, d: 1.2, h: 0.5, color: '#374151', group: 'Gamer' },
  bar: { name: 'Bar / balcão', w: 3, d: 0.7, h: 1.1, color: '#8b5e3c', group: 'Serviço', resize: true },
  buffet: { name: 'Buffet', w: 2.4, d: 0.8, h: 0.9, color: '#e5e7eb', group: 'Serviço', resize: true },
  credenciamento: { name: 'Credenciamento', w: 2, d: 0.7, h: 1, color: '#10b981', group: 'Serviço', resize: true },
  merch: { name: 'Loja de merch (arara)', w: 1.5, d: 0.5, h: 1.6, color: '#ef4444', group: 'Serviço' },
  som: { name: 'Caixa de som', w: 0.5, d: 0.5, h: 1.2, color: '#0f1115', group: 'Técnica' },
  camera: { name: 'Câmera / tripé', w: 0.6, d: 0.6, h: 1.6, color: '#0f1115', group: 'Técnica' },
  mesa_tecnica: { name: 'Mesa técnica', w: 1.6, d: 0.8, h: 0.75, color: '#374151', group: 'Técnica', monitors: 2 },
  parede: { name: 'Parede / divisória', w: 3, d: 0.12, h: 2.6, color: '#d1d5db', group: 'Planta', resize: true },
  coluna: { name: 'Coluna', w: 0.4, d: 0.4, h: 3, color: '#cbd5e1', group: 'Planta', resize: true },
  porta: { name: 'Porta / entrada', w: 1.2, d: 0.1, h: 0.02, color: '#22c55e', group: 'Planta', resize: true, flat: true },
  saida: { name: 'Saída de emergência', w: 1.2, d: 0.1, h: 0.02, color: '#ef4444', group: 'Planta', resize: true, flat: true },
  area: { name: 'Área marcada (piso)', w: 4, d: 3, h: 0.01, color: '#a78bfa', group: 'Planta', resize: true, flat: true },
  planta: { name: 'Planta', w: 0.5, d: 0.5, h: 1.2, color: '#16a34a', group: 'Planta', round: true },
};
const GROUPS = ['Estrutura', 'Mobília', 'Gamer', 'Marca', 'Serviço', 'Técnica', 'Planta'];
const spec = (it) => CATALOG[it.type] || CATALOG.mesa;
const dims = (it) => ({ w: it.w || spec(it).w, d: it.d || spec(it).d, h: spec(it).h });

// Modelos de evento (montados sobre a sala atual)
const TEMPLATES = {
  vazio: { name: 'Sala vazia', build: () => [] },
  watch: {
    name: 'Watch party',
    build: (W, D) => {
      const it = [{ type: 'telao', x: 0, z: -D / 2 + 0.4 }, { type: 'som', x: -2.4, z: -D / 2 + 0.6 }, { type: 'som', x: 2.4, z: -D / 2 + 0.6 }];
      for (let r = 0; r < Math.min(5, Math.floor((D - 5) / 1.1)); r++) for (const x of [-1.8, 1.8]) it.push({ type: 'fileira', x, z: -D / 2 + 3.2 + r * 1.1 });
      it.push({ type: 'sofa', x: -W / 2 + 1.6, z: -D / 2 + 3 }, { type: 'sofa', x: W / 2 - 1.6, z: -D / 2 + 3 });
      it.push({ type: 'bar', x: W / 2 - 2, z: D / 2 - 1 }, { type: 'merch', x: -W / 2 + 1.2, z: D / 2 - 1 }, { type: 'backdrop', x: -W / 2 + 3.5, z: D / 2 - 0.4, rot: 180 });
      it.push({ type: 'totem', x: -2.8, z: -D / 2 + 1.6 }, { type: 'totem', x: 2.8, z: -D / 2 + 1.6 }, { type: 'credenciamento', x: 0, z: D / 2 - 0.8 });
      return it;
    },
  },
  summit: {
    name: 'Summit / palestra',
    build: (W, D) => {
      const it = [{ type: 'palco', x: 0, z: -D / 2 + 1.6 }, { type: 'telao', x: 0, z: -D / 2 + 0.25 }, { type: 'som', x: -2.6, z: -D / 2 + 1 }, { type: 'som', x: 2.6, z: -D / 2 + 1 }];
      for (let r = 0; r < Math.min(7, Math.floor((D - 6) / 1)); r++) for (const x of [-2, 2]) it.push({ type: 'fileira', x, z: -D / 2 + 4 + r * 1 });
      it.push({ type: 'mesa_tecnica', x: 0, z: D / 2 - 2.2 }, { type: 'camera', x: 0, z: D / 2 - 3.2 }, { type: 'credenciamento', x: -W / 2 + 1.8, z: D / 2 - 0.8 });
      it.push({ type: 'buffet', x: W / 2 - 1.8, z: D / 2 - 1 }, { type: 'backdrop', x: W / 2 - 0.4, z: 0, rot: 90 }, { type: 'totem', x: -W / 2 + 1, z: -D / 2 + 2 }, { type: 'totem', x: W / 2 - 1, z: -D / 2 + 2 });
      return it;
    },
  },
  lan: {
    name: 'Campeonato presencial',
    build: (W, D) => {
      const it = [{ type: 'palco', x: 0, z: -D / 2 + 1.6, w: 6 }, { type: 'telao', x: 0, z: -D / 2 + 0.25, w: 5 }, { type: 'bancada', x: -1.6, z: -D / 2 + 1.6, rot: 180 }, { type: 'bancada', x: 1.6, z: -D / 2 + 1.6, rot: 180 }];
      it[2].x = -2.8; it[2].w = 2.6; it[3].x = 2.8; it[3].w = 2.6;
      for (let r = 0; r < Math.min(4, Math.floor((D - 7) / 1.1)); r++) for (const x of [-2, 2]) it.push({ type: 'fileira', x, z: -D / 2 + 4.6 + r * 1.1 });
      it.push({ type: 'mesa_tecnica', x: W / 2 - 1.5, z: -D / 2 + 3 }, { type: 'camera', x: -W / 2 + 1.5, z: -D / 2 + 3.5 }, { type: 'console', x: -W / 2 + 1.6, z: D / 2 - 1.4 }, { type: 'console', x: -W / 2 + 3.6, z: D / 2 - 1.4 });
      it.push({ type: 'bar', x: W / 2 - 2, z: D / 2 - 1 }, { type: 'merch', x: 0, z: D / 2 - 0.8 }, { type: 'totem', x: -3.6, z: -D / 2 + 3 }, { type: 'totem', x: 3.6, z: -D / 2 + 3 });
      return it;
    },
  },
  coquetel: {
    name: 'Coquetel / networking',
    build: (W, D) => {
      const it = [{ type: 'bar', x: 0, z: -D / 2 + 0.8, w: 4 }, { type: 'buffet', x: W / 2 - 1, z: 0, rot: 90 }, { type: 'backdrop', x: -W / 2 + 0.4, z: 0, rot: 90 }, { type: 'tv', x: 0, z: -D / 2 + 0.1 }];
      for (let i = 0; i < Math.min(10, Math.floor(W / 2.5) * 2); i++) it.push({ type: 'bistro', x: -W / 2 + 3 + (i % Math.floor(W / 2.5)) * 2.3, z: i < Math.floor(W / 2.5) ? -1 : 1.8 });
      it.push({ type: 'sofa', x: -W / 2 + 2.5, z: D / 2 - 1 }, { type: 'pufe', x: -W / 2 + 4, z: D / 2 - 1.2 }, { type: 'credenciamento', x: W / 2 - 2, z: D / 2 - 0.8 }, { type: 'som', x: W / 2 - 0.6, z: -D / 2 + 0.6 });
      return it;
    },
  },
  ativacao: {
    name: 'Ativação de patrocinador',
    build: (W, D) => [
      { type: 'ativacao', x: 0, z: -1 }, { type: 'setup', x: -0.8, z: -1.6 }, { type: 'setup', x: 0.8, z: -1.6 }, { type: 'tv', x: 0, z: -2.4 },
      { type: 'backdrop', x: -W / 2 + 0.4, z: 0, rot: 90 }, { type: 'totem', x: -2.5, z: 1.4 }, { type: 'totem', x: 2.5, z: 1.4 }, { type: 'bandeira', x: -3.5, z: D / 2 - 1.5 },
      { type: 'bandeira', x: 3.5, z: D / 2 - 1.5 }, { type: 'credenciamento', x: 0, z: D / 2 - 0.8 }, { type: 'merch', x: W / 2 - 1.2, z: 1 }, { type: 'pufe', x: -1, z: 1.2 }, { type: 'pufe', x: 1, z: 1.2 },
    ],
  },
};

const S = {
  id: null, // layout aberto
  sel: null, // item selecionado
  view: '3d',
  labels: true,
  addType: 'mesa',
  dirty: false,
  ready: false,
  three: null, // { renderer, scene, camera, ortho, controls, meshes:Map }
  undo: [], redo: [], last: '', lastPush: 0, eye: false, measure: false, mpts: [], tour: false,
};

const layouts = () => (Sync.layouts || []).filter((l) => !l.deletedAt).sort((a, b) => (b.base - a.base) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
const cur = () => S.id && (Sync.layouts || []).find((l) => l.id === S.id && !l.deletedAt);
const available = () => Sync.v4() && (Sync.serverColls || []).includes('layouts');
let saveTimer = null;
// Desfazer / refazer (por aparelho, até 50 passos)
function track(l) {
  const now = JSON.stringify({ room: l.room, items: l.items });
  if (S.last && S.last !== now) {
    if (!S.undo.length || Date.now() - S.lastPush > 800) S.undo.push(S.last);
    S.lastPush = Date.now();
    if (S.undo.length > 50) S.undo.shift();
    S.redo = [];
  }
  S.last = now;
}
function restore(l, from, to) {
  if (!from.length) return;
  to.push(JSON.stringify({ room: l.room, items: l.items }));
  const st = JSON.parse(from.pop());
  l.room = st.room;
  l.items = st.items;
  if (S.sel && !l.items.some((i) => i.id === S.sel)) S.sel = null;
  S.last = JSON.stringify({ room: l.room, items: l.items });
  commit(l, true, false);
  H.render();
}
export function openLayout(id) {
  S.id = id;
  S.sel = null;
  mountedFor = null;
  if (location.hash !== '#/espacos') location.hash = '#/espacos';
  else H.render();
}
function commit(l, now = false, doTrack = true) {
  if (doTrack) track(l);
  l.updatedAt = new Date().toISOString();
  S.dirty = true;
  clearTimeout(saveTimer);
  const go = () => { S.dirty = false; Sync.upsert('layouts', C.normalizeLayout(l)); };
  if (now) go();
  else saveTimer = setTimeout(go, 500);
}
const local = new Map(); // id -> cópia editável
function editable() {
  const l = cur();
  if (!l) return null;
  const c = local.get(l.id);
  if (!c || String(l.updatedAt) > String(c.updatedAt)) local.set(l.id, JSON.parse(JSON.stringify(l)));
  return local.get(l.id);
}

// -----------------------------------------------------------------------------
// Checagem do layout: fora da sala, itens sobrepostos e saídas obstruídas
// -----------------------------------------------------------------------------
function extents(it) {
  const { w, d } = dims(it);
  const r = ((it.rot || 0) * Math.PI) / 180;
  return { ex: (Math.abs(w * Math.cos(r)) + Math.abs(d * Math.sin(r))) / 2, ez: (Math.abs(w * Math.sin(r)) + Math.abs(d * Math.cos(r))) / 2 };
}
const SEATING = ['cadeira', 'fileira', 'pufe', 'sofa'];
const TABLES = ['mesa', 'redonda', 'bistro', 'bancada', 'setup', 'mesa_tecnica', 'console', 'bar', 'buffet', 'credenciamento'];
export function checkLayout(l) {
  const out = [];
  const name = (i) => i.label || spec(i).name;
  const solid = l.items.filter((i) => !spec(i).flat && !spec(i).screen);
  for (const i of l.items) {
    const { ex, ez } = extents(i);
    if (Math.abs(i.x) + ex > l.room.w / 2 + 0.05 || Math.abs(i.z) + ez > l.room.d / 2 + 0.05) out.push({ level: 'bad', id: i.id, text: `${name(i)} está saindo da sala.` });
  }
  for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++) {
    const A = solid[a], B = solid[b];
    if ((SEATING.includes(A.type) && TABLES.includes(B.type)) || (SEATING.includes(B.type) && TABLES.includes(A.type))) continue;
    if (A.type === 'ativacao' || B.type === 'ativacao' || (A.type === 'palco') !== (B.type === 'palco') && ['som', 'camera', 'mesa', 'totem'].includes(A.type === 'palco' ? B.type : A.type)) continue;
    const ea = extents(A), eb = extents(B);
    const ox = ea.ex + eb.ex - Math.abs(A.x - B.x), oz = ea.ez + eb.ez - Math.abs(A.z - B.z);
    if (ox > 0.08 && oz > 0.08) out.push({ level: 'warn', id: B.id, text: `${name(A)} e ${name(B)} estão sobrepostos.` });
  }
  const exits = l.items.filter((i) => i.type === 'porta' || i.type === 'saida');
  for (const x of exits) {
    const { ex, ez } = extents(x);
    const block = solid.filter((i) => { const e = extents(i); return Math.abs(i.x - x.x) < ex + e.ex + 1 && Math.abs(i.z - x.z) < ez + e.ez + 1; });
    if (block.length) out.push({ level: 'bad', id: block[0].id, text: `${name(x)} com obstáculo a menos de 1 m: ${block.slice(0, 3).map(name).join(', ')}.` });
  }
  const area = l.room.w * l.room.d;
  if (!l.base && area > 100 && !l.items.some((i) => i.type === 'saida')) out.push({ level: 'warn', id: null, text: 'Nenhuma saída de emergência marcada. Em eventos com público, marque e deixe livre.' });
  return out.slice(0, 12);
}

// -----------------------------------------------------------------------------
// Tela
// -----------------------------------------------------------------------------
export function renderSpaces() {
  if (!available()) return '<p class="notice">O servidor está sendo atualizado para guardar os layouts. Em alguns minutos esta tela libera.</p>';
  const list = layouts();
  if (!S.id || !cur()) S.id = (list[0] && list[0].id) || null;
  const l = editable();
  if (!l) {
    return `<section class="card sp-empty"><h2>Monte o primeiro layout</h2>
      <p>Comece pela base do escritório: coloque as medidas da sala, paredes, colunas e portas. Depois cada evento nasce de uma cópia dessa base.</p>
      <div class="sp-form-row"><label>Largura (m)<input class="input" id="spNewW" type="number" min="4" max="80" step="0.5" value="20"></label><label>Profundidade (m)<input class="input" id="spNewD" type="number" min="4" max="80" step="0.5" value="12"></label></div>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-sp="newbase">Criar base do escritório</button></div></section>`;
  }
  const sel = S.sel && l.items.find((i) => i.id === S.sel);
  const counts = {};
  let seats = 0;
  l.items.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1; seats += spec(i).seats || 0; });
  const area = l.room.w * l.room.d;
  const used = l.items.filter((i) => !spec(i).flat).reduce((a, i) => a + dims(i).w * dims(i).d, 0);
  const standing = Math.max(0, Math.floor((area - used) * 1.5 * 0.7)); // 1,5 pessoa/m² em 70% da área livre (circulação)
  return `
  <div class="sp-top">
    <select class="select" id="spPick" aria-label="Layout">${list.map((x) => `<option value="${esc(x.id)}"${x.id === l.id ? ' selected' : ''}>${x.base ? '🏢 ' : ''}${esc(x.name)}${x.eventDate ? ' · ' + x.eventDate.slice(8, 10) + '/' + x.eventDate.slice(5, 7) : ''}</option>`).join('')}</select>
    <button type="button" class="btn" data-sp="new">+ Novo evento</button>
  </div>
  <div class="sp-stage">
    <div class="sp-canvas" id="spCanvas"></div>
    <div class="sp-tools">
      <button type="button" class="btn btn-sm" data-sp="view" aria-pressed="${S.view === 'plan'}">${S.view === 'plan' ? '3D' : 'Planta'}</button>
      <button type="button" class="btn btn-sm" data-sp="labels" aria-pressed="${S.labels}">Nomes</button>
      <button type="button" class="btn btn-sm" data-sp="undo" ${S.undo.length ? '' : 'disabled'} aria-label="Desfazer" title="Desfazer">↶</button>
      <button type="button" class="btn btn-sm" data-sp="redo" ${S.redo.length ? '' : 'disabled'} aria-label="Refazer" title="Refazer">↷</button>
      <button type="button" class="btn btn-sm" data-sp="tour" aria-pressed="${S.tour}" title="Modo apresentação: a câmera gira sozinha em volta do espaço">🎬</button>
      <button type="button" class="btn btn-sm" data-sp="measure" aria-pressed="${S.measure}" title="Medir distância: toque em dois pontos do piso">📏</button>
      <button type="button" class="btn btn-sm" data-sp="eye" aria-pressed="${S.eye}" title="Vista de quem chega pela porta (1,7 m)">👁</button>
      <button type="button" class="btn btn-sm" data-sp="fit" title="Centralizar">⌖</button>
    </div>
    <div class="sp-hint" id="spHint">${S.measure ? (S.mpts.length === 2 ? `Distância: <b>${Math.hypot(S.mpts[0].x - S.mpts[1].x, S.mpts[0].z - S.mpts[1].z).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m</b>. Toque em outro ponto para medir de novo.` : S.mpts.length ? 'Agora toque no segundo ponto.' : 'Régua: toque no primeiro ponto do piso.') : sel ? 'Arraste o item para mover. Use os botões abaixo para girar, copiar ou apagar.' : 'Gire com um dedo, aproxime com dois. Toque num item para selecionar.'}</div>
  </div>
  ${sel ? `<section class="card sp-sel">
    <div class="sp-sel-head"><strong>${esc(spec(sel).name)}</strong><button type="button" class="icon-btn" data-sp="unsel" aria-label="Fechar">×</button></div>
    <div class="sp-form-row">
      <label>Nome no mapa<input class="input" data-sp-field="label" maxlength="40" value="${esc(sel.label || '')}" placeholder="${esc(spec(sel).name)}"></label>
      <label class="sp-color">Cor<input type="color" data-sp-field="color" value="${sel.color || spec(sel).color}"></label>
      ${spec(sel).resize ? `<label>Largura (m)<input class="input" type="number" step="0.1" min="0.1" max="40" data-sp-field="w" value="${dims(sel).w}"></label><label>Profund. (m)<input class="input" type="number" step="0.05" min="0.05" max="40" data-sp-field="d" value="${dims(sel).d}"></label>` : ''}
    </div>
    <div class="btn-row sp-sel-btns">
      <button type="button" class="btn btn-sm" data-sp="rot" data-deg="-45">⟲ 45°</button>
      <button type="button" class="btn btn-sm" data-sp="rot" data-deg="90">⟳ 90°</button>
      <button type="button" class="btn btn-sm" data-sp="dup">Duplicar</button>
      <button type="button" class="btn btn-sm" data-sp="dup5">+5 em linha</button>
      <button type="button" class="btn btn-sm btn-danger" data-sp="del">Apagar</button>
    </div></section>` : ''}
  <section class="card sp-add">
    <div class="dt-sec-head"><h3>Adicionar ao mapa</h3><span class="hint">Toque para colocar no centro</span></div>
    ${GROUPS.map((g) => `<div class="sp-group"><span>${g}</span><div class="sp-chips">${Object.entries(CATALOG).filter(([, v]) => v.group === g).map(([k, v]) => `<button type="button" class="chip" data-sp-add="${k}"><i style="background:${v.color}"></i>${esc(v.name)}</button>`).join('')}</div></div>`).join('')}
  </section>
  <section class="card sp-info">
    <div class="dt-sec-head"><h3>Evento</h3><span class="hint">${l.items.length} itens · ${area.toFixed(0)} m²</span></div>
    <div class="sp-cap"><div><strong>${seats}</strong><span>lugares sentados</span></div><div><strong>~${standing}</strong><span>pessoas em pé (estimativa)</span></div><div><strong>${Math.round(((area - used) / area) * 100)}%</strong><span>do piso livre</span></div></div>
    <div class="sp-form-row">
      <label class="grow">Nome<input class="input" data-sp-layout="name" maxlength="80" value="${esc(l.name)}"></label>
      <label>Data<input class="input" type="date" data-sp-layout="eventDate" value="${l.eventDate || ''}"></label>
    </div>
    <div class="sp-form-row">
      <label>Largura da sala (m)<input class="input" type="number" min="4" max="80" step="0.5" data-sp-layout="room.w" value="${l.room.w}"></label>
      <label>Profundidade (m)<input class="input" type="number" min="4" max="80" step="0.5" data-sp-layout="room.d" value="${l.room.d}"></label>
      <label>Pé-direito (m)<input class="input" type="number" min="2.2" max="10" step="0.1" data-sp-layout="room.h" value="${l.room.h}"></label>
    </div>
    <label>Observações para montagem<textarea class="input" rows="2" data-sp-layout="notes" maxlength="3000" placeholder="Horário de montagem, energia, internet, fornecedores…">${esc(l.notes)}</textarea></label>
    <label class="sp-check"><input type="checkbox" data-sp-layout="base" ${l.base ? 'checked' : ''}> Esta é a base do escritório (os novos eventos copiam paredes, colunas e portas dela)</label>
    ${Object.keys(counts).length ? `<div class="sp-counts">${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span>${n}× ${esc((CATALOG[k] || {}).name || k)}</span>`).join('')}</div>` : ''}
  </section>
  ${(() => {
    const issues = checkLayout(l);
    return `<section class="card sp-check-card"><div class="dt-sec-head"><h3>Checagem de segurança</h3><span class="hint">${issues.length ? issues.length + ' ponto' + (issues.length > 1 ? 's' : '') + ' para revisar' : 'tudo certo'}</span></div>
      ${issues.length ? `<ul class="sp-issues">${issues.map((x) => `<li class="lv-${x.level}">${x.id ? `<button type="button" class="link-plain" data-sp-issue="${esc(x.id)}">${esc(x.text)}</button>` : esc(x.text)}</li>`).join('')}</ul>` : '<p class="hint">Nada fora da sala, sem sobreposição e saídas livres.</p>'}</section>`;
  })()}
  ${(() => {
    if (l.base) return '';
    const rows = Object.entries(counts).filter(([k]) => !['parede', 'coluna', 'porta', 'saida', 'area', 'planta'].includes(k));
    if (!rows.length) return '';
    const pr = l.prices || {};
    const total = rows.reduce((a, [k, n]) => a + (Number(pr[k]) || 0) * n, 0);
    const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    return `<details class="card sp-budget"${total ? ' open' : ''}><summary><strong>Orçamento estimado</strong><span class="hint">${total ? brl(total) : 'coloque o valor de aluguel ou compra por item'}</span></summary>
      <div class="sp-budget-rows">${rows.sort((a, b) => b[1] - a[1]).map(([k, n]) => `<label class="sp-budget-row"><span>${n}× ${esc((CATALOG[k] || {}).name || k)}</span><input class="input" type="number" min="0" step="1" inputmode="decimal" data-sp-price="${k}" value="${pr[k] ?? ''}" placeholder="R$ unid."><b>${pr[k] ? brl(pr[k] * n) : '–'}</b></label>`).join('')}</div>
      <p class="hint">Os valores ficam salvos no layout e vão para o PDF do fornecedor. Duplicar o layout leva os preços junto.</p></details>`;
  })()}
  <section class="card sp-dl">
    <div class="dt-sec-head"><h3>Baixar e compartilhar</h3></div>
    <div class="btn-row">
      <button type="button" class="btn" data-sp="png3d">Imagem 3D</button>
      <button type="button" class="btn" data-sp="pngplan">Planta com medidas</button>
      <button type="button" class="btn btn-primary" data-sp="pdf">PDF para fornecedor</button>
      <button type="button" class="btn" data-sp="json">Arquivo do layout</button>
      <label class="btn">Importar<input type="file" accept=".json,application/json" data-sp="import" hidden></label>
    </div>
    <div class="btn-row">
      <button type="button" class="btn" data-sp="task">Criar tarefa de montagem</button>
      <button type="button" class="btn" data-sp="copy">Duplicar layout</button>
      <button type="button" class="btn btn-danger" data-sp="remove">Excluir layout</button>
    </div>
  </section>`;
}

// Mantém o canvas 3D vivo entre renderizações
let mountedFor = null;
export function afterRenderSpaces() {
  const host = $('#spCanvas');
  const l = editable();
  if (!host || !l) return;
  ensureThree().then(() => {
    if (!S.three) initScene();
    if (S.three.renderer.domElement.parentNode !== host) host.appendChild(S.three.renderer.domElement);
    resize();
    if (mountedFor !== l.id) { mountedFor = l.id; S.undo = []; S.redo = []; S.last = JSON.stringify({ room: l.room, items: l.items }); buildScene(l); fit(); }
    else buildScene(l);
  }).catch((err) => { host.innerHTML = `<p class="notice">Não consegui carregar o 3D neste aparelho (${esc(err.message)}).</p>`; });
}

async function ensureThree() {
  if (T) return;
  T = await import('./vendor/three.module.min.js');
  OC = (await import('./vendor/OrbitControls.js')).OrbitControls;
}

// -----------------------------------------------------------------------------
// Cena 3D
// -----------------------------------------------------------------------------
function initScene() {
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color('#eef0f4');
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 400);
  const ortho = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  scene.add(new T.HemisphereLight('#ffffff', '#b8bcc8', 1.4));
  const sun = new T.DirectionalLight('#ffffff', 1.6);
  sun.position.set(12, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 80 });
  scene.add(sun);
  const controls = new OC(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 0.5;
  controls.maxDistance = 120;
  const room = new T.Group();
  const items = new T.Group();
  scene.add(room, items);
  S.three = { renderer, scene, camera, ortho, controls, room, items, meshes: new Map() };
  const ro = new ResizeObserver(() => resize());
  ro.observe(renderer.domElement.parentNode || document.body);
  S.three.ro = ro;
  bindPointer();
  const loop = () => {
    if (!document.body.contains(renderer.domElement)) { S.three.raf = requestAnimationFrame(loop); return; }
    controls.update();
    renderer.render(scene, S.view === 'plan' ? ortho : camera);
    S.three.raf = requestAnimationFrame(loop);
  };
  loop();
}

function resize() {
  if (!S.three) return;
  const host = S.three.renderer.domElement.parentNode;
  if (!host) return;
  const w = host.clientWidth || 360;
  const h = host.clientHeight || 420;
  S.three.renderer.setSize(w, h, false);
  S.three.renderer.domElement.style.width = '100%';
  S.three.renderer.domElement.style.height = '100%';
  S.three.camera.aspect = w / h;
  S.three.camera.updateProjectionMatrix();
  fitOrtho();
}

function fitOrtho() {
  const l = editable();
  if (!l || !S.three) return;
  const { ortho, renderer } = S.three;
  const el = renderer.domElement;
  const asp = (el.clientWidth || 1) / (el.clientHeight || 1);
  const half = Math.max(l.room.d / 2 + 1, (l.room.w / 2 + 1) / asp);
  Object.assign(ortho, { left: -half * asp, right: half * asp, top: half, bottom: -half });
  ortho.position.set(0, 50, 0.001);
  ortho.up.set(0, 0, -1);
  ortho.lookAt(0, 0, 0);
  ortho.updateProjectionMatrix();
}

function fit() {
  const l = editable();
  if (!l || !S.three) return;
  const m = Math.max(l.room.w, l.room.d);
  S.three.camera.position.set(m * 0.55, m * 0.75, m * 0.9);
  S.three.controls.target.set(0, 0, 0);
  S.three.controls.update();
  fitOrtho();
}

const mat = (color, opts = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, opts));
function box(w, h, d, color, y = h / 2, opts) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color, opts));
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function labelSprite(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const fs = 44;
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  c.width = w; c.height = fs + 26;
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(17,19,24,.82)';
  const r = 18;
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, r); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 18, c.height / 2 + 2);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const k = 0.0075;
  sp.scale.set(c.width * k, c.height * k, 1);
  sp.renderOrder = 10;
  return sp;
}

function itemObject(it) {
  const s = spec(it);
  const { w, d, h } = dims(it);
  const color = it.color || s.color;
  const g = new T.Group();
  if (s.flat) {
    const m = new T.Mesh(new T.PlaneGeometry(w, d), mat(color, { transparent: true, opacity: it.type === 'area' ? 0.35 : 0.9 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.receiveShadow = true;
    g.add(m);
  } else if (s.round) {
    if (it.type === 'planta') {
      g.add(box(0.35, 0.4, 0.35, '#9a6b47', 0.2));
      const leaf = new T.Mesh(new T.SphereGeometry(0.35, 16, 12), mat(color)); leaf.position.y = 0.8; leaf.castShadow = true; g.add(leaf);
    } else {
      const top = new T.Mesh(new T.CylinderGeometry(w / 2, w / 2, 0.05, 28), mat(color)); top.position.y = h - 0.025; top.castShadow = true; g.add(top);
      if (it.type === 'pufe') { top.geometry = new T.CylinderGeometry(w / 2, w / 2, h, 24); top.position.y = h / 2; }
      else { const leg = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, h, 10), mat('#4b5563')); leg.position.y = h / 2; g.add(leg); }
    }
  } else if (it.type === 'cadeira') {
    g.add(box(w, 0.08, d, color, 0.46));
    const back = box(w, 0.45, 0.06, color, 0.7); back.position.z = -d / 2 + 0.03; g.add(back);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = box(0.04, 0.44, 0.04, '#6b7280', 0.22); leg.position.set(sx * (w / 2 - 0.04), 0.22, sz * (d / 2 - 0.04)); g.add(leg); }
  } else if (s.row) {
    const n = s.row; const cw = w / n;
    for (let i = 0; i < n; i++) {
      const seat = box(cw * 0.85, 0.08, d * 0.9, color, 0.46); seat.position.x = -w / 2 + cw * (i + 0.5); g.add(seat);
      const back = box(cw * 0.85, 0.45, 0.05, color, 0.7); back.position.set(-w / 2 + cw * (i + 0.5), 0.7, -d / 2 + 0.03); g.add(back);
    }
  } else if (it.type === 'sofa') {
    g.add(box(w, 0.42, d, color, 0.21)); const b = box(w, 0.4, 0.2, color, 0.6); b.position.z = -d / 2 + 0.1; g.add(b);
    for (const sx of [-1, 1]) { const a = box(0.18, 0.25, d, color, 0.54); a.position.x = sx * (w / 2 - 0.09); g.add(a); }
  } else if (s.screen) {
    const elev = s.elev || 0.8;
    g.add(box(w, h, d, color, elev + h / 2));
    const glow = new T.Mesh(new T.PlaneGeometry(w * 0.94, h * 0.9), new T.MeshBasicMaterial({ color: '#5b21b6' }));
    glow.position.set(0, elev + h / 2, d / 2 + 0.005); g.add(glow);
    if (it.type === 'telao') for (const sx of [-1, 1]) { const p = box(0.1, elev, 0.1, '#6b7280', elev / 2); p.position.x = sx * (w / 2 - 0.2); g.add(p); }
  } else if (s.open) {
    g.add(box(w, 0.08, d, '#e5e7eb', 0.04));
    const back = box(w, h, 0.08, color, h / 2); back.position.z = -d / 2; g.add(back);
    for (const sx of [-1, 1]) { const side = box(0.08, h, d, color, h / 2, { transparent: true, opacity: 0.85 }); side.position.x = sx * w / 2; g.add(side); }
  } else if (['mesa', 'setup', 'bancada', 'mesa_tecnica'].includes(it.type)) {
    g.add(box(w, 0.05, d, color, h - 0.025));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = box(0.05, h, 0.05, '#4b5563', h / 2); leg.position.set(sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06)); g.add(leg); }
    const mon = s.monitors || 0;
    for (let i = 0; i < mon; i++) {
      const mx = -w / 2 + (w / mon) * (i + 0.5);
      const scr = box(0.55, 0.33, 0.03, '#0b0c10', h + 0.3); scr.position.set(mx, h + 0.3, -d / 2 + 0.15); g.add(scr);
      const lit = new T.Mesh(new T.PlaneGeometry(0.5, 0.28), new T.MeshBasicMaterial({ color: '#7c3aed' })); lit.position.set(mx, h + 0.3, -d / 2 + 0.17); g.add(lit);
      if (it.type !== 'mesa_tecnica') { const ch = box(0.45, 0.08, 0.45, '#111318', 0.46); ch.position.set(mx, 0.46, d / 2 + 0.35); g.add(ch); const cb = box(0.45, 0.55, 0.06, '#7c3aed', 0.75); cb.position.set(mx, 0.75, d / 2 + 0.58); g.add(cb); }
    }
  } else if (it.type === 'totem' || it.type === 'bandeira') {
    if (it.type === 'bandeira') { g.add(box(0.04, h, 0.04, '#6b7280', h / 2)); const f = box(0.5, h * 0.7, 0.02, color, h * 0.6); f.position.x = 0.27; g.add(f); g.add(box(0.5, 0.06, 0.5, '#374151', 0.03)); }
    else { g.add(box(w, h, d, '#ffffff', h / 2)); const face = box(w * 0.9, h * 0.75, 0.01, color, h * 0.55); face.position.z = d / 2 + 0.006; g.add(face); }
  } else if (it.type === 'merch') {
    g.add(box(w, 0.04, 0.04, '#9ca3af', h)); for (const sx of [-1, 1]) { const p = box(0.04, h, 0.04, '#9ca3af', h / 2); p.position.x = sx * w / 2; g.add(p); }
    for (let i = 0; i < 6; i++) { const shirt = box(0.08, 0.7, 0.45, i % 2 ? color : '#111318', h - 0.4); shirt.position.x = -w / 2 + 0.2 + i * (w - 0.4) / 5; g.add(shirt); }
  } else if (it.type === 'camera') {
    for (let i = 0; i < 3; i++) { const legm = box(0.03, 1.4, 0.03, '#374151', 0.7); legm.rotation.z = 0.2; legm.rotation.y = (i * Math.PI * 2) / 3; g.add(legm); }
    g.add(box(0.3, 0.2, 0.18, color, 1.5));
  } else {
    g.add(box(w, h, d, color, h / 2));
  }
  g.position.set(it.x, 0, it.z);
  g.rotation.y = -((it.rot || 0) * Math.PI) / 180;
  g.userData.id = it.id;
  // caixa invisível para tocar e selecionar
  const hit = new T.Mesh(new T.BoxGeometry(Math.max(w, 0.4), Math.max(h, 0.3) + (s.elev || 0), Math.max(d, 0.4)), new T.MeshBasicMaterial({ visible: false }));
  hit.position.y = (Math.max(h, 0.3) + (s.elev || 0)) / 2;
  hit.userData.hit = it.id;
  g.add(hit);
  if (S.labels && !['cadeira', 'coluna', 'planta'].includes(it.type)) {
    const lb = labelSprite(it.label || s.name);
    lb.position.y = (s.elev || 0) + h + 0.45;
    g.add(lb);
  }
  if (S.sel === it.id) {
    const ring = new T.Mesh(new T.PlaneGeometry(w + 0.3, d + 0.3), new T.MeshBasicMaterial({ color: '#7c3aed', transparent: true, opacity: 0.35 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    g.add(ring);
  }
  return g;
}

function drawMeasure() {
  if (!S.three) return;
  if (!S.three.measure) { S.three.measure = new T.Group(); S.three.scene.add(S.three.measure); }
  const g = S.three.measure;
  disposeGroup(g);
  if (!S.measure) return;
  for (const p of S.mpts) { const dot = new T.Mesh(new T.SphereGeometry(0.09, 12, 8), new T.MeshBasicMaterial({ color: '#ef4444' })); dot.position.set(p.x, 0.06, p.z); g.add(dot); }
  if (S.mpts.length === 2) {
    const [a, b] = S.mpts;
    const geo = new T.BufferGeometry().setFromPoints([new T.Vector3(a.x, 0.06, a.z), new T.Vector3(b.x, 0.06, b.z)]);
    g.add(new T.Line(geo, new T.LineBasicMaterial({ color: '#ef4444' })));
    const lb = labelSprite(Math.hypot(a.x - b.x, a.z - b.z).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m');
    lb.position.set((a.x + b.x) / 2, 0.5, (a.z + b.z) / 2);
    g.add(lb);
  }
}
function disposeGroup(grp) {
  grp.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  grp.clear();
}

function buildScene(l) {
  const { room, items, meshes } = S.three;
  disposeGroup(room);
  disposeGroup(items);
  meshes.clear();
  const { w, d, h } = l.room;
  const floor = new T.Mesh(new T.PlaneGeometry(w, d), mat('#f7f7f9', { roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.floor = true;
  room.add(floor);
  const grid = new T.GridHelper(Math.max(w, d), Math.max(w, d), '#c9ccd6', '#e1e3ea');
  grid.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  grid.position.y = 0.003;
  room.add(grid);
  const wallMat = mat('#ffffff', { transparent: true, opacity: 0.55 });
  const t = 0.15;
  for (const [ww, dd, x, z] of [[w + t * 2, t, 0, -d / 2 - t / 2], [t, d, -w / 2 - t / 2, 0], [t, d, w / 2 + t / 2, 0]]) {
    const m = new T.Mesh(new T.BoxGeometry(ww, h, dd), wallMat);
    m.position.set(x, h / 2, z); m.receiveShadow = true;
    room.add(m);
  }
  const front = new T.Mesh(new T.BoxGeometry(w + t * 2, 0.12, t), mat('#9ca3af'));
  front.position.set(0, 0.06, d / 2 + t / 2);
  room.add(front);
  for (const it of l.items) {
    const o = itemObject(it);
    items.add(o);
    meshes.set(it.id, o);
  }
}

// -----------------------------------------------------------------------------
// Tocar, selecionar e arrastar
// -----------------------------------------------------------------------------
function bindPointer() {
  const el = S.three.renderer.domElement;
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const hitPt = new T.Vector3();
  let drag = null;
  let down = null;
  const cam = () => (S.view === 'plan' ? S.three.ortho : S.three.camera);
  const setNdc = (e) => {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam());
  };
  const pick = () => {
    const hits = ray.intersectObjects(S.three.items.children, true).filter((h) => h.object.userData.hit);
    return hits.length ? hits[0].object.userData.hit : null;
  };
  el.addEventListener('pointerdown', (e) => {
    if (S.tour) { S.tour = false; S.three.controls.autoRotate = false; }
    setNdc(e);
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
    const id = pick();
    if (id && id === S.sel && e.isPrimary) {
      const l = editable();
      const it = l.items.find((i) => i.id === id);
      if (ray.ray.intersectPlane(plane, hitPt)) {
        drag = { it, dx: it.x - hitPt.x, dz: it.z - hitPt.z, moved: false };
        S.three.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
      }
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    setNdc(e);
    if (!ray.ray.intersectPlane(plane, hitPt)) return;
    const l = editable();
    const snap = (v) => Math.round(v * 4) / 4;
    drag.it.x = Math.max(-l.room.w / 2, Math.min(l.room.w / 2, snap(hitPt.x + drag.dx)));
    drag.it.z = Math.max(-l.room.d / 2, Math.min(l.room.d / 2, snap(hitPt.z + drag.dz)));
    drag.moved = true;
    const o = S.three.meshes.get(drag.it.id);
    if (o) o.position.set(drag.it.x, 0, drag.it.z);
  });
  const up = (e) => {
    if (S.measure && down && !drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) {
      down = null;
      setNdc(e);
      if (ray.ray.intersectPlane(plane, hitPt)) {
        const p = { x: Math.round(hitPt.x * 20) / 20, z: Math.round(hitPt.z * 20) / 20 };
        S.mpts = S.mpts.length >= 2 ? [p] : S.mpts.concat(p);
        drawMeasure();
        H.render();
      }
      return;
    }
    if (drag) {
      S.three.controls.enabled = true;
      if (drag.moved) commit(editable());
      drag = null;
      return;
    }
    if (!down) return;
    const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && Date.now() - down.t < 500;
    down = null;
    if (!tap) return;
    setNdc(e);
    const id = pick();
    if (id !== S.sel) { S.sel = id; H.render(); }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', () => { if (drag) { S.three.controls.enabled = true; drag = null; } down = null; });
}

// -----------------------------------------------------------------------------
// Downloads
// -----------------------------------------------------------------------------
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layout';
const fileName = (l, ext) => `${slug(l.name)}${l.eventDate ? '-' + l.eventDate : ''}.${ext}`;
function download(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function shot3d() {
  const { renderer, scene, camera } = S.three;
  const prev = S.view;
  S.view = '3d';
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  S.view = prev;
  return url;
}

/** Planta 2D desenhada à mão: escala, cotas, nomes e legenda. */
function planCanvas(l, px = 60) {
  const pad = 70;
  const W = Math.round(l.room.w * px + pad * 2);
  const Hh = Math.round(l.room.d * px + pad * 2 + 60);
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, Hh);
  const ox = pad, oy = pad + 40;
  const X = (x) => ox + (x + l.room.w / 2) * px;
  const Y = (z) => oy + (z + l.room.d / 2) * px;
  g.fillStyle = '#111318'; g.font = '600 22px Inter, system-ui, sans-serif';
  g.fillText(`${l.name}${l.eventDate ? ' · ' + l.eventDate.split('-').reverse().join('/') : ''}`, ox, 38);
  g.font = '14px Inter, system-ui, sans-serif'; g.fillStyle = '#6b7280';
  g.fillText(`Sala ${l.room.w} × ${l.room.d} m · grade de 1 m · Fluxo W7M`, ox, 60);
  // grade
  g.strokeStyle = '#eceef3'; g.lineWidth = 1;
  for (let i = 0; i <= l.room.w; i++) { g.beginPath(); g.moveTo(ox + i * px, oy); g.lineTo(ox + i * px, oy + l.room.d * px); g.stroke(); }
  for (let j = 0; j <= l.room.d; j++) { g.beginPath(); g.moveTo(ox, oy + j * px); g.lineTo(ox + l.room.w * px, oy + j * px); g.stroke(); }
  g.strokeStyle = '#111318'; g.lineWidth = 4; g.strokeRect(ox, oy, l.room.w * px, l.room.d * px);
  // cotas
  g.fillStyle = '#374151'; g.font = '600 15px Inter, system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText(`${l.room.w} m`, ox + (l.room.w * px) / 2, oy + l.room.d * px + 28);
  g.save(); g.translate(ox - 26, oy + (l.room.d * px) / 2); g.rotate(-Math.PI / 2); g.fillText(`${l.room.d} m`, 0, 0); g.restore();
  g.font = '12px Inter, system-ui, sans-serif'; g.fillStyle = '#9ca3af';
  g.fillText('FUNDO', ox + (l.room.w * px) / 2, oy - 8);
  // itens (área e piso primeiro)
  const order = l.items.slice().sort((a, b) => (spec(b).flat ? 1 : 0) - (spec(a).flat ? 1 : 0));
  for (const it of order) {
    const s = spec(it);
    const { w, d } = dims(it);
    g.save();
    g.translate(X(it.x), Y(it.z));
    g.rotate(((it.rot || 0) * Math.PI) / 180);
    g.fillStyle = it.color || s.color;
    g.globalAlpha = it.type === 'area' ? 0.25 : 0.9;
    g.strokeStyle = '#111318'; g.lineWidth = 1.5;
    if (s.round) { g.beginPath(); g.arc(0, 0, (w / 2) * px, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; g.stroke(); }
    else { g.fillRect((-w / 2) * px, (-d / 2) * px, w * px, d * px); g.globalAlpha = 1; g.strokeRect((-w / 2) * px, (-d / 2) * px, w * px, d * px); }
    g.restore();
  }
  // nomes por cima
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 12px Inter, system-ui, sans-serif';
  for (const it of l.items) {
    if (['cadeira', 'coluna', 'planta'].includes(it.type)) continue;
    const t = it.label || spec(it).name;
    const tw = g.measureText(t).width + 10;
    g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(X(it.x) - tw / 2, Y(it.z) - 9, tw, 18);
    g.fillStyle = '#111318'; g.fillText(t, X(it.x), Y(it.z));
  }
  // escala
  g.textAlign = 'left'; g.fillStyle = '#111318'; g.fillRect(W - pad - px * 2, Hh - 34, px * 2, 6);
  g.font = '12px Inter, system-ui, sans-serif'; g.fillText('2 m', W - pad - px * 2, Hh - 44);
  return c;
}

function itemList(l) {
  const counts = {};
  l.items.forEach((i) => { const k = i.type + '|' + (spec(i).resize ? `${dims(i).w}×${dims(i).d}` : ''); counts[k] = (counts[k] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const [type, size] = k.split('|');
    const s = CATALOG[type] || { name: type, w: '', d: '' };
    return { n, type, name: s.name, size: size || `${s.w}×${s.d}`, seats: (s.seats || 0) * n };
  });
}

function pdfFor(l) {
  const plan = planCanvas(l, 50).toDataURL('image/png');
  const img3d = shot3d();
  const rows = itemList(l);
  const seats = rows.reduce((a, r) => a + r.seats, 0);
  const brl0 = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  rows.forEach((r) => (r.total = (Number((l.prices || {})[r.type]) || 0) * r.n));
  const hasPrice = rows.some((r) => r.total);
  const w = window.open('', '_blank');
  if (!w) return H.toast('Libere os pop-ups para gerar o PDF.');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(l.name)} — layout</title>
  <style>@page{size:A4 landscape;margin:12mm}body{font:13px/1.45 Inter,system-ui,sans-serif;color:#111318;margin:0}h1{font-size:22px;margin:0 0 2px}p.s{color:#6b7280;margin:0 0 12px}
  .grid{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;align-items:start}img{width:100%;border:1px solid #e5e7eb;border-radius:8px}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border-bottom:1px solid #e5e7eb;padding:5px 6px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#6b7280}td.n{text-align:right;font-weight:600;width:40px}
  .notes{white-space:pre-wrap;background:#f7f7f9;border-radius:8px;padding:10px;margin-top:10px}.pb{page-break-before:always}</style></head><body>
  <h1>${esc(l.name)}</h1><p class="s">${l.eventDate ? l.eventDate.split('-').reverse().join('/') + ' · ' : ''}Sala ${l.room.w} × ${l.room.d} m (${(l.room.w * l.room.d).toFixed(0)} m²) · ${l.items.length} itens · ${seats} lugares · Fluxo W7M</p>
  <div class="grid"><img src="${plan}" alt="Planta"><div><img src="${img3d}" alt="Vista 3D">
  <table><thead><tr><th>Qtd</th><th>Item</th><th>Medida (m)</th>${hasPrice ? '<th>Valor</th>' : ''}</tr></thead><tbody>${rows.map((r) => `<tr><td class="n">${r.n}</td><td>${esc(r.name)}</td><td>${esc(r.size)}</td>${hasPrice ? `<td>${r.total ? brl0(r.total) : ''}</td>` : ''}</tr>`).join('')}${hasPrice ? `<tr><td></td><td><strong>Total estimado</strong></td><td></td><td><strong>${brl0(rows.reduce((a, r) => a + r.total, 0))}</strong></td></tr>` : ''}</tbody></table>
  ${(() => { const iss = checkLayout(l); return iss.length ? `<div class="notes"><strong>Pontos para revisar na montagem</strong>\n${iss.map((x) => '• ' + esc(x.text)).join('\n')}</div>` : ''; })()}
  ${l.notes ? `<div class="notes"><strong>Observações de montagem</strong>\n${esc(l.notes)}</div>` : ''}</div></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
  w.document.close();
}

// -----------------------------------------------------------------------------
// Ações
// -----------------------------------------------------------------------------
function newItem(type, x = 0, z = 0, extra = {}) {
  return Object.assign({ id: C.uid(), type, label: '', x, z, rot: 0, w: null, d: null, color: null }, extra);
}
async function createLayout(data) {
  const l = C.normalizeLayout(Object.assign({ id: C.uid() }, data));
  local.set(l.id, JSON.parse(JSON.stringify(l)));
  await Sync.upsert('layouts', l);
  S.id = l.id;
  S.sel = null;
  mountedFor = null;
  H.render();
}

async function newEventDialog() {
  const base = layouts().find((x) => x.base);
  const opts = Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML = `<form method="dialog" class="dialog-body sp-new">
    <h2>Novo layout de evento</h2>
    <label>Nome<input class="input" name="nm" required maxlength="80" placeholder="Ex.: Watch party Valorant 28/11"></label>
    <label>Data<input class="input" type="date" name="dt"></label>
    <label>Modelo<select class="select" name="tpl">${opts}</select></label>
    <p class="hint">${base ? `Usa a base "${esc(base.name)}" (paredes, colunas e portas) e encaixa o modelo. Depois é só arrastar.` : 'Dica: crie uma base do escritório para todos os eventos já nascerem com paredes, colunas e portas.'}</p>
    <div class="btn-row"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn btn-primary" value="ok">Criar</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.addEventListener('close', async () => {
    const f = dlg.querySelector('form');
    const ok = dlg.returnValue === 'ok';
    const name = f.elements.nm.value.trim(), date = f.elements.dt.value, tpl = f.elements.tpl.value;
    dlg.remove();
    if (!ok || !name) return;
    const room = base ? Object.assign({}, base.room) : { w: 20, d: 12, h: 3 };
    const keep = base ? base.items.filter((i) => spec(i).group === 'Planta').map((i) => Object.assign({}, i, { id: C.uid() })) : [];
    const built = TEMPLATES[tpl].build(room.w, room.d).map((i) => newItem(i.type, i.x, i.z, { rot: i.rot || 0, w: i.w || null }));
    await createLayout({ name, eventDate: date || null, kind: tpl, room, items: keep.concat(built), notes: base ? '' : '' });
  });
}

function onField(e) {
  const l = editable();
  if (!l) return;
  const f = e.target.dataset.spField;
  const lf = e.target.dataset.spLayout;
  if (f) {
    const it = l.items.find((i) => i.id === S.sel);
    if (!it) return;
    if (f === 'label') it.label = e.target.value.slice(0, 40);
    else if (f === 'color') it.color = /^#[0-9a-f]{6}$/i.test(e.target.value) ? e.target.value : null;
    else { const v = parseFloat(String(e.target.value).replace(',', '.')); if (v > 0) it[f] = Math.min(40, v); }
    commit(l);
    if (S.three) buildScene(l);
    return;
  }
  if (lf) {
    if (lf === 'base') l.base = e.target.checked;
    else if (lf.startsWith('room.')) { const v = parseFloat(String(e.target.value).replace(',', '.')); if (!(v > 0)) return; l.room[lf.slice(5)] = v; }
    else l[lf] = e.target.value || (lf === 'eventDate' ? null : '');
    if (lf === 'base' && l.base) (Sync.layouts || []).filter((x) => x.base && x.id !== l.id).forEach((x) => Sync.upsert('layouts', C.normalizeLayout(Object.assign({}, x, { base: false, updatedAt: new Date().toISOString() }))));
    commit(l, e.type === 'change');
    if (S.three && lf.startsWith('room.')) { buildScene(C.normalizeLayout(l)); fitOrtho(); }
  }
}

export function initSpaces(helpers) {
  H = helpers;
  const root = document.querySelector('[data-view="spaces"]');
  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.route !== 'spaces' || e.target.closest('input, textarea, select, dialog')) return;
    const l = editable();
    if (!l) return;
    const it = S.sel && l.items.find((i) => i.id === S.sel);
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return e.shiftKey ? restore(l, S.redo, S.undo) : restore(l, S.undo, S.redo); }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); return restore(l, S.redo, S.undo); }
    if (!it) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); l.items = l.items.filter((i) => i.id !== it.id); S.sel = null; commit(l, true); return H.render(); }
    if (k === 'r') { it.rot = ((it.rot || 0) + (e.shiftKey ? -45 : 90)) % 360; commit(l); return buildScene(l); }
    if (k === 'escape') { S.sel = null; return H.render(); }
    const step = e.shiftKey ? 1 : 0.25;
    const mv = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
    if (mv) { e.preventDefault(); it.x += mv[0]; it.z += mv[1]; commit(l); buildScene(l); }
  });
  root.addEventListener('change', (e) => {
    const pk = e.target.dataset && e.target.dataset.spPrice;
    if (!pk) return;
    const l = editable();
    if (!l) return;
    l.prices = Object.assign({}, l.prices);
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (v >= 0) l.prices[pk] = v; else delete l.prices[pk];
    commit(l, true, false);
    H.render();
  });
  root.addEventListener('input', (e) => { if (e.target.dataset.spField || (e.target.dataset.spLayout && e.target.type !== 'checkbox')) onField(e); });
  root.addEventListener('change', async (e) => {
    if (e.target.id === 'spPick') { S.id = e.target.value; S.sel = null; mountedFor = null; return H.render(); }
    if (e.target.dataset.spLayout) { onField(e); if (['eventDate', 'base', 'name'].includes(e.target.dataset.spLayout)) H.render(); return; }
    if (e.target.dataset.spField) return H.render();
    if (e.target.dataset.sp === 'import' && e.target.files[0]) {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (!data || !Array.isArray(data.items)) throw new Error('arquivo inválido');
        await createLayout(Object.assign({}, data, { id: C.uid(), base: false, name: (data.name || 'Layout') + ' (importado)' }));
        H.toast('Layout importado');
      } catch (err) { H.toast('Não consegui importar: ' + err.message); }
      e.target.value = '';
    }
  });
  root.addEventListener('click', async (e) => {
    const iss = e.target.closest('[data-sp-issue]');
    if (iss) { S.sel = iss.dataset.spIssue; H.render(); document.querySelector('.sp-stage')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const add = e.target.closest('[data-sp-add]');
    const l = editable();
    if (add && l) {
      const type = add.dataset.spAdd;
      const t = S.three && S.three.controls.target;
      const it = newItem(type, t ? Math.round(t.x * 4) / 4 : 0, t ? Math.round(t.z * 4) / 4 : 0);
      if (['telao', 'tv', 'backdrop', 'parede', 'porta', 'saida'].includes(type)) it.z = type === 'porta' || type === 'saida' ? l.room.d / 2 : -l.room.d / 2 + 0.3;
      l.items.push(it);
      S.sel = it.id;
      commit(l);
      H.render();
      H.toast(`Adicionado: ${CATALOG[type].name}. Arraste para posicionar.`);
      return;
    }
    const b = e.target.closest('[data-sp]');
    if (!b) return;
    const a = b.dataset.sp;
    if (a === 'newbase') {
      const w = parseFloat($('#spNewW').value) || 20, d = parseFloat($('#spNewD').value) || 12;
      return createLayout({ name: 'Base do escritório', base: true, room: { w, d, h: 3 }, items: [newItem('porta', 0, d / 2)] });
    }
    if (a === 'new') return newEventDialog();
    if (!l) return;
    const it = S.sel && l.items.find((i) => i.id === S.sel);
    if (a === 'view') { S.view = S.view === 'plan' ? '3d' : 'plan'; fitOrtho(); return H.render(); }
    if (a === 'labels') { S.labels = !S.labels; return H.render(); }
    if (a === 'fit') { S.eye = false; fit(); return H.render(); }
    if (a === 'tour') {
      S.tour = !S.tour;
      S.eye = false;
      S.view = '3d';
      if (S.tour) { fit(); S.three.controls.autoRotate = true; S.three.controls.autoRotateSpeed = 1.2; S.sel = null; S.labels = true; }
      else S.three.controls.autoRotate = false;
      return H.render();
    }
    if (a === 'measure') { S.measure = !S.measure; S.mpts = []; drawMeasure(); return H.render(); }
    if (a === 'eye') {
      S.eye = !S.eye;
      S.view = '3d';
      if (S.eye) {
        const door = l.items.find((i) => i.type === 'porta') || { x: 0, z: l.room.d / 2 };
        const { camera, controls } = S.three;
        camera.position.set(door.x, 1.7, Math.min(l.room.d / 2 - 0.3, door.z - 0.3));
        controls.target.set(door.x * 0.3, 1.4, 0);
        controls.update();
      } else fit();
      return H.render();
    }
    if (a === 'undo') return restore(l, S.undo, S.redo);
    if (a === 'redo') return restore(l, S.redo, S.undo);
    if (a === 'unsel') { S.sel = null; return H.render(); }
    if (a === 'rot' && it) { it.rot = ((it.rot || 0) + Number(b.dataset.deg)) % 360; commit(l); return buildScene(l); }
    if ((a === 'dup' || a === 'dup5') && it) {
      const n = a === 'dup5' ? 5 : 1;
      const { w } = dims(it);
      const r = ((it.rot || 0) * Math.PI) / 180;
      let last = it;
      for (let i = 1; i <= n; i++) {
        const step = (w + (it.type === 'cadeira' ? 0.1 : 0.3)) * i;
        last = Object.assign({}, it, { id: C.uid(), x: Math.round((it.x + Math.cos(r) * step) * 4) / 4, z: Math.round((it.z + Math.sin(r) * step) * 4) / 4 });
        l.items.push(last);
      }
      S.sel = last.id;
      commit(l);
      return H.render();
    }
    if (a === 'del' && it) { l.items = l.items.filter((i) => i.id !== it.id); S.sel = null; commit(l, true); return H.render(); }
    if (a === 'png3d') return download(shot3d(), fileName(l, 'png').replace('.png', '-3d.png'));
    if (a === 'pngplan') return download(planCanvas(l, 70).toDataURL('image/png'), fileName(l, 'png').replace('.png', '-planta.png'));
    if (a === 'pdf') return pdfFor(l);
    if (a === 'json') {
      const blob = new Blob([JSON.stringify(Object.assign({ app: 'central-tarefas', tipo: 'layout' }, C.normalizeLayout(l)), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      download(url, fileName(l, 'json'));
      return setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    if (a === 'copy') return createLayout(Object.assign({}, JSON.parse(JSON.stringify(l)), { id: C.uid(), base: false, name: l.name + ' (cópia)', items: l.items.map((i) => Object.assign({}, i, { id: C.uid() })) }));
    if (a === 'remove') {
      if (!(await H.confirmDialog({ title: 'Excluir layout?', message: l.name, confirmLabel: 'Excluir' }))) return;
      await Sync.remove('layouts', l.id);
      local.delete(l.id);
      S.id = null; S.sel = null; mountedFor = null;
      return H.render();
    }
    if (a === 'task') {
      const rows = itemList(l).filter((r) => !['Parede / divisória', 'Coluna', 'Porta / entrada', 'Saída de emergência', 'Área marcada (piso)', 'Planta'].includes(r.name));
      const checklist = rows.map((r) => ({ id: C.uid(), text: `Garantir ${r.n}× ${r.name}${r.size ? ' (' + r.size + ' m)' : ''}`, done: false }))
        .concat(['Enviar PDF do layout para fornecedores', 'Confirmar energia, internet e som', 'Montagem e teste no dia anterior'].map((text) => ({ id: C.uid(), text, done: false })));
      const t = await Tasks.create({ title: `Montagem: ${l.name}`, dueDate: l.eventDate ? C.addDays(l.eventDate, -1) : null, description: `Layout no mapa do escritório (Espaços). Sala ${l.room.w}×${l.room.d} m, ${l.items.length} itens.${l.notes ? '\n\n' + l.notes : ''}`, checklist, priority: 'high', area: (Sync.central.areas[0] || {}).id });
      H.toast('Tarefa de montagem criada com checklist');
      return H.openDetail && H.openDetail(t.id);
    }
  });
}

/** Chamado pelo app a cada mudança de dados: só redesenha se outro aparelho mudou o layout. */
export function spacesChanged() {
  const l = cur();
  const c = l && local.get(l.id);
  return !S.dirty && l && c && String(l.updatedAt) > String(c.updatedAt);
}
