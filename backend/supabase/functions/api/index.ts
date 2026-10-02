// Supabase Edge Function: api — Central de Tarefas v3
//
// Todas as chamadas são POST com JSON { action, ... }.
// O código da central (que vai no link) funciona como chave de acesso.
// Se a central tiver PIN, as chamadas também precisam enviar { pin }.
//
// Segredos (Edge Functions > Secrets no painel, nunca no GitHub):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
//   ANTHROPIC_API_KEY  (para as funções de IA)
// Opcionais: AI_MODEL (padrão claude-haiku-4-5-20251001), AI_DAILY_LIMIT (padrão 60 usos por central por dia)
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
};
type Settings = typeof DEFAULT_SETTINGS;
const COLLECTIONS: Record<string, { table: string; maxSize: number }> = {
  tasks: { table: "tasks", maxSize: 60000 },
  notes: { table: "notes", maxSize: 200000 },
};

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

function localNow(tz: string): { today: string; minutes: number } {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date()).map((p) => [p.type, p.value]),
    );
    return { today: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  } catch {
    return tz === "America/Sao_Paulo" ? { today: new Date().toISOString().slice(0, 10), minutes: 0 } : localNow("America/Sao_Paulo");
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
      };
    })
    .filter((t: any) => t.title);
}

// ----------------------------------------------------------------------------
// Ações
// ----------------------------------------------------------------------------
async function handle(body: any, req: Request) {
  switch (body.action) {
    case "config":
      return { vapidPublicKey: PUSH_READY ? VAPID_PUBLIC_KEY : null, ai: !!ANTHROPIC_API_KEY };

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
        if (total > 1000) throw new HttpError(400, "Alterações demais de uma vez.");
        result[name] = await applyChanges(cfg.table, cfg.maxSize, central.id, ups, dels);
      }
      return { ok: true, applied: result };
    }

    case "replaceData": {
      // Importação de backup: substitui tarefas e notas da central.
      const central = await getCentral(body.centralId, body.pin);
      for (const [name, cfg] of Object.entries(COLLECTIONS)) {
        if (!Array.isArray(body[name])) continue;
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
      for (const table of ["tasks", "notes", "devices", "ai_usage"]) {
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
          const summary = buildDailySummary(await tasksOf(c.id), d.timezone, c.name);
          if (summary && (await sendPush(d, { ...summary, centralId: c.id }))) sent++;
          await db.from("devices").update({ last_summary_on: today, last_sent_at: now })
            .eq("central_id", d.central_id).eq("endpoint", d.endpoint);
          continue;
        }

        if (!inWindow(s, minutes)) continue;
        const last = d.last_sent_at ? Date.parse(d.last_sent_at) : 0;
        if (Date.now() - last < s.frequencyHours * 3600000 - 5 * 60000) continue; // 5 min de folga
        const digest = buildDigest(await tasksOf(c.id), d.timezone, c.name);
        if (digest && (await sendPush(d, { ...digest, centralId: c.id }))) sent++;
        await db.from("devices").update({ last_sent_at: now }).eq("central_id", d.central_id).eq("endpoint", d.endpoint);
      }
      return { ok: true, sent };
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
