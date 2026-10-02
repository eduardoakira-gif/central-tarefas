/*
 * notes.js
 * Bloco de notas de reuniões e as chamadas de IA (gerar tarefas a partir
 * de uma nota e captura rápida de uma tarefa escrita em texto livre).
 * A IA roda no servidor; a chave nunca fica no site.
 */
import { Sync } from './sync.js';

const C = window.Core;
const nowIso = () => new Date().toISOString();

export const Notes = {
  all() {
    return Sync.notes
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  },
  get: (id) => Sync.notes.find((n) => n.id === id) || null,

  async create(data = {}) {
    const n = C.normalizeNote(Object.assign({}, data, { id: C.uid(), createdAt: nowIso(), updatedAt: nowIso() }));
    await Sync.upsert('notes', n);
    return n;
  },

  async update(id, patch) {
    const cur = this.get(id);
    if (!cur) return null;
    const n = C.normalizeNote(Object.assign({}, cur, patch, { updatedAt: nowIso() }));
    await Sync.upsert('notes', n);
    return n;
  },

  remove(id) {
    return Sync.remove('notes', id);
  },

  /** Pede à IA as tarefas da nota. Devolve sugestões (nada é criado ainda). */
  async extract(note) {
    const r = await Sync.call(
      'aiExtract',
      { title: note.title, participants: note.participants, date: note.date, text: note.body },
      { timeout: 90000 }
    );
    return r.tasks || [];
  },

  /** Captura rápida: transforma uma frase em uma tarefa sugerida. */
  async quick(text) {
    const r = await Sync.call('aiQuick', { text, date: C.toDateKey(new Date()) }, { timeout: 45000 });
    return r.task;
  },
};
