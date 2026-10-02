// Supabase Edge Function: api
// Central de Tarefas v2 — centrais com link próprio, sincronização e push.
//
// Todas as chamadas são POST com JSON { action, ... }.
// O código da central (que vai no link) funciona como chave de acesso:
// quem tem o link pode ver e editar aquela central.
//
// Segredos (Edge Functions > Secrets no painel, nunca no GitHub):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const PUSH_READY = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (PUSH_READY) {
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:voce@exemplo.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DEFAULT_SETTINGS = { notificationsEnabled: true, frequencyHours: 2, startTime: "08:00", endTime: "20:00" };

function newId(len = 24) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
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

function cleanSettings(v: any, base = DEFAULT_SETTINGS) {
  const s = { ...base };
  if (v && typeof v === "object") {
    if (typeof v.notificationsEnabled === "boolean") s.notificationsEnabled = v.notificationsEnabled;
    if ([1, 2, 3, 4, 6].includes(Number(v.frequencyHours))) s.frequencyHours = Number(v.frequencyHours);
    if (TIME_RE.test(v.startTime ?? "")) s.startTime = v.startTime;
    if (TIME_RE.test(v.endTime ?? "")) s.endTime = v.endTime;
  }
  return s;
}

function cleanTask(t: any) {
  if (!t || typeof t !== "object") throw new HttpError(400, "Tarefa inválida.");
  const id = String(t.id ?? "");
  if (!id || id.length > 64) throw new HttpError(400, "Tarefa sem id.");
  const updatedAt = Date.parse(t.updatedAt);
  if (!updatedAt) throw new HttpError(400, "Tarefa sem data de atualização.");
  const data = JSON.stringify(t);
  if (data.length > 20000) throw new HttpError(400, "Tarefa grande demais.");
  return { id, updated_at: new Date(updatedAt).toISOString(), data: t };
}

async function getCentral(id: unknown) {
  if (typeof id !== "string" || !ID_RE.test(id)) throw new HttpError(404, "Central não encontrada.");
  const { data, error } = await db.from("centrals").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Central não encontrada.");
  return data;
}

const publicCentral = (c: any) => ({
  id: c.id,
  name: c.name,
  areas: c.areas,
  settings: cleanSettings(c.settings),
  updatedAt: c.updated_at,
});

