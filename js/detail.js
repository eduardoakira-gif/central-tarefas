/*
 * detail.js
 * Ficha da tarefa: tocar numa tarefa abre a ficha dela, com marcações de
 * andamento (chips), checklist com progresso e um diário de notas com data e
 * hora. Cada marcação ligada ou desligada também entra no diário.
 */
import { Tasks } from './tasks.js';
import { Sync } from './sync.js';
import { esc, tagTone } from './ui.js';
import { micButton } from './myday.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
let H = null;
let openId = null;
// Foco: um bloco por vez, guardado no aparelho (sobrevive a fechar a ficha)
const focus = JSON.parse(localStorage.getItem('ct-focus') || 'null') || { id: null, start: 0, len: 0 };
let tick = null;
function clock() {
  const left = Math.max(0, focus.start + focus.len * 60000 - Date.now());
  return `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
}
function runTick() {
  clearInterval(tick);
  if (!focus.id) return;
  tick = setInterval(async () => {
    const el = document.getElementById('dtClock');
    if (el) el.textContent = clock();
    if (Date.now() >= focus.start + focus.len * 60000) await stopFocus(true);
  }, 1000);
}
async function stopFocus(finished) {
  const t = Tasks.get(focus.id);
  const used = Math.max(1, Math.round((Math.min(Date.now(), focus.start + focus.len * 60000) - focus.start) / 60000));
  Object.assign(focus, { id: null, start: 0, len: 0 });
  localStorage.removeItem('ct-focus');
  clearInterval(tick);
  if (t) await Tasks.update(t.id, { comments: (t.comments || []).concat({ id: C.uid(), text: `Foco: ${used} min${finished ? '' : ' (interrompido)'}`, at: new Date().toISOString() }) });
  if (finished) {
    H && H.toast(`Bloco de foco concluído: ${t ? t.title : ''}`);
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
  }
  render();
}

// Marcações prontas para o dia a dia do B2C (dá para criar as suas)
export const PRESET_TAGS = ['Orçamento pedido', 'Orçamento recebido', 'Aguardando aprovação', 'Aprovado', 'Aguardando fornecedor', 'Em produção', 'Contratado', 'Pago', 'Divulgado', 'Bloqueado'];

function allTags() {
  const used = new Set();
  Tasks.all().forEach((t) => (t.tags || []).forEach((x) => used.add(x)));
  const custom = [...used].filter((x) => !PRESET_TAGS.includes(x)).sort((a, b) => a.localeCompare(b));
  return PRESET_TAGS.concat(custom);
}

const when = (iso) => {
  const d = new Date(iso);
  const today = C.toDateKey(new Date());
  const key = C.toDateKey(d);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (key === today) return 'Hoje, ' + hm;
  if (key === C.addDays(today, -1)) return 'Ontem, ' + hm;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + hm;
};

function render() {
  const t = openId && Tasks.get(openId);
  if (!t || t.deletedAt) {
    if ($('#detailDialog').open) $('#detailDialog').close();
    openId = null;
    return;
  }
  const areas = (Sync.central && Sync.central.areas) || [];
  const area = areas.find((a) => a.id === t.area) || { name: 'Sem área', color: '#8A92A3' };
  const today = C.toDateKey(new Date());
  const done = (t.checklist || []).filter((c) => c.done).length;
  const total = (t.checklist || []).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const tags = t.tags || [];
  const due = t.dueDate ? C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + (t.dueTime ? ' ' + t.dueTime : '') : 'Sem prazo';
  const late = t.status !== 'done' && t.dueDate && t.dueDate < today;
  const statuses = [['pending', 'Pendente'], ['doing', 'Em andamento'], ['waiting', 'Aguardando'], ['done', 'Concluída']];
  const log = (t.comments || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));

  $('#dtHead').innerHTML = `
    <span class="area-tag" style="--area:${area.color}"><i></i>${esc(area.name)}</span>
    <h2 class="dt-title">${esc(t.title)}</h2>
    <div class="dt-meta" data-id="${esc(t.id)}">
      <span class="pill dt-date${late ? ' is-late' : ''}" title="Mudar prazo">📅 ${esc(due)}<input type="date" data-quick="dueDate" value="${t.dueDate || ''}" aria-label="Prazo" tabindex="-1"></span>
      <span class="pill">⚑ ${esc((C.PRIORITY_MAP[t.priority] || {}).name || 'Normal')}</span>
      ${t.owner ? `<span class="pill">👤 ${esc(t.owner)}</span>` : ''}
      ${t.project ? `<span class="pill">📁 ${esc(t.project)}</span>` : ''}
      ${t.link ? `<a class="pill" href="${esc(/^https?:\/\//.test(t.link) ? t.link : 'https://' + t.link)}" target="_blank" rel="noopener">🔗 Abrir link</a>` : ''}
      ${t.waitingFor ? `<span class="pill">⏳ ${esc(t.waitingFor)}</span>` : ''}
    </div>
    <div class="dt-quickdue" role="group" aria-label="Prazo rápido">${[['Hoje', today], ['Amanhã', C.addDays(today, 1)], ['+3 dias', C.addDays(today, 3)], ['+1 semana', C.addDays(today, 7)]].map(([n, d]) => `<button type="button" data-dt-due="${d}" aria-pressed="${t.dueDate === d}">${n}</button>`).join('')}${t.dueDate ? '<button type="button" data-dt-due="">Sem prazo</button>' : ''}</div>
    <div class="dt-status" role="group" aria-label="Situação">${statuses.map(([k, n]) => `<button type="button" data-dt-status="${k}" aria-pressed="${t.status === k}">${n}</button>`).join('')}</div>`;

  $('#dtTags').innerHTML = `
    <div class="dt-sec-head"><h3>Marcações</h3><span class="hint">Toque para marcar o andamento</span></div>
    <div class="dt-chips">${allTags().map((x) => `<button type="button" class="dt-chip tone-${tagTone(x)}" data-dt-tag="${esc(x)}" aria-pressed="${tags.includes(x)}">${tags.includes(x) ? '✓ ' : ''}${esc(x)}</button>`).join('')}
      <button type="button" class="dt-chip dt-chip-add" data-dt="newtag">+ Nova marcação</button></div>`;

  $('#dtCheck').innerHTML = `
    <div class="dt-sec-head"><h3>Checklist</h3>${total ? `<span class="hint">${done} de ${total} · ${pct}%</span>` : '<span class="hint">Quebre a tarefa em passos</span>'}</div>
    ${total ? `<span class="kpi-bar"><i style="width:${pct}%"></i></span>` : ''}
    <div class="dt-checks">${(t.checklist || []).map((c) => `<label class="dt-check${c.done ? ' is-done' : ''}"><input type="checkbox" data-dt-check="${esc(c.id)}" ${c.done ? 'checked' : ''}><span>${esc(c.text)}</span><button type="button" class="icon-btn" data-dt-uncheck="${esc(c.id)}" aria-label="Remover passo">×</button></label>`).join('')}</div>`;

  $('#dtLog').innerHTML = log.length
    ? log.map((c) => `<div class="dt-entry${/^(Marcou|Desmarcou|Situação|Concluiu|Passo concluído|Foco:)/.test(c.text) ? ' is-auto' : ''}"><span class="dt-when">${when(c.at)}</span><p>${esc(c.text)}</p><button type="button" class="icon-btn" data-dt-del="${esc(c.id)}" aria-label="Apagar nota">×</button></div>`).join('')
    : '<p class="hint">Nenhuma nota ainda. Registre cada passo: com quem falou, o que ficou combinado, o próximo passo.</p>';
  $('#dtDesc').hidden = !t.description;
  $('#dtDesc').textContent = t.description || '';
  $('#dtDone').textContent = t.status === 'done' ? 'Reabrir' : '✓ Concluir';
  const mins = (t.comments || []).reduce((a, c) => { const m = /^Foco: (\d+) min/.exec(c.text || ''); return a + (m ? Number(m[1]) : 0); }, 0);
  const running = focus.id === t.id;
  $('#dtFocus').innerHTML = `<div class="dt-sec-head"><h3>Foco</h3><span class="hint">${mins ? `Tempo investido: ${mins >= 60 ? Math.floor(mins / 60) + 'h' + String(mins % 60).padStart(2, '0') : mins + ' min'}` : 'Blocos de foco sem distração'}</span></div>
    ${running ? `<div class="dt-timer"><strong id="dtClock">${clock()}</strong><button type="button" class="btn" data-dt="focus-stop">Parar e registrar</button></div>`
      : `<div class="btn-row">${[15, 25, 50].map((m) => `<button type="button" class="btn btn-sm" data-dt-focus="${m}">▶ ${m} min</button>`).join('')}</div>`}`;
}

async function addLog(text) {
  const t = Tasks.get(openId);
  if (!t) return;
  await Tasks.update(t.id, { comments: (t.comments || []).concat({ id: C.uid(), text, at: new Date().toISOString() }) });
}

export function openDetail(id) {
  if (!Tasks.get(id)) return H.toast('Essa tarefa não existe mais.');
  openId = id;
  $('#dtNote').value = '';
  $('#dtStep').value = '';
  render();
  if (!$('#detailDialog').open) $('#detailDialog').showModal();
}
/** Chamado a cada renderização do app: mantém a ficha aberta em dia. */
export function refreshDetail() {
  if (openId && $('#detailDialog').open) render();
}

export function initDetail(helpers) {
  H = helpers;
  runTick();
  const dlg = $('#detailDialog');
  dlg.addEventListener('close', () => (openId = null));
  dlg.addEventListener('click', async (e) => {
    const t = openId && Tasks.get(openId);
    if (!t) return;
    const st = e.target.closest('[data-dt-status]');
    if (st) {
      const v = st.dataset.dtStatus;
      if (v === t.status) return;
      if (v === 'done') await Tasks.complete(t.id);
      else await Tasks.update(t.id, { status: v });
      return addLog('Situação: ' + { pending: 'Pendente', doing: 'Em andamento', waiting: 'Aguardando', done: 'Concluída' }[v]);
    }
    const fc = e.target.closest('[data-dt-focus]');
    if (fc) {
      if (focus.id && focus.id !== t.id) await stopFocus(false);
      Object.assign(focus, { id: t.id, start: Date.now(), len: Number(fc.dataset.dtFocus) });
      localStorage.setItem('ct-focus', JSON.stringify(focus));
      runTick();
      return render();
    }
    const du = e.target.closest('[data-dt-due]');
    if (du) {
      const v = du.dataset.dtDue || null;
      if (v === (t.dueDate || null)) return;
      await Tasks.update(t.id, { dueDate: v });
      return addLog(v ? 'Situação: prazo para ' + C.fromDateKey(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'Situação: sem prazo');
    }
    const tg = e.target.closest('[data-dt-tag]');
    if (tg) {
      const x = tg.dataset.dtTag;
      const on = (t.tags || []).includes(x);
      const tags = on ? t.tags.filter((y) => y !== x) : (t.tags || []).concat(x).slice(-12);
      await Tasks.update(t.id, { tags, comments: (t.comments || []).concat({ id: C.uid(), text: (on ? 'Desmarcou: ' : 'Marcou: ') + x, at: new Date().toISOString() }) });
      return;
    }
    const del = e.target.closest('[data-dt-del]');
    if (del) return Tasks.update(t.id, { comments: (t.comments || []).filter((c) => c.id !== del.dataset.dtDel) });
    const unc = e.target.closest('[data-dt-uncheck]');
    if (unc) {
      e.preventDefault();
      return Tasks.update(t.id, { checklist: (t.checklist || []).filter((c) => c.id !== unc.dataset.dtUncheck) });
    }
    const b = e.target.closest('[data-dt]');
    if (!b) return;
    const a = b.dataset.dt;
    if (a === 'newtag') {
      const name = (prompt('Nome da marcação (ex.: Arte aprovada, Contrato assinado):') || '').trim().slice(0, 30);
      if (!name) return;
      if ((t.tags || []).includes(name)) return;
      return Tasks.update(t.id, { tags: (t.tags || []).concat(name).slice(-12), comments: (t.comments || []).concat({ id: C.uid(), text: 'Marcou: ' + name, at: new Date().toISOString() }) });
    }
    if (a === 'done') {
      if (t.status === 'done') return Tasks.update(t.id, { status: t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'pending' });
      await Tasks.complete(t.id);
      return H.toast('Concluída');
    }
    if (a === 'focus-stop') return stopFocus(false);
    if (a === 'share') {
      const ck = t.checklist || [];
      const notes = (t.comments || []).filter((c) => !/^(Marcou|Desmarcou|Situação|Passo concluído)/.test(c.text))
        .sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 5);
      const st = { pending: 'Pendente', doing: 'Em andamento', waiting: 'Aguardando', done: 'Concluída' }[t.status] || '';
      const text = [`*${t.title}*`, `Situação: ${st}${t.dueDate ? ' · prazo ' + C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}`,
        (t.tags || []).length ? 'Marcações: ' + t.tags.join(', ') : '',
        ck.length ? `Checklist ${ck.filter((c) => c.done).length}/${ck.length}:\n` + ck.map((c) => (c.done ? '✅ ' : '⬜ ') + c.text).join('\n') : '',
        notes.length ? 'Andamento:\n' + notes.map((c) => `• ${when(c.at)}: ${c.text}`).join('\n') : ''].filter(Boolean).join('\n\n');
      if (navigator.share) { try { await navigator.share({ text }); return; } catch (err) { if (err && err.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(text); H.toast('Andamento copiado. É só colar no WhatsApp.'); } catch { H.toast('Não consegui copiar.'); }
      return;
    }
    if (a === 'edit') {
      dlg.close();
      return H.openTask(t.id);
    }
    if (a === 'ai') {
      dlg.close();
      const notes = (t.comments || []).map((c) => `- ${when(c.at)}: ${c.text}`).join('\n');
      return H.ask(`Analise o andamento desta tarefa e me diga o próximo passo concreto, o que pode travar e, se fizer sentido, a mensagem que eu preciso mandar.\n\nTarefa: ${t.title}${t.dueDate ? `\nPrazo: ${t.dueDate}` : ''}${(t.tags || []).length ? `\nMarcações: ${t.tags.join(', ')}` : ''}${notes ? `\nDiário:\n${notes}` : ''}`);
    }
  });
  dlg.addEventListener('change', async (e) => {
    const ck = e.target.closest('[data-dt-check]');
    if (!ck) return;
    const t = Tasks.get(openId);
    if (!t) return;
    const item = (t.checklist || []).find((c) => c.id === ck.dataset.dtCheck);
    const checklist = (t.checklist || []).map((c) => (c.id === ck.dataset.dtCheck ? Object.assign({}, c, { done: ck.checked }) : c));
    const comments = ck.checked && item ? (t.comments || []).concat({ id: C.uid(), text: 'Passo concluído: ' + item.text, at: new Date().toISOString() }) : t.comments;
    await Tasks.update(t.id, { checklist, comments });
  });
  $('#dtNoteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('#dtNote').value.trim();
    if (!v) return $('#dtNote').focus();
    $('#dtNote').value = '';
    await addLog(v.slice(0, 2000));
  });
  $('#dtStepForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('#dtStep').value.trim();
    const t = Tasks.get(openId);
    if (!v || !t) return;
    $('#dtStep').value = '';
    await Tasks.update(t.id, { checklist: (t.checklist || []).concat({ id: C.uid(), text: v.slice(0, 200), done: false }) });
  });
  const mic = micButton('dtNote', 'Ditar nota');
  if (mic) $('#dtNoteBtn').insertAdjacentHTML('beforebegin', mic);
}
