// Supabase Edge Function: api — Central de Tarefas v4
//
// Todas as chamadas são POST com JSON { action, ... }.
// O código da central (que vai no link) funciona como chave de acesso.
// Se a central tiver PIN, as chamadas também precisam enviar { pin }.
//
// Segredos (Edge Functions > Secrets no painel, nunca no GitHub):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
//   ANTHROPIC_API_KEY  (para as funções de IA)
// Opcionais: AI_MODEL (padrão claude-haiku-4-5-20251001), AI_DAILY_LIMIT (padrão 60 usos por central por dia),
//   AI_ASSISTANT_MODEL (assistente; padrão claude-sonnet-4-5), AI_RADAR_MODEL (radar; padrão = AI_MODEL)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY");
const CRON_SECRET = env("CRON_SECRET");
const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const AI_MODEL = env("AI_MODEL") || "claude-haiku-4-5-20251001";
const AI_BASE = env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com";
const AI_DAILY_LIMIT = Number(env("AI_DAILY_LIMIT")) || 60;
const AI_ASSISTANT_MODEL = env("AI_ASSISTANT_MODEL") || "claude-sonnet-4-5";
const AI_RADAR_MODEL = env("AI_RADAR_MODEL") || AI_MODEL;
const SERVER_VERSION = 4;
const SERVER_BUILD = "5.1.0"; // aumente a cada mudança no servidor (o GitHub Actions usa para saber se precisa publicar)
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const FEATURES = ["b2c", "bills", "radar", "assistant"];
const PUSH_READY = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (PUSH_READY) webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:voce@exemplo.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string, public code = "") {
    super(message);
  }
}

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SETTINGS = {
  notificationsEnabled: true, frequencyHours: 2, startTime: "08:00", endTime: "20:00",
  dailySummary: true, dailySummaryTime: "08:00",
  radarEnabled: false, radarFrequencyHours: 0, radarTimes: ["09:00", "15:00"], radarOrgs: [] as string[], context: "",
  billsReminder: true, monthCloseDay: 5, weeklyReview: true, aiBriefing: true,
};
type Settings = typeof DEFAULT_SETTINGS;
const COLLECTIONS: Record<string, { table: string; maxSize: number }> = {
  tasks: { table: "tasks", maxSize: 60000 },
  notes: { table: "notes", maxSize: 200000 },
  metrics: { table: "metrics", maxSize: 60000 },
  okrs: { table: "okrs", maxSize: 60000 },
  bills: { table: "bills", maxSize: 30000 },
  campaigns: { table: "campaigns", maxSize: 30000 },
  posts: { table: "posts", maxSize: 30000 },
  crew: { table: "crew", maxSize: 20000 },
};
const ALL_TABLES = ["tasks", "notes", "metrics", "okrs", "bills", "campaigns", "posts", "crew", "radar", "devices", "ai_usage"];

function newId(len = 24) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => chars[b % chars.length]).join("");
}

function cleanName(v: unknown) {
  const s = String(v ?? "").trim().slice(0, 80);
  if (!s) throw new HttpError(400, "Dê um nome para a central.");
  return s;
}

function cleanAreas(v: unknown) {
  if (!Array.isArray(v) || v.length === 0) throw new HttpError(400, "Cadastre pelo menos uma área.");
  if (v.length > 20) throw new HttpError(400, "Use no máximo 20 áreas.");
  const seen = new Set<string>();
  return v.map((a: any) => {
    const id = String(a?.id ?? "").slice(0, 40);
    const name = String(a?.name ?? "").trim().slice(0, 40);
    const color = /^#[0-9a-fA-F]{6}$/.test(a?.color) ? a.color : "#8A92A3";
    if (!id || !name || seen.has(id)) throw new HttpError(400, "Lista de áreas inválida.");
    seen.add(id);
    return { id, name, color };
  });
}

function cleanPeople(v: unknown) {
  if (!Array.isArray(v)) throw new HttpError(400, "Lista de pessoas inválida.");
  if (v.length > 50) throw new HttpError(400, "Use no máximo 50 pessoas.");
  return v
    .map((p: any) => ({ id: String(p?.id ?? "").slice(0, 40), name: String(p?.name ?? "").trim().slice(0, 60) }))
    .filter((p) => p.id && p.name);
}

function cleanSettings(v: any, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = { ...DEFAULT_SETTINGS, ...base };
  if (v && typeof v === "object") {
    if (typeof v.notificationsEnabled === "boolean") s.notificationsEnabled = v.notificationsEnabled;
    if ([1, 2, 3, 4, 6].includes(Number(v.frequencyHours))) s.frequencyHours = Number(v.frequencyHours);
    if (TIME_RE.test(v.startTime ?? "")) s.startTime = v.startTime;
    if (TIME_RE.test(v.endTime ?? "")) s.endTime = v.endTime;
    if (typeof v.dailySummary === "boolean") s.dailySummary = v.dailySummary;
    if (TIME_RE.test(v.dailySummaryTime ?? "")) s.dailySummaryTime = v.dailySummaryTime;
    if (typeof v.radarEnabled === "boolean") s.radarEnabled = v.radarEnabled;
    // 0 = em horários fixos (radarTimes, padrão 9h e 15h); 1 a 6 = a cada N horas
    if ([0, 1, 2, 3, 4, 6].includes(Number(v.radarFrequencyHours))) s.radarFrequencyHours = Number(v.radarFrequencyHours);
    if (Array.isArray(v.radarTimes)) {
      const t = [...new Set(v.radarTimes.filter((x: unknown) => TIME_RE.test(String(x))))].sort().slice(0, 4) as string[];
      if (t.length) s.radarTimes = t;
    }
    if (typeof v.weeklyReview === "boolean") s.weeklyReview = v.weeklyReview;
    if (typeof v.aiBriefing === "boolean") s.aiBriefing = v.aiBriefing;
    if (Array.isArray(v.radarOrgs)) {
      s.radarOrgs = [...new Set(v.radarOrgs.map((o: unknown) => String(o ?? "").trim().slice(0, 40)).filter(Boolean))].slice(0, 40) as string[];
    }
    if (typeof v.context === "string") s.context = v.context.slice(0, 4000);
    if (typeof v.billsReminder === "boolean") s.billsReminder = v.billsReminder;
    if (Number(v.monthCloseDay) >= 1 && Number(v.monthCloseDay) <= 15) s.monthCloseDay = Math.round(Number(v.monthCloseDay));
  }
  return s;
}

function cleanItem(t: any, maxSize: number) {
  if (!t || typeof t !== "object") throw new HttpError(400, "Item inválido.");
  const id = String(t.id ?? "");
  if (!id || id.length > 64) throw new HttpError(400, "Item sem id.");
  const updatedAt = Date.parse(t.updatedAt);
  if (!updatedAt) throw new HttpError(400, "Item sem data de atualização.");
  if (JSON.stringify(t).length > maxSize) throw new HttpError(400, "Item grande demais.");
  return { id, updated_at: new Date(updatedAt).toISOString(), data: t };
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getCentral(id: unknown, pin?: unknown) {
  if (typeof id !== "string" || !ID_RE.test(id)) throw new HttpError(404, "Central não encontrada.", "not_found");
  const { data, error } = await db.from("centrals").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Central não encontrada.", "not_found");
  if (data.pin_hash) {
    if (!pin) throw new HttpError(401, "Esta central é protegida por PIN.", "pin_required");
    if ((await sha256(`${data.pin_salt}:${pin}`)) !== data.pin_hash) throw new HttpError(401, "PIN incorreto.", "pin_invalid");
  }
  return data;
}

const publicCentral = (c: any) => ({
  id: c.id,
  name: c.name,
  areas: c.areas,
  people: Array.isArray(c.people) ? c.people : [],
  settings: cleanSettings(c.settings),
  hasPin: !!c.pin_hash,
  updatedAt: c.updated_at,
  radar: { lastAt: c.radar_last_at ?? null, lastError: c.radar_last_error ?? null },
});

async function listItems(table: string, centralId: string) {
  const { data, error } = await db.from(table).select("data").eq("central_id", centralId);
  if (error) throw new HttpError(500, error.message);
  return (data ?? []).map((r: any) => r.data);
}

async function applyChanges(table: string, maxSize: number, centralId: string, upserts: any[], deletes: string[]) {
  if (deletes.length) {
    const { error } = await db.from(table).delete().eq("central_id", centralId).in("id", deletes);
    if (error) throw new HttpError(500, error.message);
  }
  if (!upserts.length) return 0;
  const rows = upserts.map((u) => cleanItem(u, maxSize));
  // vence a versão mais recente de cada item (last write wins)
  const { data: existing, error } = await db
    .from(table).select("id, updated_at").eq("central_id", centralId).in("id", rows.map((r) => r.id));
  if (error) throw new HttpError(500, error.message);
  const current = new Map((existing ?? []).map((r: any) => [r.id, Date.parse(r.updated_at)]));
  const fresh = rows
    .filter((r) => !current.has(r.id) || Date.parse(r.updated_at) >= (current.get(r.id) as number))
    .map((r) => ({ ...r, central_id: centralId }));
  if (fresh.length) {
    const { error: upErr } = await db.from(table).upsert(fresh, { onConflict: "central_id,id" });
    if (upErr) throw new HttpError(500, upErr.message);
  }
  return fresh.length;
}

// ----------------------------------------------------------------------------
// Resumos (mesma lógica de js/core.js), no fuso do dispositivo
// ----------------------------------------------------------------------------
const toMin = (hhmm?: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

function localNow(tz: string, at: Date = new Date()): { today: string; minutes: number; weekday: number } {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(at).map((p) => [p.type, p.value]),
    );
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    return { today, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: new Date(today + "T12:00:00Z").getUTCDay() };
  } catch {
    return tz === "America/Sao_Paulo" ? { today: at.toISOString().slice(0, 10), minutes: 0, weekday: at.getUTCDay() } : localNow("America/Sao_Paulo", at);
  }
}

