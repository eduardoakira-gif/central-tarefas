/*
 * triage.js
 * Triagem (inspirada na caixa de entrada do Linear): o que chegou sem prazo
 * nos últimos 30 dias, um card por vez, para decidir em 1 toque.
 */
import { Tasks } from './tasks.js';
import { Sync } from './sync.js';
import { esc } from './ui.js';

const C = window.Core;
let H = null;
let queue = [];
let idx = 0;

/** Tarefas abertas, sem prazo nem plano, criadas nos últimos 30 dias e ainda não triadas. */
export function triageList() {
  const since = Date.now() - 30 * 86400000;
  return Tasks.all().filter((t) => t.status !== 'done' && t.status !== 'waiting' && !t.dueDate && !t.plannedFor && !t.triagedAt && !t.project && Date.parse(t.createdAt) >= since)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function dlg() {
  let d = document.getElementById('triageDialog');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'triageDialog';
    d.className = 'dialog triage-dialog';
    d.setAttribute('aria-label', 'Triagem');
    document.body.appendChild(d);
    d.addEventListener('click', onClick);
  }
  return d;
}

function render() {
  const d = dlg();
  const t = queue[idx] && Tasks.get(queue[idx]);
  if (!t) {
    d.innerHTML = `<div class="dialog-body triage-done"><div class="triage-big">✅</div><h2>Triagem zerada</h2><p class="hint">Tudo o que chegou tem destino. Volte aqui quando aparecer o 📥 de novo.</p><div class="btn-row"><button type="button" class="btn btn-primary" data-tr="close">Fechar</button></div></div>`;
    return;
  }
  const areas = (Sync.central && Sync.central.areas) || [];
  const area = areas.find((a) => a.id === t.area) || { name: 'Sem área', color: '#8A92A3' };
  const days = Math.floor((Date.now() - Date.parse(t.createdAt)) / 86400000);
  d.innerHTML = `<div class="dialog-head"><span class="label">Triagem · ${idx + 1} de ${queue.length}</span><button type="button" class="icon-btn" data-tr="close" aria-label="Fechar">×</button></div>
    <div class="dialog-body">
      <span class="kpi-bar"><i style="width:${Math.round((idx / queue.length) * 100)}%"></i></span>
      <span class="area-tag" style="--area:${area.color}"><i></i>${esc(area.name)}</span>
      <h2 class="dt-title">${esc(t.title)}</h2>
      ${t.description ? `<p class="dt-desc">${esc(t.description.slice(0, 280))}</p>` : ''}
      <p class="hint">Chegou ${days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`}. O que fazer com ela?</p>
      <div class="triage-grid">
        <button type="button" class="btn btn-primary" data-tr="today">☀ Hoje</button>
        <button type="button" class="btn" data-tr="d1">Amanhã</button>
        <button type="button" class="btn" data-tr="d7">Semana que vem</button>
        <button type="button" class="btn" data-tr="keep">Sem prazo (ok)</button>
        <button type="button" class="btn" data-tr="urgent">🔥 Urgente</button>
        <button type="button" class="btn" data-tr="delegate">👤 Delegar</button>
        <button type="button" class="btn" data-tr="done">✓ Já fiz</button>
        <button type="button" class="btn btn-danger" data-tr="trash">Lixeira</button>
      </div>
      <button type="button" class="link-btn" data-tr="skip">Pular por agora</button>
    </div>`;
}

async function onClick(e) {
  const b = e.target.closest('[data-tr]');
  if (!b) return;
  const a = b.dataset.tr;
  const d = dlg();
  if (a === 'close') return d.close();
  const t = queue[idx] && Tasks.get(queue[idx]);
  if (!t) return d.close();
  const today = C.toDateKey(new Date());
  const now = new Date().toISOString();
  if (a === 'skip') { idx++; return render(); }
  if (a === 'today') await Tasks.update(t.id, { plannedFor: today, dueDate: today, triagedAt: now });
  else if (a === 'd1') await Tasks.update(t.id, { dueDate: C.addDays(today, 1), triagedAt: now });
  else if (a === 'd7') await Tasks.update(t.id, { dueDate: C.addDays(C.weekStart(new Date()), 7), triagedAt: now });
  else if (a === 'keep') await Tasks.update(t.id, { triagedAt: now });
  else if (a === 'urgent') await Tasks.update(t.id, { priority: 'urgent', dueDate: today, triagedAt: now });
  else if (a === 'done') await Tasks.complete(t.id);
  else if (a === 'trash') await Tasks.remove(t.id);
  else if (a === 'delegate') {
    await Tasks.update(t.id, { triagedAt: now });
    d.close();
    H.toast('Escolha o responsável na ficha');
    return H.openDetail(t.id);
  }
  idx++;
  render();
}

export function openTriage() {
  queue = triageList().map((t) => t.id);
  idx = 0;
  render();
  const d = dlg();
  if (!d.open) d.showModal();
}

export function initTriage(helpers) {
  H = helpers;
}