// ----------------------------------------------------------------------------
// Resumo das tarefas (mesma lógica de js/core.js), no fuso do dispositivo
// ----------------------------------------------------------------------------
const toMin = (hhmm?: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

function localNow(tz: string) {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date()).map((p) => [p.type, p.value]),
    );
  } catch {
    return localNow("America/Sao_Paulo");
  }
  return { today: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function classify(t: any, today: string, nowMin: number): any {
  if (t.status === "done") return { section: "done", actionable: false };
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
  const key = ({ t, c }: any) => {
    const date = c.followUpDue ? t.followUpDate : t.dueDate;
    const time = c.followUpDue ? "00:00" : t.dueTime || "23:59";
    return [
      c.overdue ? 0 : 1, t.priority === "urgent" ? 0 : 1, c.today ? 0 : 1, t.priority === "high" ? 0 : 1,
      date ? `${date}T${time}` : "9999", RANK[t.priority] ?? 2,
    ];
  };
  const top = items
    .map((x) => ({ x, k: key(x) }))
    .sort((a, b) => {
      for (let i = 0; i < a.k.length; i++) {
        if (a.k[i] < b.k[i]) return -1;
        if (a.k[i] > b.k[i]) return 1;
      }
      return 0;
    })
    .slice(0, 3)
    .map(({ x }) => "• " + (x.c.followUpDue ? "Cobrar retorno: " : "") + x.t.title);

  const parts: string[] = [];
  if (n.overdue) parts.push(plural(n.overdue, "atrasada", "atrasadas"));
  if (n.urgent) parts.push(plural(n.urgent, "urgente", "urgentes"));
  if (n.today) parts.push(`${n.today} para hoje`);
  if (n.upcoming) parts.push(plural(n.upcoming, "próxima", "próximas"));
  if (n.nodate) parts.push(`${n.nodate} sem prazo`);
  const lines = [`Você ainda possui ${plural(items.length, "demanda aberta", "demandas abertas")}.`, joinPt(parts) + "."];
  if (n.followups) lines.push(plural(n.followups, "retorno para cobrar", "retornos para cobrar") + ".");
  lines.push("", "Principais:", ...top);
  return {
    title: `${centralName}: tarefas pendentes` + (n.overdue ? `, ${plural(n.overdue, "atrasada", "atrasadas")}` : ""),
    body: lines.join("\n"),
  };
}

function inWindow(s: typeof DEFAULT_SETTINGS, minutes: number) {
  const a = toMin(s.startTime) ?? 0;
  const b = toMin(s.endTime) ?? 1440;
  if (a === b) return true;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

async function openTasks(centralId: string) {
  const { data, error } = await db.from("tasks").select("data").eq("central_id", centralId);
  if (error) throw new HttpError(500, error.message);
  return (data ?? []).map((r: any) => r.data).filter((t: any) => t && t.status !== "done");
}

async function sendPush(device: any, payload: unknown) {
  try {
    await webpush.sendNotification(device.subscription, JSON.stringify(payload), { TTL: 3600 });
    return true;
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      // assinatura expirada ou removida pelo navegador
      await db.from("devices").delete().eq("central_id", device.central_id).eq("endpoint", device.endpoint);
    } else {
      console.error("Falha ao enviar push", err?.statusCode, err?.body ?? err?.message);
    }
    return false;
  }
}

// ----------------------------------------------------------------------------
// Ações
// ----------------------------------------------------------------------------
async function handle(body: any, req: Request) {
  switch (body.action) {
    case "config":
      return { vapidPublicKey: PUSH_READY ? VAPID_PUBLIC_KEY : null };

    case "create": {
      const now = new Date().toISOString();
      const row = {
        id: newId(),
        name: cleanName(body.name),
        areas: cleanAreas(body.areas),
        settings: cleanSettings(body.settings),
        created_at: now,
        updated_at: now,
      };
      const { error } = await db.from("centrals").insert(row);
      if (error) throw new HttpError(500, error.message);
      return { central: publicCentral(row) };
    }

    case "get": {
      const central = await getCentral(body.centralId);
      const { data, error } = await db.from("tasks").select("data").eq("central_id", central.id);
      if (error) throw new HttpError(500, error.message);
      return { central: publicCentral(central), tasks: (data ?? []).map((r: any) => r.data) };
    }

    case "updateCentral": {
      const central = await getCentral(body.centralId);
      const patch = body.patch ?? {};
      const next: any = { updated_at: new Date().toISOString() };
      if ("name" in patch) next.name = cleanName(patch.name);
      if ("areas" in patch) next.areas = cleanAreas(patch.areas);
      if ("settings" in patch) next.settings = cleanSettings(patch.settings, cleanSettings(central.settings));
      const { error } = await db.from("centrals").update(next).eq("id", central.id);
      if (error) throw new HttpError(500, error.message);
      return { central: publicCentral({ ...central, ...next }) };
    }

    case "sync": {
      // Envia alterações pendentes (upserts e exclusões) de uma vez.
      const central = await getCentral(body.centralId);
      const upserts = Array.isArray(body.upserts) ? body.upserts : [];
      const deletes = Array.isArray(body.deletes) ? body.deletes.map(String) : [];
      if (upserts.length + deletes.length > 1000) throw new HttpError(400, "Alterações demais de uma vez.");

      if (deletes.length) {
        const { error } = await db.from("tasks").delete().eq("central_id", central.id).in("id", deletes);
        if (error) throw new HttpError(500, error.message);
      }

      let applied = 0;
      if (upserts.length) {
        const rows = upserts.map(cleanTask);
        // vence a versão mais recente (last write wins)
        const { data: existing, error } = await db
          .from("tasks").select("id, updated_at").eq("central_id", central.id).in("id", rows.map((r: any) => r.id));
        if (error) throw new HttpError(500, error.message);
        const current = new Map((existing ?? []).map((r: any) => [r.id, Date.parse(r.updated_at)]));
        const fresh = rows
          .filter((r: any) => !current.has(r.id) || Date.parse(r.updated_at) >= (current.get(r.id) as number))
          .map((r: any) => ({ ...r, central_id: central.id }));
        if (fresh.length) {
          const { error: upErr } = await db.from("tasks").upsert(fresh, { onConflict: "central_id,id" });
          if (upErr) throw new HttpError(500, upErr.message);
        }
        applied = fresh.length;
      }
      return { ok: true, applied, deleted: deletes.length };
    }

    case "replaceTasks": {
      // Usado na importação de backup: substitui todas as tarefas da central.
      const central = await getCentral(body.centralId);
      const rows = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 5000).map(cleanTask);
      const { error: delErr } = await db.from("tasks").delete().eq("central_id", central.id);
      if (delErr) throw new HttpError(500, delErr.message);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r: any) => ({ ...r, central_id: central.id }));
        const { error } = await db.from("tasks").insert(chunk);
        if (error) throw new HttpError(500, error.message);
      }
      return { ok: true, count: rows.length };
    }

    case "subscribe": {
      const central = await getCentral(body.centralId);
      const sub = body.subscription;
      if (!sub?.endpoint || !sub?.keys) throw new HttpError(400, "Assinatura de push inválida.");
      const { error } = await db.from("devices").upsert(
        {
          central_id: central.id,
          endpoint: sub.endpoint,
          subscription: sub,
          timezone: String(body.timezone || "America/Sao_Paulo").slice(0, 64),
          last_sent_at: new Date().toISOString(),
        },
        { onConflict: "central_id,endpoint" },
      );
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }

    case "unsubscribe": {
      const central = await getCentral(body.centralId);
      await db.from("devices").delete().eq("central_id", central.id).eq("endpoint", String(body.endpoint ?? ""));
      return { ok: true };
    }

    case "testPush": {
      if (!PUSH_READY) throw new HttpError(503, "Chaves VAPID não configuradas no servidor.");
      const central = await getCentral(body.centralId);
      const { data: device } = await db
        .from("devices").select("*").eq("central_id", central.id).eq("endpoint", String(body.endpoint ?? "")).maybeSingle();
      if (!device) throw new HttpError(404, "Este dispositivo não está cadastrado. Ative as notificações de novo.");
      const digest = buildDigest(await openTasks(central.id), device.timezone, central.name);
      const ok = await sendPush(device, {
        ...(digest ?? {
          title: `${central.name}: tudo em dia`,
          body: "Notificações funcionando. Nenhuma demanda depende de você agora.",
        }),
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
      const tasksCache = new Map<string, any[]>();

      let sent = 0;
      for (const d of devices) {
        const c = byId.get(d.central_id);
        if (!c) continue;
        const s = cleanSettings(c.settings);
        if (!s.notificationsEnabled) continue;
        if (!inWindow(s, localNow(d.timezone).minutes)) continue;
        const last = d.last_sent_at ? Date.parse(d.last_sent_at) : 0;
        // 5 min de folga porque o agendador roda em intervalos
        if (Date.now() - last < s.frequencyHours * 3600000 - 5 * 60000) continue;
        if (!tasksCache.has(c.id)) tasksCache.set(c.id, await openTasks(c.id));
        const digest = buildDigest(tasksCache.get(c.id)!, d.timezone, c.name);
        if (digest && (await sendPush(d, { ...digest, centralId: c.id }))) sent++;
        await db.from("devices").update({ last_sent_at: new Date().toISOString() })
          .eq("central_id", d.central_id).eq("endpoint", d.endpoint);
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
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Erro interno." }, 500);
  }
});