function classify(t: any, today: string, nowMin: number): any {
  if (t.status === "done" || t.deletedAt) return { section: "done", actionable: false };
  if (t.status === "waiting") {
    if (t.followUpDate && t.followUpDate <= today) {
      const late = t.followUpDate < today;
      return { section: late ? "overdue" : "today", followUpDue: true, overdue: late, today: !late, actionable: true };
    }
    return { section: "waiting", actionable: false };
  }
  if (!t.dueDate) return { section: "nodate", actionable: true };
  if (t.dueDate < today) return { section: "overdue", overdue: true, actionable: true };
  if (t.dueDate === today) {
    if (t.dueTime && (toMin(t.dueTime) ?? 0) < nowMin) return { section: "overdue", overdue: true, today: true, actionable: true };
    return { section: "today", today: true, actionable: true };
  }
  return { section: "upcoming", actionable: true };
}

const RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const joinPt = (p: string[]) => (p.length <= 1 ? p.join("") : p.slice(0, -1).join(", ") + " e " + p[p.length - 1]);

function sortItems(items: { t: any; c: any }[]) {
  const key = ({ t, c }: any) => {
    const date = c.followUpDue ? t.followUpDate : t.dueDate;
    const time = c.followUpDue ? "00:00" : t.dueTime || "23:59";
    return [c.overdue ? 0 : 1, t.priority === "urgent" ? 0 : 1, c.today ? 0 : 1, t.priority === "high" ? 0 : 1,
      date ? `${date}T${time}` : "9999", RANK[t.priority] ?? 2];
  };
  return items.map((x) => ({ x, k: key(x) })).sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) {
      if (a.k[i] < b.k[i]) return -1;
      if (a.k[i] > b.k[i]) return 1;
    }
    return 0;
  }).map(({ x }) => x);
}

const topLines = (items: any[]) => sortItems(items).slice(0, 3).map(({ t, c }) => "• " + (c.followUpDue ? "Cobrar retorno: " : "") + t.title);

function buildDigest(tasks: any[], tz: string, centralName: string) {
  const { today, minutes } = localNow(tz);
  const items = tasks.map((t) => ({ t, c: classify(t, today, minutes) })).filter((x) => x.c.actionable);
  if (!items.length) return null;
  const n = { overdue: 0, urgent: 0, today: 0, upcoming: 0, nodate: 0, followups: 0 };
  for (const { t, c } of items) {
    if (c.followUpDue) n.followups++;
    if (c.overdue) n.overdue++;
    else if (t.priority === "urgent") n.urgent++;
    else if (c.today) n.today++;
    else if (c.section === "upcoming") n.upcoming++;
    else n.nodate++;
  }
  const parts: string[] = [];
  if (n.overdue) parts.push(plural(n.overdue, "atrasada", "atrasadas"));
  if (n.urgent) parts.push(plural(n.urgent, "urgente", "urgentes"));
  if (n.today) parts.push(`${n.today} para hoje`);
  if (n.upcoming) parts.push(plural(n.upcoming, "próxima", "próximas"));
  if (n.nodate) parts.push(`${n.nodate} sem prazo`);
  const lines = [`Você ainda possui ${plural(items.length, "demanda aberta", "demandas abertas")}.`, joinPt(parts) + "."];
  if (n.followups) lines.push(plural(n.followups, "retorno para cobrar", "retornos para cobrar") + ".");
  lines.push("", "Principais:", ...topLines(items));
  return {
    title: `${centralName}: tarefas pendentes` + (n.overdue ? `, ${plural(n.overdue, "atrasada", "atrasadas")}` : ""),
    body: lines.join("\n"),
  };
}

function buildDailySummary(tasks: any[], tz: string, centralName: string) {
  const { today, minutes } = localNow(tz);
  const items = tasks.map((t) => ({ t, c: classify(t, today, minutes) })).filter((x) => x.c.actionable);
  const forToday = items.filter((x) => x.c.today || x.c.overdue);
  if (!forToday.length) return null;
  const overdue = forToday.filter((x) => x.c.overdue && !x.c.followUpDue).length;
  const followups = forToday.filter((x) => x.c.followUpDue).length;
  const dueToday = forToday.length - overdue - followups;
  const parts: string[] = [];
  if (dueToday) parts.push(`${dueToday} para hoje`);
  if (overdue) parts.push(plural(overdue, "atrasada", "atrasadas"));
  if (followups) parts.push(plural(followups, "retorno para cobrar", "retornos para cobrar"));
  return {
    title: `${centralName}: seu dia`,
    body: [`Bom dia! Hoje você tem ${joinPt(parts)}.`, "", "Comece por:", ...topLines(forToday)].join("\n"),
  };
}

function inWindow(s: Settings, minutes: number) {
  const a = toMin(s.startTime) ?? 0;
  const b = toMin(s.endTime) ?? 1440;
  if (a === b) return true;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

async function openTasks(centralId: string) {
  return (await listItems("tasks", centralId)).filter((t: any) => t && t.status !== "done" && !t.deletedAt);
}

async function sendPush(device: any, payload: unknown) {
  try {
    await webpush.sendNotification(device.subscription, JSON.stringify(payload), { TTL: 3600 });
    return true;
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await db.from("devices").delete().eq("central_id", device.central_id).eq("endpoint", device.endpoint);
    } else {
      console.error("Falha ao enviar push", err?.statusCode, err?.body ?? err?.message);
    }
    return false;
  }
}

// ----------------------------------------------------------------------------
// IA
// ----------------------------------------------------------------------------
const fold = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const TASK_TOOL = {
  name: "registrar_tarefas",
  description: "Registra as tarefas acionáveis encontradas no texto.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Ação clara e curta, começando com verbo no infinitivo. Máx. 120 caracteres." },
            description: { type: "string", description: "Contexto útil da reunião para executar a tarefa. Vazio se não houver." },
            area: { type: "string", description: "Nome EXATO de uma das áreas existentes. Só use um nome novo e curto se nenhuma área servir." },
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
            status: { type: "string", enum: ["pending", "waiting"], description: "waiting se a tarefa depende de resposta de terceiros." },
            dueDate: { type: "string", description: "Prazo em AAAA-MM-DD, só se foi mencionado. Vazio se não houver prazo." },
            dueTime: { type: "string", description: "Horário HH:MM, só se foi mencionado. Vazio se não houver." },
            owner: { type: "string", description: "Responsável, se foi mencionado. Vazio se for o próprio usuário ou não for dito." },
            waitingFor: { type: "string", description: "Pessoa ou empresa de quem se aguarda retorno. Vazio se não houver." },
            checklist: { type: "array", items: { type: "string" }, description: "Etapas, se a tarefa tiver várias partes claras." },
            funnel: { type: "string", enum: ["awareness", "consideracao", "conversao", "retencao", "advocacy", "operacao"], description: "Etapa do funil de marketing que a tarefa move: awareness (atrair atenção), consideracao (engajar quem conhece), conversao (venda, cadastro, adesão), retencao (renovação, manter cliente), advocacy (indicação, torcida), operacao (bastidor administrativo)." },
          },
          required: ["title", "area", "priority", "status"],
        },
      },
    },
    required: ["tasks"],
  },
};

function systemPrompt(central: any, refDate: string, single: boolean) {
  const d = new Date(refDate + "T12:00:00Z");
  const areas = central.areas.map((a: any) => `- ${a.name}`).join("\n");
  const people = (central.people ?? []).map((p: any) => p.name).join(", ") || "(nenhuma cadastrada)";
  return `Você é o assistente de uma central de tarefas profissionais chamada "${central.name}".
${single ? "Transforme a frase do usuário em exatamente UMA tarefa." : "Leia a anotação de reunião e extraia TODAS as tarefas acionáveis (coisas que alguém precisa fazer depois da reunião)."}

Data de referência: ${refDate} (${WEEKDAYS[d.getUTCDay()]}). Converta prazos relativos ("amanhã", "sexta", "semana que vem", "fim do mês") para datas AAAA-MM-DD a partir dessa data. "Semana que vem" sem dia = segunda-feira seguinte.

Áreas existentes (use o nome exato):
${areas}

Pessoas da equipe: ${people}

Regras:
- Não invente tarefas, prazos ou responsáveis que não estejam no texto.
- Não repita tarefas; junte itens que são a mesma ação.
- Informações, decisões e contexto que não exigem ação não viram tarefa.
- Prioridade: urgent só se o texto indicar urgência ou prazo para hoje/amanhã; high para itens importantes ou com prazo nesta semana; normal no geral; low para itens opcionais.
- Se a tarefa for esperar retorno de alguém, use status "waiting" e preencha waitingFor.
- Escreva em português do Brasil.`;
}

