/*
 * core.js
 * Regras de negócio compartilhadas entre a página e o service worker.
 * É um script clássico (não módulo) para poder ser carregado no service worker
 * com importScripts(). Expõe tudo em self.Core.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Catálogos
  // ---------------------------------------------------------------------------
  // Cores discretas para as áreas (cada central escolhe as suas áreas)
  const AREA_COLORS = [
    '#8B5CF6', '#14A38B', '#DB4C9A', '#3B82F6', '#C08A1E',
    '#E5484D', '#0EA5C6', '#6E56CF', '#5E8C31', '#8A92A3',
  ];

  // Áreas fixas da versão 1 (usadas só para importar tarefas antigas)
  const LEGACY_AREAS = [
    { id: 'socio-torcedor', name: 'Sócio Torcedor', color: '#8B5CF6' },
    { id: 'comunidade', name: 'Comunidade', color: '#14A38B' },
    { id: 'merchan', name: 'Merchan', color: '#DB4C9A' },
    { id: 'crm', name: 'CRM', color: '#3B82F6' },
    { id: 'propostas', name: 'Propostas', color: '#C08A1E' },
  ];

  const STATUSES = [
    { id: 'pending', name: 'Pendente' },
    { id: 'doing', name: 'Em andamento' },
    { id: 'waiting', name: 'Aguardando retorno' },
    { id: 'done', name: 'Concluída' },
  ];

  const PRIORITIES = [
    { id: 'urgent', name: 'Urgente', rank: 0 },
    { id: 'high', name: 'Alta', rank: 1 },
    { id: 'normal', name: 'Normal', rank: 2 },
    { id: 'low', name: 'Baixa', rank: 3 },
  ];

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const STATUS_MAP = byId(STATUSES);
  const PRIORITY_MAP = byId(PRIORITIES);

  // Configurações de notificação: ficam salvas na central e valem para todos os dispositivos
  const DEFAULT_SETTINGS = {
    notificationsEnabled: true,
    frequencyHours: 2,
    startTime: '08:00',
    endTime: '20:00',
    dailySummary: true,
    dailySummaryTime: '08:00',
  };

  const RECURRENCES = [
    { id: 'daily', name: 'Todo dia' },
    { id: 'weekdays', name: 'Dias úteis' },
    { id: 'weekly', name: 'Toda semana' },
    { id: 'biweekly', name: 'A cada 2 semanas' },
    { id: 'monthly', name: 'Todo mês' },
  ];
  const RECURRENCE_MAP = byId(RECURRENCES);

  function mergeSettings(saved) {
    return Object.assign({}, DEFAULT_SETTINGS, saved || {});
  }

  function newAreaId() {
    return 'a' + Math.random().toString(36).slice(2, 9);
  }

  function nextAreaColor(areas) {
    const used = new Set(areas.map((a) => a.color));
    return AREA_COLORS.find((c) => !used.has(c)) || AREA_COLORS[areas.length % AREA_COLORS.length];
  }

  // ---------------------------------------------------------------------------
  // Datas (sempre no fuso local do dispositivo; datas guardadas como YYYY-MM-DD)
  // ---------------------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');

  function toDateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fromDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(key, n) {
    const d = fromDateKey(key);
    d.setDate(d.getDate() + n);
    return toDateKey(d);
  }
  function toMin(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;
  const validDate = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : null);
  const validTime = (v) => (typeof v === 'string' && TIME_RE.test(v) ? v : null);

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------------------------------------------------------------------------
  // Modelo de tarefa
  // ---------------------------------------------------------------------------
  function normalizeTask(t, areaIds) {
    const now = new Date().toISOString();
    let area = t.area == null ? '' : String(t.area);
    if (areaIds && areaIds.length && !areaIds.includes(area)) area = areaIds[0];
    const str = (v) => (v == null ? '' : String(v));
    const checklist = Array.isArray(t.checklist)
      ? t.checklist.filter((c) => c && str(c.text).trim()).map((c) => ({ id: str(c.id) || uid(), text: str(c.text).trim(), done: !!c.done }))
      : [];
    const comments = Array.isArray(t.comments)
      ? t.comments.filter((c) => c && str(c.text).trim()).map((c) => ({ id: str(c.id) || uid(), text: str(c.text), at: c.at || now }))
      : [];
    return {
      id: str(t.id) || uid(),
      title: str(t.title).trim(),
      description: str(t.description),
      area,
      status: STATUS_MAP[t.status] ? t.status : 'pending',
      priority: PRIORITY_MAP[t.priority] ? t.priority : 'normal',
      dueDate: validDate(t.dueDate),
      dueTime: validTime(t.dueTime),
      owner: str(t.owner),
      waitingFor: str(t.waitingFor),
      waitingSince: validDate(t.waitingSince),
      followUpDate: validDate(t.followUpDate),
      link: str(t.link),
      notes: str(t.notes),
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
      completedAt: t.completedAt || null,
      prevStatus: t.prevStatus || null,
      checklist,
      comments,
      recurrence: RECURRENCE_MAP[t.recurrence] ? t.recurrence : null,
      noteId: t.noteId ? str(t.noteId) : null,
      deletedAt: t.deletedAt || null,
    };
  }

  function normalizeNote(n) {
    const now = new Date().toISOString();
    const str = (v) => (v == null ? '' : String(v));
    return {
      id: str(n.id) || uid(),
      title: str(n.title).slice(0, 200),
      date: validDate(n.date) || toDateKey(new Date()),
      participants: str(n.participants).slice(0, 500),
      body: str(n.body),
      taskIds: Array.isArray(n.taskIds) ? n.taskIds.map(String) : [],
      createdAt: n.createdAt || now,
      updatedAt: n.updatedAt || now,
    };
  }

  /** Próxima data de uma tarefa recorrente (sempre hoje ou depois). */
  function nextRecurrenceDate(fromKey, rule, now) {
    const today = toDateKey(now || new Date());
    let key = fromKey || today;
    const step = (k) => {
      const d = fromDateKey(k);
      if (rule === 'daily') d.setDate(d.getDate() + 1);
      else if (rule === 'weekdays') {
        do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
      } else if (rule === 'weekly') d.setDate(d.getDate() + 7);
      else if (rule === 'biweekly') d.setDate(d.getDate() + 14);
      else if (rule === 'monthly') {
        const day = fromDateKey(fromKey || today).getDate();
        const m = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        m.setDate(Math.min(day, last));
        return toDateKey(m);
      }
      return toDateKey(d);
    };
    key = step(key);
    let guard = 0;
    while (key < today && guard++ < 400) key = step(key);
    return key;
  }

  /**
   * Classifica uma tarefa em relação ao momento atual.
   * section: overdue | today | upcoming | waiting | nodate | done
   * actionable: depende de uma ação minha agora (entra em lembretes)
   */
  function classify(t, now) {
    now = now || new Date();
    const today = toDateKey(now);
    if (t.deletedAt) return { section: 'deleted', actionable: false };
    if (t.status === 'done') return { section: 'done', actionable: false };

    if (t.status === 'waiting') {
      if (t.followUpDate && t.followUpDate <= today) {
        const late = t.followUpDate < today;
        return { section: late ? 'overdue' : 'today', followUpDue: true, overdue: late, today: !late, actionable: true };
      }
      return { section: 'waiting', actionable: false };
    }

    if (!t.dueDate) return { section: 'nodate', actionable: true };
    if (t.dueDate < today) return { section: 'overdue', overdue: true, actionable: true };
    if (t.dueDate === today) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (t.dueTime && toMin(t.dueTime) < nowMin) {
        return { section: 'overdue', overdue: true, today: true, actionable: true };
      }
      return { section: 'today', today: true, actionable: true };
    }
    return { section: 'upcoming', actionable: true };
  }

  /**
   * Chave de ordenação:
   * 1 atrasadas, 2 urgentes, 3 prazo hoje, 4 alta, 5 horário mais próximo,
   * 6 normal, 7 baixa.
   */
  function sortKey(t, now) {
    const c = classify(t, now);
    const date = c.followUpDue ? t.followUpDate : t.dueDate;
    const time = c.followUpDue ? '00:00' : t.dueTime || '23:59';
    const ts = date ? fromDateKey(date).getTime() + toMin(time) * 60000 : Number.MAX_SAFE_INTEGER;
    const rank = PRIORITY_MAP[t.priority] ? PRIORITY_MAP[t.priority].rank : 2;
    return [
      c.overdue ? 0 : 1,
      t.priority === 'urgent' ? 0 : 1,
      c.today ? 0 : 1,
      t.priority === 'high' ? 0 : 1,
      ts,
      rank,
      Date.parse(t.createdAt) || 0,
    ];
  }

  function sortTasks(list, now) {
    now = now || new Date();
    return list
      .map((t) => ({ t, k: sortKey(t, now) }))
      .sort((a, b) => {
        for (let i = 0; i < a.k.length; i++) {
          if (a.k[i] < b.k[i]) return -1;
          if (a.k[i] > b.k[i]) return 1;
        }
        return 0;
      })
      .map((x) => x.t);
  }

  // ---------------------------------------------------------------------------
  // Resumo para notificação
  // ---------------------------------------------------------------------------
  function joinPt(parts) {
    if (parts.length <= 1) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1];
  }
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function buildDigest(tasks, now) {
    now = now || new Date();
    const items = [];
    for (const t of tasks) {
      if (t.status === 'done' || t.deletedAt) continue;
      const c = classify(t, now);
      if (c.actionable) items.push(t);
    }
    if (!items.length) return null;

    const counts = { overdue: 0, urgent: 0, today: 0, upcoming: 0, nodate: 0, followups: 0 };
    for (const t of items) {
      const c = classify(t, now);
      if (c.followUpDue) counts.followups++;
      if (c.overdue) counts.overdue++;
      else if (t.priority === 'urgent') counts.urgent++;
      else if (c.today) counts.today++;
      else if (c.section === 'upcoming') counts.upcoming++;
      else counts.nodate++;
    }

    const parts = [];
    if (counts.overdue) parts.push(plural(counts.overdue, 'atrasada', 'atrasadas'));
    if (counts.urgent) parts.push(plural(counts.urgent, 'urgente', 'urgentes'));
    if (counts.today) parts.push(counts.today + ' para hoje');
    if (counts.upcoming) parts.push(plural(counts.upcoming, 'próxima', 'próximas'));
    if (counts.nodate) parts.push(counts.nodate + ' sem prazo');

    const top = sortTasks(items, now)
      .slice(0, 3)
      .map((t) => '• ' + (classify(t, now).followUpDue ? 'Cobrar retorno: ' : '') + t.title);

    const total = items.length;
    const lines = [
      'Você ainda possui ' + plural(total, 'demanda aberta', 'demandas abertas') + '.',
      joinPt(parts) + '.',
    ];
    if (counts.followups) lines.push(plural(counts.followups, 'retorno para cobrar', 'retornos para cobrar') + '.');
    lines.push('', 'Principais:', ...top);

    return {
      title: counts.overdue ? 'Tarefas pendentes, ' + plural(counts.overdue, 'atrasada', 'atrasadas') : 'Tarefas pendentes',
      body: lines.join('\n'),
      total,
      counts,
    };
  }

  /** Resumo da manhã: só o que é para hoje (inclui atrasadas e cobranças). */
  function buildDailySummary(tasks, now) {
    now = now || new Date();
    const items = tasks.filter((t) => {
      const c = classify(t, now);
      return c.actionable && (c.today || c.overdue);
    });
    if (!items.length) return null;
    let overdue = 0;
    let followups = 0;
    for (const t of items) {
      const c = classify(t, now);
      if (c.followUpDue) followups++;
      else if (c.overdue) overdue++;
    }
    const dueToday = items.length - overdue - followups;
    const parts = [];
    if (dueToday) parts.push(dueToday + ' para hoje');
    if (overdue) parts.push(plural(overdue, 'atrasada', 'atrasadas'));
    if (followups) parts.push(plural(followups, 'retorno para cobrar', 'retornos para cobrar'));
    const top = sortTasks(items, now).slice(0, 3).map((t) => '• ' + (classify(t, now).followUpDue ? 'Cobrar retorno: ' : '') + t.title);
    return { title: 'Seu dia', body: ['Bom dia! Hoje você tem ' + joinPt(parts) + '.', '', 'Comece por:', ...top].join('\n') };
  }

  // ---------------------------------------------------------------------------
  // Janela e frequência dos lembretes
  // ---------------------------------------------------------------------------
  function inWindow(settings, now) {
    const m = now.getHours() * 60 + now.getMinutes();
    const s = toMin(settings.startTime) ?? 0;
    const e = toMin(settings.endTime) ?? 1440;
    if (s === e) return true;
    return s < e ? m >= s && m < e : m >= s || m < e;
  }

  function isReminderDue(settings, lastNotifiedAt, now) {
    if (!settings.notificationsEnabled) return false;
    if (!inWindow(settings, now)) return false;
    const last = lastNotifiedAt ? Date.parse(lastNotifiedAt) : 0;
    // 1 minuto de folga para não perder o horário por causa do intervalo de verificação
    return now.getTime() - last >= settings.frequencyHours * 3600000 - 60000;
  }

  function nextReminderAt(settings, lastNotifiedAt, now) {
    if (!settings.notificationsEnabled) return null;
    const freq = settings.frequencyHours * 3600000;
    let base = lastNotifiedAt ? Date.parse(lastNotifiedAt) + freq : now.getTime();
    if (base < now.getTime()) base = now.getTime();
    const d = new Date(base);
    if (inWindow(settings, d)) return d;
    const start = toMin(settings.startTime) ?? 0;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(start / 60), start % 60);
    if (next.getTime() <= d.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  // ---------------------------------------------------------------------------
  // IndexedDB mínimo (usado pela página e pelo service worker)
  // ---------------------------------------------------------------------------
  const DB_NAME = 'central-tarefas';
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function run(storeName, mode, fn) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          const store = tx.objectStore(storeName);
          let result;
          const req = fn(store);
          if (req && typeof req === 'object' && 'onsuccess' in req) {
            req.onsuccess = () => {
              result = req.result;
            };
          }
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    );
  }

  const idb = {
    getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
    get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
    put: (store, value, key) => run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
    del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
    replaceAll: (store, values) =>
      run(store, 'readwrite', (s) => {
        s.clear();
        values.forEach((v) => s.put(v));
      }),
  };

  root.Core = {
    AREA_COLORS, LEGACY_AREAS, STATUSES, PRIORITIES, STATUS_MAP, PRIORITY_MAP,
    DEFAULT_SETTINGS, mergeSettings, newAreaId, nextAreaColor,
    RECURRENCES, RECURRENCE_MAP, normalizeNote, nextRecurrenceDate, buildDailySummary,
    pad, toDateKey, fromDateKey, addDays, toMin, uid,
    normalizeTask, classify, sortTasks, buildDigest,
    inWindow, isReminderDue, nextReminderAt,
    idb,
  };
})(typeof self !== 'undefined' ? self : this);
