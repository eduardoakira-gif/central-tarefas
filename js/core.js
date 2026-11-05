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
    radarEnabled: false,
    radarFrequencyHours: 0, // 0 = 2x por dia nos horários de radarTimes
    radarTimes: ['09:00', '15:00'],
    radarOrgs: [],
    context: '',
    billsReminder: true,
    monthCloseDay: 5,
    weeklyReview: true,
    aiBriefing: true,
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

  /** Segunda-feira da semana (AAAA-MM-DD). */
  function weekStart(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return toDateKey(x);
  }

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
      focusWeek: validDate(t.focusWeek),
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
  // v4: Painel B2C (indicadores e OKRs) e Financeiro do Merchan
  // ---------------------------------------------------------------------------
  const PILLARS = [
    { id: 'geral', name: 'Visão geral', color: '#15171C' },
    { id: 'comunidade', name: 'Comunidade', color: '#14A38B' },
    { id: 'socio', name: 'Sócio-Torcedor', color: '#8B5CF6' },
    { id: 'merchan', name: 'Merchan', color: '#DB4C9A' },
    { id: 'crm', name: 'CRM', color: '#3B82F6' },
    { id: 'inferno', name: 'Inferno Roxo', color: '#7C3AED' },
    { id: 'kings', name: 'Kings League', color: '#C08A1E' },
  ];
  const PILLAR_MAP = byId(PILLARS);
  const UNITS = [
    { id: 'number', name: 'Número' },
    { id: 'currency', name: 'R$' },
    { id: 'percent', name: '%' },
    { id: 'ratio', name: 'Vezes (x)' },
    { id: 'days', name: 'Dias' },
  ];

  // Indicadores usados pelas organizações referência (T1, Team Liquid, 100 Thieves, FURIA…)
  // IDs fixos: carregar o catálogo em dois aparelhos não duplica nada.
  const KPI_CATALOG = [
    ['geral', 'Receita B2C total', 'currency', 'up', 'Soma de sócio, merchan e demais receitas com o torcedor no mês. É o número que o dono olha primeiro.', true],
    ['geral', 'Receita por torcedor ativo (ARPU)', 'currency', 'up', 'Receita B2C do mês dividida pelos torcedores ativos. Métrica-norte: mostra se a comunidade está virando negócio.', true],
    ['geral', 'Base única de torcedores', 'number', 'up', 'Contatos únicos identificados (CRM + sócio + loja + comunidade).'],
    ['comunidade', 'Torcedores ativos no mês (MAU)', 'number', 'up', 'Pessoas que interagiram no mês (Discord, WhatsApp, eventos, lives, redes).'],
    ['comunidade', 'Taxa de engajamento', 'percent', 'up', 'Interações ÷ alcance nas redes principais.'],
    ['comunidade', 'Membros nos canais próprios', 'number', 'up', 'Discord, grupos de WhatsApp e app: o público que a org controla.'],
    ['comunidade', 'Presença em eventos e watch parties', 'number', 'up', 'Torcedores presentes nos encontros do mês (modelo Karmine Corp).'],
    ['comunidade', 'NPS da torcida', 'number', 'up', 'De -100 a 100. Mede se o torcedor recomendaria a experiência.'],
    ['comunidade', 'Conteúdo gerado por fãs (UGC)', 'number', 'up', 'Posts, clipes e artes de torcedores marcando a org.'],
    ['socio', 'Sócios ativos', 'number', 'up', 'Assinaturas pagas e em dia no fim do mês.'],
    ['socio', 'Receita recorrente mensal (MRR)', 'currency', 'up', 'Receita mensal dos planos de sócio.'],
    ['socio', 'Churn mensal', 'percent', 'down', 'Sócios que cancelaram ou não renovaram ÷ sócios no início do mês.'],
    ['socio', 'Novos sócios no mês', 'number', 'up', 'Adesões novas no mês.'],
    ['socio', 'Conversão comunidade → sócio', 'percent', 'up', 'Novos sócios ÷ torcedores ativos. Mostra se a comunidade vira receita.'],
    ['socio', 'LTV do sócio', 'currency', 'up', 'Ticket médio × meses médios de permanência.'],
    ['socio', 'CAC do sócio', 'currency', 'down', 'Investimento em aquisição ÷ novos sócios.'],
    ['socio', 'LTV ÷ CAC', 'ratio', 'up', 'Acima de 3x é saudável.'],
    ['merchan', 'Faturamento do merchan', 'currency', 'up', 'Vendas da loja no mês (modelo T1: produtos ligados aos ídolos).'],
    ['merchan', 'Pedidos', 'number', 'up', 'Quantidade de pedidos no mês.'],
    ['merchan', 'Ticket médio', 'currency', 'up', 'Faturamento ÷ pedidos.'],
    ['merchan', 'Margem bruta', 'percent', 'up', '(Receita − custo do produto) ÷ receita.'],
    ['merchan', 'Taxa de recompra', 'percent', 'up', 'Clientes que compraram de novo nos últimos 90 dias.'],
    ['merchan', 'Sell-through dos drops', 'percent', 'up', 'Unidades vendidas ÷ unidades lançadas (modelo 100 Thieves).'],
    ['merchan', 'Conversão da loja', 'percent', 'up', 'Pedidos ÷ visitas.'],
    ['merchan', 'Prazo médio de entrega', 'days', 'down', 'Dias entre a compra e a entrega.'],
    ['crm', 'Contatos na base', 'number', 'up', 'Contatos válidos no RD Station.'],
    ['crm', 'Taxa de opt-in', 'percent', 'up', 'Contatos que aceitam receber comunicação.'],
    ['crm', 'Taxa de abertura', 'percent', 'up', 'Média das campanhas do mês.'],
    ['crm', 'Taxa de clique (CTR)', 'percent', 'up', 'Cliques ÷ entregues.'],
    ['crm', 'Receita atribuída ao CRM', 'currency', 'up', 'Vendas e adesões vindas de e-mails e réguas.'],
    ['crm', 'Taxa de descadastro', 'percent', 'down', 'Descadastros ÷ entregues.'],
    ['inferno', 'Membros cadastrados no Inferno Roxo', 'number', 'up', 'Torcedores com carteirinha/cadastro de membro (entram no CRM).'],
    ['inferno', 'Membros ativos no mês', 'number', 'up', 'Membros que participaram de algo no mês: evento, caravana, grupo, ação.'],
    ['inferno', 'Presença em eventos e caravanas', 'number', 'up', 'Torcedores do Inferno Roxo presentes no mês (modelo Dezorganizada Furiosa e Blue Wall).'],
    ['inferno', 'Núcleos regionais ativos', 'number', 'up', 'Grupos por cidade com líder e agenda (modelo penyes do Barcelona).'],
    ['inferno', 'Receita da torcida', 'currency', 'up', 'Kits, caravanas pagas, produtos da linha Inferno Roxo e patrocínio da torcida.'],
    ['inferno', 'Conversão membro → sócio', 'percent', 'up', 'Membros que viraram sócios pagos ÷ membros ativos.'],
    ['kings', 'Torcedores do Fluxo FC no CRM', 'number', 'up', 'Cadastros capturados em jogo, caravana, QR code e lives dos presidentes.'],
    ['kings', 'Ingressos resgatados e vendidos', 'number', 'up', 'Ingressos da Kings League entregues a sócios e vendidos no mês.'],
    ['kings', 'Ocupação da caravana', 'percent', 'up', 'Lugares ocupados ÷ lugares oferecidos.'],
    ['kings', 'Receita de merchan do Fluxo FC', 'currency', 'up', 'Linha dos presidentes, drops de vitória e itens de jogo.'],
    ['kings', 'Vendas por cupom de creator', 'currency', 'up', 'Receita atribuída aos cupons de Nobru, Cerol, Toguro e creators.'],
    ['kings', 'Receita B2C da Kings por jogo', 'currency', 'up', 'Caravana + ingresso + merchan + sócio atribuído, dividido pelos jogos do mês.'],
  ];
  const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function kpiCatalog() {
    return KPI_CATALOG.map(([pillar, name, unit, direction, description, northStar], i) => ({
      id: 'kpi-' + pillar + '-' + slug(name), pillar, name, unit, direction, description, northStar: !!northStar, order: i,
    }));
  }

  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const YM_RE = /^\d{4}-\d{2}$/;

  function normalizeMetric(m) {
    const now = new Date().toISOString();
    const str = (v) => (v == null ? '' : String(v));
    const values = {};
    if (m.values && typeof m.values === 'object') {
      for (const [k, v] of Object.entries(m.values)) if (YM_RE.test(k) && num(v) !== null) values[k] = num(v);
    }
    return {
      id: str(m.id) || uid(),
      pillar: PILLAR_MAP[m.pillar] ? m.pillar : 'geral',
      name: str(m.name).trim().slice(0, 80) || 'Indicador',
      unit: UNITS.some((u) => u.id === m.unit) ? m.unit : 'number',
      direction: m.direction === 'down' ? 'down' : 'up',
      target: num(m.target),
      description: str(m.description).slice(0, 500),
      northStar: !!m.northStar,
      order: Number(m.order) || 0,
      values,
      createdAt: m.createdAt || now,
      updatedAt: m.updatedAt || now,
    };
  }

  function normalizeOkr(o) {
    const now = new Date().toISOString();
    const str = (v) => (v == null ? '' : String(v));
    return {
      id: str(o.id) || uid(),
      quarter: /^\d{4}-Q[1-4]$/.test(o.quarter) ? o.quarter : quarterOf(new Date()),
      pillar: PILLAR_MAP[o.pillar] ? o.pillar : 'geral',
      objective: str(o.objective).trim().slice(0, 200),
      krs: Array.isArray(o.krs)
        ? o.krs.filter((k) => k && str(k.text).trim()).slice(0, 8).map((k) => ({
            id: str(k.id) || uid(), text: str(k.text).trim().slice(0, 200),
            start: num(k.start) ?? 0, target: num(k.target), current: num(k.current), kpiId: k.kpiId ? str(k.kpiId) : null,
          }))
        : [],
      createdAt: o.createdAt || now,
      updatedAt: o.updatedAt || now,
    };
  }

  function quarterOf(d) {
    return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
  }
  /** Quanto do trimestre já passou (0 a 1). */
  function quarterElapsed(q, now) {
    const [y, n] = [Number(q.slice(0, 4)), Number(q.slice(-1))];
    const start = new Date(y, (n - 1) * 3, 1).getTime();
    const end = new Date(y, n * 3, 1).getTime();
    return Math.min(1, Math.max(0, ((now || new Date()).getTime() - start) / (end - start)));
  }
  function krProgress(k, metrics) {
    let current = k.current;
    if (k.kpiId && metrics) {
      const m = metrics.find((x) => x.id === k.kpiId);
      if (m) {
        const months = Object.keys(m.values).sort();
        if (months.length) current = m.values[months[months.length - 1]];
      }
    }
    if (k.target == null || current == null) return { current, pct: null };
    const span = k.target - (k.start || 0);
    if (span === 0) return { current, pct: current >= k.target ? 1 : 0 };
    return { current, pct: Math.max(0, Math.min(1, (current - (k.start || 0)) / span)) };
  }

  function normalizeBill(b) {
    const now = new Date().toISOString();
    const str = (v) => (v == null ? '' : String(v));
    const issueDate = validDate(b.issueDate);
    return {
      id: str(b.id) || uid(),
      supplier: str(b.supplier).trim().slice(0, 120),
      number: str(b.number).trim().slice(0, 40),
      description: str(b.description).slice(0, 500),
      amount: num(b.amount) ?? 0,
      issueDate,
      dueDate: validDate(b.dueDate),
      competence: YM_RE.test(b.competence) ? b.competence : issueDate ? issueDate.slice(0, 7) : toDateKey(new Date()).slice(0, 7),
      nfOk: !!b.nfOk,
      xmlOk: !!b.xmlOk,
      sentAt: validDate(b.sentAt),
      scheduledFor: validDate(b.scheduledFor),
      paidAt: validDate(b.paidAt),
      link: str(b.link).slice(0, 600),
      notes: str(b.notes).slice(0, 1000),
      createdAt: b.createdAt || now,
      updatedAt: b.updatedAt || now,
    };
  }

  const BILL_STAGES = [
    { id: 'docs', name: 'Faltam documentos' },
    { id: 'ready', name: 'Pronta para enviar' },
    { id: 'sent', name: 'Enviada ao financeiro' },
    { id: 'scheduled', name: 'Pagamento agendado' },
    { id: 'paid', name: 'Paga' },
  ];
  function billStage(b) {
    if (b.paidAt) return 'paid';
    if (b.scheduledFor) return 'scheduled';
    if (b.sentAt) return 'sent';
    if (b.nfOk && b.xmlOk) return 'ready';
    return 'docs';
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
    pad, toDateKey, fromDateKey, addDays, toMin, uid, weekStart,
    normalizeTask, classify, sortTasks, buildDigest,
    inWindow, isReminderDue, nextReminderAt,
    PILLARS, PILLAR_MAP, UNITS, kpiCatalog, normalizeMetric, normalizeOkr, normalizeBill,
    quarterOf, quarterElapsed, krProgress, BILL_STAGES, billStage,
    idb,
  };
})(typeof self !== 'undefined' ? self : this);