async function checkAiLimit(centralId: string) {
  const day = localNow("America/Sao_Paulo").today;
  const { data } = await db.from("ai_usage").select("count").eq("central_id", centralId).eq("day", day).maybeSingle();
  const count = data?.count ?? 0;
  if (count >= AI_DAILY_LIMIT) throw new HttpError(429, `Limite diário de ${AI_DAILY_LIMIT} usos da IA atingido nesta central. Tente amanhã.`);
  return { day, count };
}

async function callAi(central: any, text: string, refDate: string, single: boolean) {
  if (!ANTHROPIC_API_KEY) throw new HttpError(503, "A IA ainda não foi configurada no servidor (ANTHROPIC_API_KEY).", "ai_not_configured");
  const { day, count } = await checkAiLimit(central.id);
  const res = await fetch(`${AI_BASE}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: single ? 1000 : 4000,
      system: systemPrompt(central, refDate, single),
      tools: [TASK_TOOL],
      tool_choice: { type: "tool", name: TASK_TOOL.name },
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Erro da IA", res.status, detail);
    throw new HttpError(502, res.status === 401 ? "Chave da IA inválida." : "A IA não respondeu agora. Tente de novo em instantes.");
  }
  const out = await res.json();
  await db.from("ai_usage").upsert({ central_id: central.id, day, count: count + 1 }, { onConflict: "central_id,day" });
  const call = (out.content ?? []).find((c: any) => c.type === "tool_use");
  const raw = Array.isArray(call?.input?.tasks) ? call.input.tasks : [];

  const byName = new Map(central.areas.map((a: any) => [fold(a.name), a.id]));
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  return raw
    .map((t: any) => {
      const areaName = str(t.area, 40);
      const areaId = byName.get(fold(areaName)) ?? null;
      const dueDate = DATE_RE.test(t.dueDate ?? "") ? t.dueDate : null;
      return {
        title: str(t.title, 200),
        description: str(t.description, 2000),
        areaId,
        newArea: areaId ? null : areaName || null,
        priority: ["urgent", "high", "normal", "low"].includes(t.priority) ? t.priority : "normal",
        status: t.status === "waiting" ? "waiting" : "pending",
        dueDate,
        dueTime: dueDate && TIME_RE.test(t.dueTime ?? "") ? t.dueTime : null,
        owner: str(t.owner, 60),
        waitingFor: str(t.waitingFor, 80),
        checklist: Array.isArray(t.checklist) ? t.checklist.map((c: unknown) => str(c, 200)).filter(Boolean).slice(0, 20) : [],
        funnel: ["awareness", "consideracao", "conversao", "retencao", "advocacy", "operacao"].includes(t.funnel) ? t.funnel : null,
      };
    })
    .filter((t: any) => t.title);
}

// ----------------------------------------------------------------------------
// v4: visão de dono (contas, indicadores, tarefas paradas)
// ----------------------------------------------------------------------------
const money = (n: number) =>
  "R$ " + (Math.round(n * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const addDaysKey = (key: string, n: number) => {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStartKey = (today: string) => {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const prevMonthKey = (today: string) => {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const monthName = (ym: string) => MONTHS_PT[Number(ym.slice(5, 7)) - 1] ?? ym;

/** Situação de uma NF/conta a pagar. */
function billStage(b: any) {
  if (b.paidAt) return "paid";
  if (b.scheduledFor) return "scheduled";
  if (b.sentAt) return "sent";
  if (b.nfOk && b.xmlOk) return "ready";
  return "docs";
}

/** Alertas de "dono": o que está travando dinheiro, prazo ou rotina. */
function ownerAlerts(tasks: any[], bills: any[], metrics: any[], s: Settings, today: string) {
  const lines: string[] = [];
  let urgent = 0;
  const open = bills.filter((b) => b && !b.paidAt && !b.deletedAt);
  if (s.billsReminder) {
    const overdue = open.filter((b) => b.dueDate && b.dueDate < today);
    const soon = open.filter((b) => b.dueDate && b.dueDate >= today && b.dueDate <= addDaysKey(today, 3) && !b.scheduledFor);
    const sum = (l: any[]) => l.reduce((a, b) => a + (Number(b.amount) || 0), 0);
    if (overdue.length) {
      urgent += overdue.length;
      lines.push(`${plural(overdue.length, "NF vencida", "NFs vencidas")} sem pagamento (${money(sum(overdue))}).`);
    }
    if (soon.length) lines.push(`${plural(soon.length, "NF vence", "NFs vencem")} em até 3 dias sem agendamento com o financeiro (${money(sum(soon))}).`);
    const day = Number(today.slice(8, 10));
    if (day <= (s.monthCloseDay || 5)) {
      const comp = prevMonthKey(today);
      const pending = bills.filter((b) => b && !b.deletedAt && (b.competence || String(b.issueDate || "").slice(0, 7)) === comp && !b.sentAt);
      if (pending.length) {
        const missing = pending.filter((b) => !b.nfOk || !b.xmlOk).length;
        lines.push(`Fechamento de ${monthName(comp)}: ${plural(pending.length, "NF/XML para enviar", "NFs/XMLs para enviar")}` + (missing ? `, ${missing} ainda sem documento.` : "."));
      }
    }
  }
  // Foco da semana (as 3 prioridades que o dono escolheu)
  const monday = weekStartKey(today);
  const focus = tasks.filter((t) => t && !t.deletedAt && t.status !== "done" && t.focusWeek === monday);
  const wd = new Date(today + "T12:00:00Z").getUTCDay();
  if (focus.length) {
    const late = wd >= 3 ? focus.filter((t) => t.status === "pending").length : 0;
    lines.unshift(`Foco da semana: ${plural(focus.length, "prioridade aberta", "prioridades abertas")}` +
      (late ? `, ${late} ainda sem começar (já é ${WEEKDAYS[wd]}).` : `: ${focus.slice(0, 3).map((t) => t.title).join("; ")}.`));
  } else if (wd >= 1 && wd <= 2 && tasks.some((t) => t && t.status !== "done")) {
    lines.unshift("Defina as 3 prioridades da semana (estrela nas tarefas). Dono sem foco vira apagador de incêndio.");
  }
  const stale = tasks.filter((t) => t && !t.deletedAt && (t.status === "pending" || t.status === "doing") &&
    Date.parse(t.updatedAt || t.createdAt || "") < Date.now() - 3 * 86400000);
  if (stale.length) lines.push(`${plural(stale.length, "demanda parada", "demandas paradas")} há mais de 3 dias. Atualize ou conclua.`);
  if (metrics.length && Number(today.slice(8, 10)) <= 10) {
    const comp = prevMonthKey(today);
    const empty = metrics.filter((m) => m && !m.deletedAt && !(m.values && m.values[comp] != null && m.values[comp] !== "")).length;
    if (empty) lines.push(`${plural(empty, "indicador", "indicadores")} de ${monthName(comp)} sem valor lançado no Painel B2C.`);
  }
  return { lines, urgent };
}

// ----------------------------------------------------------------------------
// v4: chamadas à Claude API
// ----------------------------------------------------------------------------
async function anthropic(payload: any, models: string[]) {
  if (!ANTHROPIC_API_KEY) throw new HttpError(503, "A IA ainda não foi configurada no servidor (ANTHROPIC_API_KEY).", "ai_not_configured");
  let last = "";
  for (const model of [...new Set(models.filter(Boolean))]) {
    const res = await fetch(`${AI_BASE}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ ...payload, model }),
    });
    if (res.ok) return await res.json();
    last = await res.text().catch(() => "");
    console.error("Erro da IA", model, res.status, last);
    if (res.status === 401) throw new HttpError(502, "Chave da IA inválida.");
    if (res.status === 429 || res.status >= 500) throw new HttpError(502, "A IA está sobrecarregada agora. Tente de novo em instantes.");
    // 400/404: modelo indisponível ou recurso não suportado; tenta o próximo
  }
  let msg = "A IA não respondeu agora. Tente de novo em instantes.";
  if (/web search/i.test(last) || /web_search/i.test(last)) msg = "A busca na web não está liberada na sua conta da Anthropic (Console > Settings > Privacy > Web search).";
  throw new HttpError(502, msg);
}

async function countAiUse(centralId: string) {
  const { day, count } = await checkAiLimit(centralId);
  await db.from("ai_usage").upsert({ central_id: centralId, day, count: count + 1 }, { onConflict: "central_id,day" });
}

