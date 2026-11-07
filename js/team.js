/*
 * team.js
 * Equipe e cobrança em 1 toque: abre o WhatsApp direto na conversa da pessoa
 * (quando o número está cadastrado) e registra a cobrança na tarefa.
 */
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';

const C = window.Core;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function personOf(name) {
  const list = (Sync.central && Sync.central.people) || [];
  const n = fold(name);
  if (!n) return null;
  return list.find((p) => fold(p.name) === n) || list.find((p) => fold(p.name).split(' ')[0] === n.split(' ')[0]) || null;
}

/** Número no formato do wa.me: só dígitos, com 55 se vier sem país. */
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10) return '';
  return d.length <= 11 ? '55' + d : d;
}

export function waUrl(name, text) {
  const p = personOf(name);
  const num = p ? waNumber(p.phone) : '';
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** Texto de cobrança de uma tarefa só. */
export function nudgeText(t) {
  const first = String(t.owner || '').split(' ')[0] || 'tudo bem';
  const today = C.toDateKey(new Date());
  const when = t.dueDate ? ` (${t.dueDate < today ? 'venceu' : 'vence'} ${C.fromDateKey(t.dueDate).toLocaleDateString('pt-BR')})` : '';
  const since = t.status === 'waiting' && t.waitingSince ? ` Estou aguardando desde ${C.fromDateKey(t.waitingSince).toLocaleDateString('pt-BR')}.` : '';
  return `Fala, ${first}! Como está "${t.title}"${when}?${since}\n\nSe travou em algo, me fala hoje que a gente destrava junto. Se precisar de novo prazo, me passa a data que você consegue entregar.`;
}

/** Registra a cobrança: comentário na tarefa e próxima cobrança em 2 dias úteis. */
export async function logNudge(ids) {
  const today = C.toDateKey(new Date());
  let next = C.addDays(today, 2);
  const wd = C.fromDateKey(next).getDay();
  if (wd === 6) next = C.addDays(next, 2);
  if (wd === 0) next = C.addDays(next, 1);
  const when = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  for (const id of ids) {
    const t = Tasks.get(id);
    if (!t) continue;
    const comments = (t.comments || []).concat({ id: C.uid(), text: `Cobrado no WhatsApp em ${when}.`, at: new Date().toISOString() });
    const patch = { comments, followUpDate: next };
    if (t.status !== 'waiting') Object.assign(patch, { status: 'waiting', waitingSince: today, waitingFor: t.waitingFor || t.owner || '' });
    await Tasks.update(id, patch);
  }
  return next;
}
