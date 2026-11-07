/*
 * nfe.js
 * Importa XMLs de NF-e (modelo 55) e cria as contas do Financeiro do Merchan:
 * número, fornecedor (emitente), CNPJ, valor total, emissão, vencimentos das
 * duplicatas (uma conta por parcela) e o XML já marcado como recebido.
 * Tudo é lido no próprio aparelho; o arquivo não sai do celular.
 */
import { Sync } from './sync.js';
import { Bills } from './b2c.js';

const C = window.Core;
let H = null;

const pick = (root, path) => {
  let el = root;
  for (const tag of path.split('/')) {
    if (!el) return '';
    el = Array.from(el.children || []).find((c) => c.localName === tag);
  }
  return el ? el.textContent.trim() : '';
};
const all = (root, tag) => Array.from(root.getElementsByTagNameNS('*', tag));
const fmtCnpj = (v) => (v.length === 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v);

/** Lê um XML de NF-e e devolve os dados principais (ou lança erro com motivo). */
export function parseNfe(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('arquivo não é um XML válido');
  const inf = all(doc, 'infNFe')[0];
  if (!inf) throw new Error('não parece uma NF-e');
  const ide = all(inf, 'ide')[0];
  const emit = all(inf, 'emit')[0];
  const total = all(inf, 'ICMSTot')[0];
  const number = ide ? pick(ide, 'nNF') : '';
  const serie = ide ? pick(ide, 'serie') : '';
  const issue = ide ? (pick(ide, 'dhEmi') || pick(ide, 'dEmi')).slice(0, 10) : '';
  const supplier = emit ? pick(emit, 'xFant') || pick(emit, 'xNome') : '';
  const cnpj = emit ? pick(emit, 'CNPJ') || pick(emit, 'CPF') : '';
  const amount = Number(total ? pick(total, 'vNF') : 0) || 0;
  const key = (inf.getAttribute('Id') || '').replace(/^NFe/, '');
  const items = all(inf, 'det').slice(0, 4).map((d) => pick(d, 'prod/xProd')).filter(Boolean);
  const dups = all(inf, 'dup').map((d) => ({ n: pick(d, 'nDup'), due: pick(d, 'dVenc').slice(0, 10), value: Number(pick(d, 'vDup')) || 0 })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.due));
  return { number, serie, issue: /^\d{4}-\d{2}-\d{2}$/.test(issue) ? issue : null, supplier, cnpj, amount, key, items, dups };
}

export async function importFiles(files) {
  if (!Sync.v4()) return H.toast('O servidor ainda está atualizando. Tente em instantes.');
  const existing = Bills.all();
  let created = 0;
  const skipped = [];
  for (const f of files) {
    try {
      const n = parseNfe(await f.text());
      const dupKey = (b) => b.notes && n.key && b.notes.includes(n.key);
      if (existing.some(dupKey) || existing.some((b) => b.number === n.number && b.supplier === n.supplier && n.number)) {
        skipped.push(`${f.name} (já importada)`);
        continue;
      }
      const parcels = n.dups.length ? n.dups : [{ n: '', due: null, value: n.amount }];
      for (const p of parcels) {
        await Bills.save({
          supplier: n.supplier,
          number: n.number + (parcels.length > 1 && p.n ? '/' + p.n : ''),
          description: (n.items.length ? n.items.join(', ') : 'NF de fornecedor').slice(0, 480),
          amount: p.value || n.amount,
          issueDate: n.issue,
          dueDate: p.due,
          nfOk: true,
          xmlOk: true,
          notes: `CNPJ ${fmtCnpj(n.cnpj)} · Série ${n.serie} · Chave ${n.key}${parcels.length > 1 ? ` · Parcela ${p.n || ''} de ${parcels.length} (total da NF ${n.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''}`,
        });
        created++;
      }
    } catch (err) {
      skipped.push(`${f.name} (${err.message})`);
    }
  }
  H.toast(created ? `${created === 1 ? '1 conta criada' : created + ' contas criadas'} a partir dos XMLs${skipped.length ? `. ${skipped.length} ignorado(s): ${skipped.join('; ')}` : ''}` : `Nada importado. ${skipped.join('; ')}`);
}

export function initNfe(helpers) {
  H = helpers;
  document.addEventListener('change', (e) => {
    const inp = e.target.closest && e.target.closest('[data-nfe-input]');
    if (!inp || !inp.files || !inp.files.length) return;
    const files = Array.from(inp.files);
    inp.value = '';
    importFiles(files);
  });
}