// ----------------------------------------------------------------------------
// v4: Radar de notícias das organizações
// ----------------------------------------------------------------------------
const DEFAULT_ORGS = [
  "T1", "Karmine Corp", "Team Liquid", "100 Thieves", "G2 Esports", "Fnatic", "Team Vitality", "Sentinels",
  "FaZe Clan", "Gen.G", "Cloud9", "NAVI", "Team Falcons", "FURIA", "LOUD", "MIBR", "paiN Gaming", "Vivo Keyd Stars",
  "RED Canids", "Fluxo W7M", "G3X FC", "Kings League Brasil",
];
const RADAR_CATEGORIES = ["Estudo de caso", "PR", "B2C", "Merchan", "Comunidade", "Sócio/Membership", "Patrocínio", "Negócios", "Conteúdo/Creators", "Competitivo", "Eventos", "Outros"];
/** Rodadas mais raras olham mais organizações de uma vez. */
const radarBatch = (s: Settings) => (s.radarFrequencyHours === 0 ? { orgs: 8, searches: 5 } : { orgs: 4, searches: 3 });

/** Hora de rodar o radar? Horários fixos (2x por dia) ou a cada N horas. */
function radarDue(s: Settings, lastAt: string | null, tz: string) {
  const last = lastAt ? Date.parse(lastAt) : 0;
  const { today, minutes } = localNow(tz);
  if (s.radarFrequencyHours > 0) {
    return inWindow(s, minutes) && Date.now() - last >= s.radarFrequencyHours * 3600000 - 10 * 60000;
  }
  const slots = s.radarTimes.map((t) => toMin(t) ?? 0).filter((m) => m <= minutes);
  if (!slots.length) return false;
  const slot = Math.max(...slots);
  if (minutes - slot > 180) return false; // passou muito do horário: espera o próximo
  if (!last) return true;
  const l = localNow(tz, new Date(last));
  return !(l.today === today && l.minutes >= slot - 10);
}

const RADAR_TOOL = {
  name: "registrar_noticias",
  description: "Registra as notícias novas encontradas, já resumidas em português.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            org: { type: "string", description: "Organização principal da notícia (nome curto)." },
            title: { type: "string", description: "Título claro em português, até 120 caracteres." },
            summary: { type: "string", description: "Resumo objetivo em 2 a 3 frases, em português." },
            url: { type: "string", description: "Link da fonte original." },
            source: { type: "string", description: "Nome do veículo ou site." },
            publishedAt: { type: "string", description: "Data de publicação AAAA-MM-DD, se souber." },
            category: { type: "string", enum: RADAR_CATEGORIES },
            relevance: { type: "integer", minimum: 1, maximum: 5, description: "Relevância para a estratégia B2C do usuário (5 = muito relevante)." },
            lesson: { type: "string", description: "Lição prática e específica para a área do usuário: o que copiar, testar ou evitar. 1 a 2 frases." },
          },
          required: ["org", "title", "summary", "url", "category", "relevance", "lesson"],
        },
      },
    },
    required: ["items"],
  },
};

const urlKey = (u: string) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return fold(u).slice(0, 200);
  }
};

async function radarRecent(centralId: string, limit = 150) {
  const { data, error } = await db.from("radar").select("data, created_at").eq("central_id", centralId)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new HttpError(500, error.message);
  return (data ?? []).map((r: any) => ({ ...r.data, createdAt: r.created_at }));
}

async function runRadar(central: any, manual = false) {
  const s = cleanSettings(central.settings);
  const orgs = s.radarOrgs.length ? s.radarOrgs : DEFAULT_ORGS;
  const cursor = Number(central.radar_cursor || 0) % orgs.length;
  const size = radarBatch(s);
  const batch = Array.from({ length: Math.min(size.orgs, orgs.length) }, (_, i) => orgs[(cursor + i) % orgs.length]);
  const today = localNow("America/Sao_Paulo").today;
  const recent = await radarRecent(central.id, 80);
  const seen = recent.map((r: any) => `- ${r.org}: ${r.title}`).slice(0, 60).join("\n") || "(nenhuma ainda)";
  const context = s.context || "Área de B2C (receitas com o torcedor) de uma organização brasileira de esports: comunidade, sócio-torcedor, merchan/e-commerce e CRM.";

  const system = `Você é o analista de inteligência de mercado do usuário. Hoje é ${today}.
Contexto do usuário (use para escrever as lições):
${context}

Tarefa: use a busca na web para encontrar notícias PUBLICADAS NOS ÚLTIMOS 3 DIAS sobre as organizações de esports listadas pelo usuário. Vale qualquer notícia relevante: PR, lançamentos de produtos e coleções, merchan, programas de membros/sócio, comunidade e eventos com fãs, patrocínios, parcerias, resultados financeiros, contratações e resultados competitivos de destaque, conteúdo e creators.
Regras:
- Faça no máximo ${size.searches} buscas, combinando várias organizações por busca quando possível.
- Só registre notícias com fonte real e link encontrado na busca. Nunca invente.
- Ignore notícias antigas e as que já foram registradas (lista abaixo).
- Escreva tudo em português do Brasil.
- Ao final, chame a ferramenta registrar_noticias (lista vazia se não houver nada novo).

Já registradas:
${seen}`;
  const user = `Organizações desta rodada: ${batch.join(", ")}.`;

  const messages: any[] = [{ role: "user", content: user }];
  let items: any[] = [];
  for (let round = 0; round < 4; round++) {
    const out = await anthropic({
      max_tokens: 4000,
      system,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: size.searches, user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" } },
        RADAR_TOOL,
      ],
      messages,
    }, [AI_RADAR_MODEL, "claude-sonnet-4-5"]);
    const call = (out.content ?? []).find((c: any) => c.type === "tool_use" && c.name === RADAR_TOOL.name);
    if (call) {
      items = Array.isArray(call.input?.items) ? call.input.items : [];
      break;
    }
    if (out.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: out.content });
      continue;
    }
    // terminou sem chamar a ferramenta: pede o registro
    messages.push({ role: "assistant", content: out.content });
    messages.push({ role: "user", content: "Agora chame registrar_noticias com o que encontrou (lista vazia se nada for novo)." });
  }

  const known = new Set(recent.map((r: any) => r.urlKey || urlKey(r.url || "")));
  const knownTitles = new Set(recent.map((r: any) => fold(r.title)));
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const fresh: any[] = [];
  for (const it of items) {
    const url = str(it.url, 600);
    if (!/^https?:\/\//.test(url)) continue;
    const key = urlKey(url);
    const title = str(it.title, 200);
    if (!title || known.has(key) || knownTitles.has(fold(title))) continue;
    known.add(key);
    knownTitles.add(fold(title));
    fresh.push({
      id: newId(20),
      org: str(it.org, 60),
      title,
      summary: str(it.summary, 1200),
      url,
      urlKey: key,
      source: str(it.source, 80),
      publishedAt: DATE_RE.test(it.publishedAt ?? "") ? it.publishedAt : null,
      category: RADAR_CATEGORIES.includes(it.category) ? it.category : "Outros",
      relevance: Math.min(5, Math.max(1, Number(it.relevance) || 3)),
      lesson: str(it.lesson, 800),
      starred: false,
      read: false,
    });
  }
  if (fresh.length) {
    const { error } = await db.from("radar").insert(fresh.map((d) => ({ central_id: central.id, id: d.id, url_key: d.urlKey, data: d })));
    if (error) throw new HttpError(500, error.message);
  }
  // mantém só os últimos 90 dias (as salvas ficam)
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  await db.from("radar").delete().eq("central_id", central.id).lt("created_at", cutoff).neq("data->>starred", "true");
  await db.from("centrals").update({
    radar_last_at: new Date().toISOString(), radar_last_error: null, radar_cursor: (cursor + batch.length) % orgs.length,
  }).eq("id", central.id);
  return { added: fresh, orgs: batch, manual };
}

const CASE_TOOL = {
  name: "registrar_estudo",
  description: "Registra o estudo de caso da semana.",
  input_schema: {
    type: "object",
    properties: {
      org: { type: "string", description: "Organização (ou organizações) do caso." },
      title: { type: "string", description: "Título do estudo de caso, até 120 caracteres." },
      summary: { type: "string", description: "O caso em 4 a 6 frases: o que fizeram, por que funcionou, números se houver." },
      lesson: { type: "string", description: "Como aplicar no Fluxo W7M: 3 ações práticas numeradas, cada uma com pilar e primeiro passo." },
    },
    required: ["org", "title", "summary", "lesson"],
  },
};

/** Estudo de caso semanal, feito com as notícias dos últimos 7 dias (sem busca na web). */
async function caseStudy(central: any, manual: boolean) {
  const recent = await radarRecent(central.id, 120);
  const week = recent.filter((r: any) => Date.parse(r.createdAt) > Date.now() - 7 * 86400000);
  if (!manual && week.some((r: any) => r.category === "Estudo de caso" && Date.parse(r.createdAt) > Date.now() - 6 * 86400000)) return null;
  const news = week.filter((r: any) => r.category !== "Estudo de caso").sort((a: any, b: any) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.relevance - a.relevance).slice(0, 25);
  if (news.length < 2) {
    if (manual) throw new HttpError(400, "O radar ainda não juntou notícias suficientes nesta semana. Rode uma busca antes.");
    return null;
  }
  const s = cleanSettings(central.settings);
  const out = await anthropic({
    max_tokens: 2000,
    system: `Você é consultor de estratégia de esports. Escolha, entre as notícias da semana, o caso MAIS útil para a área do usuário e escreva um estudo de caso prático em português do Brasil. Use só os fatos das notícias; conhecimento geral só como contexto, deixando claro.
Contexto do usuário:
${s.context || "Área B2C de uma organização brasileira de esports."}`,
    tools: [CASE_TOOL],
    tool_choice: { type: "tool", name: CASE_TOOL.name },
    messages: [{ role: "user", content: news.map((n: any) => `- ${n.org}: ${n.title}. ${n.summary} (fonte: ${n.url})`).join("\n") }],
  }, [AI_MODEL]);
  const call = (out.content ?? []).find((c: any) => c.type === "tool_use");
  if (!call?.input?.title) return null;
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const top = news[0];
  const item = {
    id: newId(20), org: str(call.input.org, 60), title: str(call.input.title, 200), summary: str(call.input.summary, 2500),
    url: top?.url ?? "", urlKey: "case:" + newId(8), source: "Estudo de caso da semana", publishedAt: localNow("America/Sao_Paulo").today,
    category: "Estudo de caso", relevance: 5, lesson: str(call.input.lesson, 2500), starred: false, read: false,
  };
  const { error } = await db.from("radar").insert({ central_id: central.id, id: item.id, url_key: item.urlKey, data: item });
  if (error) throw new HttpError(500, error.message);
  return item;
}

function radarPush(central: any, added: any[]) {
  const top = added.slice().sort((a, b) => b.relevance - a.relevance);
  const first = top[0];
  const lines = top.slice(0, 3).map((x) => `• ${x.org}: ${x.title}`);
  if (first?.lesson) lines.push("", "Lição: " + first.lesson);
  return {
    title: `Radar: ${plural(added.length, "novidade", "novidades")} das orgs`,
    body: lines.join("\n"),
    centralId: central.id,
    tag: "radar",
    route: "#/radar",
  };
}

// ----------------------------------------------------------------------------
// v4: Assistente (lê a central inteira e orienta com visão de dono)
// ----------------------------------------------------------------------------
const STATUS_PT: Record<string, string> = { pending: "pendente", doing: "em andamento", waiting: "aguardando retorno", done: "concluída" };
const PRIO_PT: Record<string, string> = { urgent: "urgente", high: "alta", normal: "normal", low: "baixa" };
const PILLAR_PT: Record<string, string> = { geral: "Geral", comunidade: "Comunidade", socio: "Sócio-Torcedor", merchan: "Merchan", crm: "CRM", inferno: "Inferno Roxo", kings: "Kings League" };

function fmtMetric(m: any, v: any) {
  if (v == null || v === "") return "sem valor";
  const n = Number(v);
  if (m.unit === "currency") return money(n);
  if (m.unit === "percent") return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

async function assistantContext(central: any) {
  const s = cleanSettings(central.settings);
  const { today, minutes } = localNow("America/Sao_Paulo");
  const [tasks, metrics, okrs, bills, radar, campaigns] = await Promise.all([
    listItems("tasks", central.id), listItems("metrics", central.id), listItems("okrs", central.id),
    listItems("bills", central.id), radarRecent(central.id, 25), listItems("campaigns", central.id),
  ]);
  const pct = (a: number, b: number) => (b ? ((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "–");
  const campLines = campaigns.filter((c: any) => c && !c.deletedAt).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, 15)
    .map((c: any) => `- ${c.date} "${c.name}"${c.subject ? ` (assunto: ${c.subject})` : ""}: entregues ${c.delivered}, abertura ${pct(c.opens, c.delivered)}, clique ${pct(c.clicks, c.delivered)}, descadastros ${c.unsubs ?? 0}` + (c.revenue ? `, receita ${money(Number(c.revenue))}` : ""));
  const areaName = new Map(central.areas.map((a: any) => [a.id, a.name]));
  const live = tasks.filter((t: any) => t && !t.deletedAt);
  const open = sortItems(live.filter((t: any) => t.status !== "done").map((t: any) => ({ t, c: classify(t, today, minutes) })));
  const taskLine = ({ t, c }: any) => {
    const bits = [areaName.get(t.area) ?? "", STATUS_PT[t.status] ?? t.status, "prioridade " + (PRIO_PT[t.priority] ?? t.priority)];
    if (t.dueDate) bits.push("prazo " + t.dueDate + (t.dueTime ? " " + t.dueTime : ""));
    if (c.overdue) bits.push("ATRASADA");
    if (t.waitingFor) bits.push("aguardando " + t.waitingFor + (t.followUpDate ? " (cobrar em " + t.followUpDate + ")" : ""));
    if (t.owner) bits.push("resp. " + t.owner);
    if (t.focusWeek === weekStartKey(today)) bits.push("★ FOCO DA SEMANA");
    if (t.funnel) bits.push("funil: " + t.funnel);
    const upd = Math.floor((Date.now() - Date.parse(t.updatedAt || t.createdAt)) / 86400000);
    if (upd >= 3) bits.push(`sem atualização há ${upd} dias`);
    const ck = Array.isArray(t.checklist) && t.checklist.length ? ` [checklist ${t.checklist.filter((x: any) => x.done).length}/${t.checklist.length}]` : "";
    return `- ${t.title}${ck} (${bits.filter(Boolean).join(", ")})`;
  };
  const done7 = live.filter((t: any) => t.status === "done" && t.completedAt && Date.parse(t.completedAt) > Date.now() - 7 * 86400000);

  const comp = today.slice(0, 7);
  const prev = prevMonthKey(today);
  const metricLines = metrics.filter((m: any) => m && !m.deletedAt).map((m: any) => {
    const v = m.values?.[comp] ?? m.values?.[prev];
    const which = m.values?.[comp] != null ? comp : prev;
    return `- [${PILLAR_PT[m.pillar] ?? m.pillar}] ${m.name}: ${fmtMetric(m, v)} em ${which}` + (m.target != null && m.target !== "" ? `, meta ${fmtMetric(m, m.target)}` : "") + (m.direction === "down" ? " (quanto menor, melhor)" : "");
  });
  const okrLines = okrs.filter((o: any) => o && !o.deletedAt).flatMap((o: any) => [
    `- ${o.quarter} [${PILLAR_PT[o.pillar] ?? o.pillar}] Objetivo: ${o.objective}`,
    ...(o.krs ?? []).map((k: any) => `   • KR: ${k.text} — atual ${k.current ?? "?"} / meta ${k.target ?? "?"} (início ${k.start ?? 0})`),
  ]);
  const billLines = bills.filter((b: any) => b && !b.deletedAt && !b.paidAt).map((b: any) =>
    `- ${b.supplier || "Fornecedor"} NF ${b.number || "s/n"}: ${money(Number(b.amount) || 0)}, vence ${b.dueDate || "?"}, etapa ${billStage(b)}` +
    `${b.nfOk ? "" : ", sem NF"}${b.xmlOk ? "" : ", sem XML"}${b.scheduledFor ? ", agendada " + b.scheduledFor : ""}`);
  const alerts = ownerAlerts(live, bills, metrics, s, today);
  const radarLines = radar.slice(0, 20).map((r: any) => `- ${r.createdAt?.slice(0, 10)} ${r.org}: ${r.title}. Lição: ${r.lesson}`);

  return `Hoje: ${today} (${WEEKDAYS[new Date(today + "T12:00:00Z").getUTCDay()]}), ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} em Brasília.
Central: ${central.name}. Áreas: ${central.areas.map((a: any) => a.name).join(", ")}.

## Contexto estratégico do usuário
${s.context || "(não preenchido)"}

## Alertas de dono
${alerts.lines.map((l) => "- " + l).join("\n") || "- nenhum"}

## Demandas abertas (${open.length}, em ordem de prioridade)
${open.slice(0, 70).map(taskLine).join("\n") || "- nenhuma"}

## Concluídas nos últimos 7 dias (${done7.length})
${done7.slice(0, 25).map((t: any) => "- " + t.title).join("\n") || "- nenhuma"}

## Indicadores do Painel B2C
${metricLines.join("\n") || "- nenhum cadastrado"}

## OKRs
${okrLines.join("\n") || "- nenhum cadastrado"}

## NFs e contas a pagar do Merchan (em aberto)
${billLines.join("\n") || "- nenhuma"}

## Campanhas de e-mail e newsletter (RD Station)
${campLines.join("\n") || "- nenhuma registrada"}
Referência do setor esportivo: cerca de 22% de abertura e 3% de clique.

## Radar recente das organizações
${radarLines.join("\n") || "- nada ainda"}`;
}

const SUGGEST_TOOL = {
  name: "sugerir_tarefas",
  description: "Sugere tarefas concretas para o usuário adicionar à central. Use só quando o usuário pedir um plano, próximos passos ou quando houver ações claras a registrar.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Ação curta começando com verbo." },
            area: { type: "string", description: "Nome exato de uma área existente." },
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
            dueDate: { type: "string", description: "AAAA-MM-DD ou vazio." },
            description: { type: "string" },
          },
          required: ["title", "area", "priority"],
        },
      },
    },
    required: ["tasks"],
  },
};

function assistantSystem(contextText: string) {
  return `Você é o assistente pessoal e "sócio-dono" do usuário dentro da Central de Tarefas dele. Pense como o dono da empresa: foco em receita, prioridades, prazos e execução.
Seu papel:
- Cobrar com firmeza e respeito: aponte o que está atrasado, parado ou sem dono, e diga o que fazer primeiro.
- Dar direcionamento estratégico para a área B2C, conectando demandas, indicadores, OKRs, financeiro e o radar das organizações de referência (T1, Karmine Corp, Team Liquid, 100 Thieves, FURIA, LOUD, MIBR etc.).
- Ensinar: quando fizer sentido, explique o porquê com exemplos de mercado, para o usuário evoluir como gestor.
Repertório de dono (use quando ajudar a decidir, citando a referência):
- Esports: T1 (fandom no modelo K-pop, ídolos como IP e merchan assinado), Karmine Corp (comunidade com cultura de torcida e eventos próprios que lotam arenas), Team Liquid (programa de fidelidade com pontos e dados do fã), 100 Thieves (merchan como marca de lifestyle e drops com escassez), G2 (tom de voz e conteúdo), FaZe Clan (alerta: hype e creators sem governança e sem caixa quebram a empresa), FURIA (marca lifestyle e experiências presenciais), LOUD (crescimento por creators e conteúdo), MIBR (tradição e nostalgia).
- Torcidas e comunidades: Blue Wall da Karmine Corp (cultura de ultras no esport), Dezorganizada Furiosa da FURIA (movimento orgânico, cultura brasileira, levou mais de 130 torcedores a um Major em Budapeste), Tribo do Gaules e G3X FC (comunidade de creator virou time da Kings League, patrocínio integrado à live, financiamento coletivo do CT), núcleos oficiais "penyes" do Barcelona (torcida regional reconhecida pelo clube).
- Kings League: a liga vive principalmente de patrocínio; o clube precisa capturar o fã com cadastro, caravana, ingresso, merchan dos presidentes, sócio e cupons de creator. O Fluxo FC tem Cerol, Nobru e Toguro como presidentes.
- Inferno Roxo (torcida do Fluxo W7M): crescer de baixo para cima (conselho de lideranças eleito, votação da identidade, código de conduta), com escada de produto: membro grátis, plano no sócio, núcleos, linha da torcida, caravanas e patrocínio da torcida.
- Sócio e fidelidade: Team Liquid MyBlue/Liquid+ (missões, pontos e recompensas: camisas autografadas, desconto na loja, acesso a jogadores, viagens), Torcedor Premiado de Flamengo e Santos (R$ 1,99 no primeiro mês e bônus por gol), paiN Gaming (pioneira no sócio de esports), Palmeiras Avanti (sócios fora da cidade com benefícios digitais), Fortaleza (rede de parceiros com economia comunicada ao sócio), Segue o FX do próprio Fluxo W7M (viagem para a EWC).
- Marca pessoal do usuário: ele quer ser mais relevante no mercado de esports postando no LinkedIn, Instagram e X sobre o trabalho dele (bastidores do B2C, estudos de caso, opinião de mercado, carreira e gestão). Ao escrever posts: voz em primeira pessoa, humana e específica, com aprendizado concreto; LinkedIn com gancho na 1ª linha, parágrafos curtos e pergunta no fim; Instagram com roteiro de reels ou carrossel e legenda curta; X curto e direto, com thread quando precisar. Nunca exponha números internos, contratos ou patrocinadores sem aprovação: sugira a versão segura.
- CRM e newsletter: Tottenham (série de boas-vindas aumentou engajamento e receita da loja), Voetbal International (newsletter por time preferido: +55% abertura, +150% cliques), NHL (resumo automático pós-jogo: +53% abertura), FA (assunto personalizado pelo time), Team GB (horário ideal por fã). Referência do setor esportivo: cerca de 22% de abertura e 3% de clique. Regra do usuário: seções da newsletter nunca repetem assuntos parecidos.
- Esporte tradicional: programas de sócio do Real Madrid, Barcelona e Flamengo (benefícios exclusivos, escada de planos, acesso e pertencimento), NBA e NFL (produto digital para o fã e dados próprios), Manchester City/City Football Group (gestão por indicadores).
- Gestão: Amazon (revisão semanal de métricas com dono para cada número e foco no cliente), EOS/Traction (scorecard semanal e 3 a 5 prioridades por trimestre), OKRs do Google e da Intel, Disney (flywheel: a IP alimenta conteúdo, produto e experiência), Netflix (decisões rápidas com contexto, não controle).
Regras de cobrança: atrasado há 2 dias ou mais vira prioridade ou é renegociado hoje; tarefa sem dono ou sem prazo não existe; dinheiro travado (NF vencida, pagamento sem agendamento, receita parada) vem antes de tarefa interna; toda semana precisa de no máximo 3 prioridades (foco da semana).
O usuário está desenvolvendo a visão de marketing e a comunicação executiva: sempre que usar um termo de marketing em inglês ou técnico (awareness, churn, CAC, LTV, CTR, funil, posicionamento...), explique entre parênteses em português simples na primeira vez. Quando fizer sentido, sugira como ele pode falar aquilo numa reunião de diretoria.
Estilo: português do Brasil, direto, frases curtas, listas curtas quando ajudar. Sem enrolação e sem bajulação. Se faltar dado, diga qual dado falta e como conseguir.
Use apenas os dados abaixo sobre a central; não invente números. Conhecimento geral de mercado pode ser usado, deixando claro que é referência geral.
Visão de marketing: classifique as ações pelo funil (atenção/awareness, consideração, conversão, retenção, indicação/advocacy) e aponte quando o esforço está desequilibrado, por exemplo muita operação e pouca conversão. Toda ação de topo de funil precisa levar a um cadastro no CRM.
Quando houver ações claras, chame sugerir_tarefas (o usuário revisa antes de criar).

# Dados atuais da central
${contextText}`;
}

// ----------------------------------------------------------------------------
// v4: rodadas do radar (chamadas pelo agendador)
// ----------------------------------------------------------------------------
async function runDueRadars(force: boolean) {
  const { data: centrals, error } = await db.from("centrals").select("*");
  if (error) throw new HttpError(500, error.message);
  const started = Date.now();
  const report: any[] = [];
  for (const c of centrals ?? []) {
    const s = cleanSettings(c.settings);
    if (!s.radarEnabled) continue;
    if (Date.now() - started > 100000) break; // limite de tempo da função
    const { data: devs } = await db.from("devices").select("*").eq("central_id", c.id);
    const tz = devs?.[0]?.timezone || "America/Sao_Paulo";
    if (!force && !radarDue(s, c.radar_last_at, tz)) continue;
    // marca o início para outra chamada simultânea não repetir a rodada
    await db.from("centrals").update({ radar_last_at: new Date().toISOString() }).eq("id", c.id);
    try {
      const r = await runRadar(c);
      if (localNow(tz).weekday === 1) {
        const cs = await caseStudy(c, false).catch((err) => (console.error("Estudo de caso", err?.message), null));
        if (cs) r.added.unshift(cs);
      }
      let sent = 0;
      const relevant = r.added.filter((x) => x.relevance >= 3);
      if (PUSH_READY && relevant.length && s.notificationsEnabled) {
        for (const d of devs ?? []) if (await sendPush(d, radarPush(c, relevant))) sent++;
      }
      report.push({ central: c.id.slice(0, 4), added: r.added.length, sent });
    } catch (err: any) {
      console.error("Radar", c.id, err?.message ?? err);
      await db.from("centrals").update({ radar_last_error: String(err?.message ?? err).slice(0, 300) }).eq("id", c.id);
      report.push({ central: c.id.slice(0, 4), error: String(err?.message ?? err).slice(0, 120) });
    }
  }
  return report;
}

/** Briefing da manhã escrito pela IA (curto, para caber na notificação). */
async function aiBriefing(central: any) {
  const out = await anthropic({
    max_tokens: 500,
    system: assistantSystem(await assistantContext(central)),
    messages: [{
      role: "user",
      content: "Escreva o briefing da manhã para uma notificação de celular, em no máximo 550 caracteres, sem markdown: comece com uma frase de cobrança do dono, depois as 3 prioridades de hoje numeradas (1. 2. 3.) e termine com uma dica curta de marketing inspirada em uma organização de referência, explicando em português simples o termo técnico que usar (ex.: retenção, awareness, conversão).",
    }],
  }, [AI_MODEL]);
  const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  return text ? text.replace(/\*\*/g, "").slice(0, 900) : null;
}

// ----------------------------------------------------------------------------
// Ações
// ----------------------------------------------------------------------------
async function handle(body: any, req: Request) {
  switch (body.action) {
    case "config":
      return { vapidPublicKey: PUSH_READY ? VAPID_PUBLIC_KEY : null, ai: !!ANTHROPIC_API_KEY, version: SERVER_VERSION, build: SERVER_BUILD, features: FEATURES };

    case "create": {
      const now = new Date().toISOString();
      const row = {
        id: newId(), name: cleanName(body.name), areas: cleanAreas(body.areas),
        people: body.people ? cleanPeople(body.people) : [],
        settings: cleanSettings(body.settings), created_at: now, updated_at: now,
      };
      const { error } = await db.from("centrals").insert(row);
      if (error) throw new HttpError(500, error.message);
      return { central: publicCentral(row) };
    }

    case "get": {
      const central = await getCentral(body.centralId, body.pin);
      return {
        central: publicCentral(central),
        tasks: await listItems("tasks", central.id),
        notes: await listItems("notes", central.id),
        metrics: await listItems("metrics", central.id),
        okrs: await listItems("okrs", central.id),
        bills: await listItems("bills", central.id),
        campaigns: await listItems("campaigns", central.id),
        posts: await listItems("posts", central.id),
        crew: await listItems("crew", central.id),
        version: SERVER_VERSION,
      };
    }

    case "updateCentral": {
      const central = await getCentral(body.centralId, body.pin);
      const patch = body.patch ?? {};
      const next: any = { updated_at: new Date().toISOString() };
      if ("name" in patch) next.name = cleanName(patch.name);
      if ("areas" in patch) next.areas = cleanAreas(patch.areas);
      if ("people" in patch) next.people = cleanPeople(patch.people);
      if ("settings" in patch) next.settings = cleanSettings(patch.settings, cleanSettings(central.settings));
      const { error } = await db.from("centrals").update(next).eq("id", central.id);
      if (error) throw new HttpError(500, error.message);
      return { central: publicCentral({ ...central, ...next }) };
    }

    case "sync": {
      // { changes: { tasks: { upserts, deletes }, notes: { upserts, deletes } } }
      const central = await getCentral(body.centralId, body.pin);
      const changes = body.changes ?? { tasks: { upserts: body.upserts ?? [], deletes: body.deletes ?? [] } };
      const result: Record<string, number> = {};
      let total = 0;
      for (const [name, cfg] of Object.entries(COLLECTIONS)) {
        const c = changes[name];
        if (!c) continue;
        const ups = Array.isArray(c.upserts) ? c.upserts : [];
        const dels = Array.isArray(c.deletes) ? c.deletes.map(String) : [];
        total += ups.length + dels.length;
        if (total > 2000) throw new HttpError(400, "Alterações demais de uma vez.");
        result[name] = await applyChanges(cfg.table, cfg.maxSize, central.id, ups, dels);
      }
      return { ok: true, applied: result, version: SERVER_VERSION };
    }

    case "replaceData": {
      // Importação de backup: substitui tarefas e notas da central.
      const central = await getCentral(body.centralId, body.pin);
      for (const [name, cfg] of Object.entries(COLLECTIONS)) {
        if (!Array.isArray(body[name])) continue; // só substitui o que veio no backup
        const rows = body[name].slice(0, 5000).map((t: any) => cleanItem(t, cfg.maxSize));
        const { error: delErr } = await db.from(cfg.table).delete().eq("central_id", central.id);
        if (delErr) throw new HttpError(500, delErr.message);
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await db.from(cfg.table).insert(rows.slice(i, i + 500).map((r: any) => ({ ...r, central_id: central.id })));
          if (error) throw new HttpError(500, error.message);
        }
      }
      return { ok: true };
    }

    case "setPin": {
      const central = await getCentral(body.centralId, body.pin);
      const newPin = String(body.newPin ?? "");
      let next: any;
      if (!newPin) next = { pin_salt: null, pin_hash: null };
      else {
        if (!/^\d{4,12}$/.test(newPin)) throw new HttpError(400, "O PIN deve ter de 4 a 12 números.");
        const salt = newId(16);
        next = { pin_salt: salt, pin_hash: await sha256(`${salt}:${newPin}`) };
      }
      const { error } = await db.from("centrals").update({ ...next, updated_at: new Date().toISOString() }).eq("id", central.id);
      if (error) throw new HttpError(500, error.message);
      return { ok: true, hasPin: !!newPin };
    }

    case "rotateId": {
      // Gera um link novo: o link antigo deixa de funcionar.
      const central = await getCentral(body.centralId, body.pin);
      const id = newId();
      const { error: insErr } = await db.from("centrals").insert({ ...central, id, updated_at: new Date().toISOString() });
      if (insErr) throw new HttpError(500, insErr.message);
      for (const table of ALL_TABLES) {
        const { error } = await db.from(table).update({ central_id: id }).eq("central_id", central.id);
        if (error) throw new HttpError(500, error.message);
      }
      const { error: delErr } = await db.from("centrals").delete().eq("id", central.id);
      if (delErr) throw new HttpError(500, delErr.message);
      return { central: publicCentral({ ...central, id }) };
    }

    case "aiExtract": {
      const central = await getCentral(body.centralId, body.pin);
      const text = String(body.text ?? "").trim();
      if (text.length < 10) throw new HttpError(400, "Escreva a anotação antes de gerar as tarefas.");
      if (text.length > 60000) throw new HttpError(400, "Anotação grande demais. Divida em notas menores.");
      const refDate = DATE_RE.test(body.date ?? "") ? body.date : localNow("America/Sao_Paulo").today;
      const header = [body.title ? `Reunião: ${String(body.title).slice(0, 200)}` : "", body.participants ? `Participantes: ${String(body.participants).slice(0, 500)}` : ""]
        .filter(Boolean).join("\n");
      return { tasks: await callAi(central, (header ? header + "\n\n" : "") + text, refDate, false) };
    }

    case "aiQuick": {
      const central = await getCentral(body.centralId, body.pin);
      const text = String(body.text ?? "").trim().slice(0, 1000);
      if (!text) throw new HttpError(400, "Escreva a tarefa.");
      const refDate = DATE_RE.test(body.date ?? "") ? body.date : localNow("America/Sao_Paulo").today;
      const tasks = await callAi(central, text, refDate, true);
      return { task: tasks[0] ?? null };
    }

    case "subscribe": {
      const central = await getCentral(body.centralId, body.pin);
      const sub = body.subscription;
      if (!sub?.endpoint || !sub?.keys) throw new HttpError(400, "Assinatura de push inválida.");
      const { error } = await db.from("devices").upsert({
        central_id: central.id, endpoint: sub.endpoint, subscription: sub,
        timezone: String(body.timezone || "America/Sao_Paulo").slice(0, 64),
        last_sent_at: new Date().toISOString(),
      }, { onConflict: "central_id,endpoint" });
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }

    case "unsubscribe": {
      const central = await getCentral(body.centralId, body.pin);
      await db.from("devices").delete().eq("central_id", central.id).eq("endpoint", String(body.endpoint ?? ""));
      return { ok: true };
    }

    case "testPush": {
      if (!PUSH_READY) throw new HttpError(503, "Chaves de notificação não configuradas no servidor.");
      const central = await getCentral(body.centralId, body.pin);
      const { data: device } = await db.from("devices").select("*")
        .eq("central_id", central.id).eq("endpoint", String(body.endpoint ?? "")).maybeSingle();
      if (!device) throw new HttpError(404, "Este dispositivo não está cadastrado. Ative as notificações de novo.");
      const digest = buildDigest(await openTasks(central.id), device.timezone, central.name);
      const ok = await sendPush(device, {
        ...(digest ?? { title: `${central.name}: tudo em dia`, body: "Notificações funcionando. Nenhuma demanda depende de você agora." }),
        centralId: central.id,
      });
      if (!ok) throw new HttpError(502, "O serviço de push recusou o envio. Ative as notificações de novo.");
      return { ok: true };
    }

    case "send": {
      if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) throw new HttpError(401, "Não autorizado.");
      // o radar roda em segundo plano, sem atrasar os lembretes
      const radarJob = runDueRadars(false).catch((err) => console.error("Radar", err?.message ?? err));
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(radarJob);
      else await radarJob;
      if (!PUSH_READY) return { ok: true, sent: 0, note: "VAPID não configurado" };
      const { data: devices, error } = await db.from("devices").select("*");
      if (error) throw new HttpError(500, error.message);
      if (!devices?.length) return { ok: true, sent: 0 };
      const ids = [...new Set(devices.map((d: any) => d.central_id))];
      const { data: centrals, error: cErr } = await db.from("centrals").select("*").in("id", ids);
      if (cErr) throw new HttpError(500, cErr.message);
      const byId = new Map((centrals ?? []).map((c: any) => [c.id, c]));
      const cache = new Map<string, any[]>();
      const tasksOf = async (id: string) => {
        if (!cache.has(id)) cache.set(id, await openTasks(id));
        return cache.get(id)!;
      };
      const briefings = new Map<string, string | null>();
      const extras = new Map<string, { bills: any[]; metrics: any[] }>();
      const extrasOf = async (id: string) => {
        if (!extras.has(id)) extras.set(id, { bills: await listItems("bills", id), metrics: await listItems("metrics", id) });
        return extras.get(id)!;
      };
      // junta o resumo das tarefas com os alertas de dono (NFs, fechamento do mês, KPIs, demandas paradas)
      const withAlerts = async (base: { title: string; body: string } | null, c: any, s: Settings, tz: string) => {
        const { today } = localNow(tz);
        const ex = await extrasOf(c.id);
        const a = ownerAlerts(await tasksOf(c.id), ex.bills, ex.metrics, s, today);
        if (!a.lines.length) return base;
        const block = ["", "Cobrança do dono:", ...a.lines.map((l) => "• " + l)].join("\n");
        if (base) return { ...base, body: base.body + "\n" + block };
        return { title: `${c.name}: cobrança do dono`, body: block.trim(), route: a.lines.some((l) => /NF/.test(l)) ? "#/financeiro" : "" };
      };
      const weeklyReview = async (c: any, s: Settings, tz: string) => {
        const { today } = localNow(tz);
        const all = (await listItems("tasks", c.id)).filter((t: any) => t && !t.deletedAt);
        const weekAgo = Date.now() - 7 * 86400000;
        const done = all.filter((t: any) => t.status === "done" && t.completedAt && Date.parse(t.completedAt) > weekAgo).length;
        const created = all.filter((t: any) => Date.parse(t.createdAt) > weekAgo).length;
        const open = all.filter((t: any) => t.status !== "done");
        const late = open.filter((t: any) => t.dueDate && t.dueDate < today).length;
        const ex = await extrasOf(c.id);
        const nextWeek = ex.bills.filter((b: any) => b && !b.paidAt && b.dueDate && b.dueDate > today && b.dueDate <= addDaysKey(today, 7));
        const lines = [
          `Semana: ${plural(done, "demanda concluída", "demandas concluídas")} e ${plural(created, "criada", "criadas")}.`,
          `Em aberto: ${open.length}` + (late ? `, ${plural(late, "atrasada", "atrasadas")}.` : "."),
        ];
        if (nextWeek.length) lines.push(`Próxima semana: ${plural(nextWeek.length, "NF vence", "NFs vencem")} (${money(nextWeek.reduce((a: number, b: any) => a + (Number(b.amount) || 0), 0))}).`);
        lines.push("", "Antes de sair: feche o que der, atualize o status do resto e defina as 3 prioridades de segunda. Peça o plano no Assistente.");
        return { title: `${c.name}: revisão da semana`, body: lines.join("\n"), route: "#/assistente" };
      };

      let sent = 0;
      for (const d of devices) {
        const c = byId.get(d.central_id);
        if (!c) continue;
        const s = cleanSettings(c.settings);
        if (!s.notificationsEnabled) continue;
        const { today, minutes } = localNow(d.timezone);
        const now = new Date().toISOString();

        // Resumo do dia: uma vez por dia, a partir do horário escolhido (até 3h depois)
        const summaryAt = toMin(s.dailySummaryTime) ?? 480;
        if (s.dailySummary && d.last_summary_on !== today && minutes >= summaryAt && minutes < summaryAt + 180) {
          let summary = await withAlerts(buildDailySummary(await tasksOf(c.id), d.timezone, c.name), c, s, d.timezone);
          if (s.aiBriefing && ANTHROPIC_API_KEY && (summary || (await tasksOf(c.id)).length)) {
            if (!briefings.has(c.id)) briefings.set(c.id, await aiBriefing(c).catch((err) => (console.error("Briefing", err?.message), null)));
            const text = briefings.get(c.id);
            if (text) summary = { title: `${c.name}: briefing do dono`, body: text, route: "#/assistente" };
          }
          if (summary && (await sendPush(d, { ...summary, centralId: c.id }))) sent++;
          await db.from("devices").update({ last_summary_on: today, last_sent_at: now })
            .eq("central_id", d.central_id).eq("endpoint", d.endpoint);
          continue;
        }

        // Revisão da semana: sexta, a partir das 17h, uma vez
        if (s.weeklyReview && localNow(d.timezone).weekday === 5 && minutes >= 1020 && minutes < 1200 && d.last_review_on !== today) {
          const review = await weeklyReview(c, s, d.timezone);
          if (review && (await sendPush(d, { ...review, centralId: c.id }))) sent++;
          await db.from("devices").update({ last_review_on: today, last_sent_at: now }).eq("central_id", d.central_id).eq("endpoint", d.endpoint);
          continue;
        }

        if (!inWindow(s, minutes)) continue;
        const last = d.last_sent_at ? Date.parse(d.last_sent_at) : 0;
        if (Date.now() - last < s.frequencyHours * 3600000 - 5 * 60000) continue; // 5 min de folga
        const digest = await withAlerts(buildDigest(await tasksOf(c.id), d.timezone, c.name), c, s, d.timezone);
        if (digest && (await sendPush(d, { ...digest, centralId: c.id }))) sent++;
        await db.from("devices").update({ last_sent_at: now }).eq("central_id", d.central_id).eq("endpoint", d.endpoint);
      }
      return { ok: true, sent };
    }

    case "radarList": {
      const central = await getCentral(body.centralId, body.pin);
      return {
        items: await radarRecent(central.id, 200),
        radar: { lastAt: central.radar_last_at ?? null, lastError: central.radar_last_error ?? null },
        defaultOrgs: DEFAULT_ORGS,
      };
    }

    case "radarMark": {
      const central = await getCentral(body.centralId, body.pin);
      const id = String(body.itemId ?? "");
      const { data: row, error } = await db.from("radar").select("data").eq("central_id", central.id).eq("id", id).maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!row) throw new HttpError(404, "Notícia não encontrada.");
      const patch = body.patch ?? {};
      const next = { ...row.data };
      if (typeof patch.starred === "boolean") next.starred = patch.starred;
      if (typeof patch.read === "boolean") next.read = patch.read;
      if (typeof patch.note === "string") next.note = patch.note.slice(0, 2000);
      const { error: upErr } = await db.from("radar").update({ data: next }).eq("central_id", central.id).eq("id", id);
      if (upErr) throw new HttpError(500, upErr.message);
      return { item: next };
    }

    case "radarDelete": {
      const central = await getCentral(body.centralId, body.pin);
      await db.from("radar").delete().eq("central_id", central.id).eq("id", String(body.itemId ?? ""));
      return { ok: true };
    }

    case "radarRunNow": {
      const central = await getCentral(body.centralId, body.pin);
      await countAiUse(central.id);
      try {
        const r = await runRadar(central, true);
        return { added: r.added.length, orgs: r.orgs };
      } catch (err: any) {
        await db.from("centrals").update({ radar_last_error: String(err?.message ?? err).slice(0, 300) }).eq("id", central.id);
        throw err;
      }
    }

    case "radarCaseStudy": {
      const central = await getCentral(body.centralId, body.pin);
      await countAiUse(central.id);
      const item = await caseStudy(central, true);
      return { item };
    }

    case "radarRun": {
      // Pode ser chamado pelo GitHub Actions; o agendador do Supabase ("send") também roda o radar sozinho.
      if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) throw new HttpError(401, "Não autorizado.");
      return { ok: true, report: await runDueRadars(!!body.force) };
    }

    case "assistantChat": {
      const central = await getCentral(body.centralId, body.pin);
      const raw = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
      const messages = raw
        .map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content ?? "").slice(0, 8000) }))
        .filter((m: any) => m.content.trim());
      while (messages.length && messages[0].role !== "user") messages.shift();
      if (!messages.length || messages[messages.length - 1].role !== "user") throw new HttpError(400, "Escreva sua mensagem.");
      await countAiUse(central.id);
      const out = await anthropic({
        max_tokens: 2500,
        system: assistantSystem(await assistantContext(central)),
        tools: [SUGGEST_TOOL],
        messages,
      }, [AI_ASSISTANT_MODEL, "claude-sonnet-4-5", AI_MODEL]);
      const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n\n").trim();
      const call = (out.content ?? []).find((c: any) => c.type === "tool_use" && c.name === SUGGEST_TOOL.name);
      const byName = new Map(central.areas.map((a: any) => [fold(a.name), a.id]));
      const tasks = (Array.isArray(call?.input?.tasks) ? call.input.tasks : []).slice(0, 12).map((t: any) => ({
        title: String(t.title ?? "").trim().slice(0, 200),
        areaId: byName.get(fold(t.area)) ?? central.areas[0]?.id ?? null,
        priority: ["urgent", "high", "normal", "low"].includes(t.priority) ? t.priority : "normal",
        dueDate: DATE_RE.test(t.dueDate ?? "") ? t.dueDate : null,
        description: String(t.description ?? "").trim().slice(0, 2000),
      })).filter((t: any) => t.title);
      return {
        reply: text || (tasks.length ? "Sugeri algumas tarefas abaixo. Revise e crie as que fizerem sentido." : "Não consegui responder agora."),
        tasks,
      };
    }

    default:
      throw new HttpError(400, "Ação desconhecida.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  try {
    return json(await handle(body, req));
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return json({ error: "Erro interno." }, 500);
  }
});
