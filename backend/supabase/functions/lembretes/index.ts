// Supabase Edge Function: lembretes
//
// Ações (POST, header x-app-token obrigatório):
//   { action: "sync", subscription, settings, tasks }  -> salva assinatura + resumo das tarefas
//   { action: "send" }                                  -> chamada pelo agendador; envia o que estiver na hora
//   { action: "test", endpoint }                        -> envia uma notificação de teste agora
//   { action: "unsubscribe", endpoint }                 -> remove o dispositivo
//
// Segredos (configure com `supabase secrets set`, nunca no repositório):
//   APP_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente nas Edge Functions.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const APP_TOKEN = Deno.env.get("APP_TOKEN") ?? "";
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:voce@exemplo.com",
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-app-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// ----------------------------------------------------------------------------
// Mesma lógica de js/core.js (classificação e resumo), calculada no fuso do usuário
// ----------------------------------------------------------------------------
type Task = {
  id: string; title: string; area: string; status: string; priority: string;
  dueDate?: string | null; dueTime?: string | null; followUpDate?: string | null; waitingFor?: string;
};
type Settings = { enabled: boolean; frequencyHours: number; startTime: string; endTime: string; timezone: string };

const toMin = (hhmm?: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

function localNow(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function classify(t: Task, today: string, nowMin: number) {
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

function buildDigest(tasks: Task[], tz: string) {
  const { today, minutes } = localNow(tz);
  const items = tasks.map((t) => ({ t, c: classify(t, today, minutes) as any })).filter((x) => x.c.actionable);
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
  const key = ({ t, c }: { t: Task; c: any }) => {
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
    title: n.overdue ? `Tarefas pendentes, ${plural(n.overdue, "atrasada", "atrasadas")}` : "Tarefas pendentes",
    body: lines.join("\n"),
  };
}

function inWindow(s: Settings, minutes: number) {
  const a = toMin(s.startTime) ?? 0;
  const b = toMin(s.endTime) ?? 1440;
  if (a === b) return true;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

async function push(subscription: unknown, payload: unknown, endpoint: string) {
  try {
    await webpush.sendNotification(subscription as any, JSON.stringify(payload), { TTL: 3600 });
    return true;
  } catch (err: any) {
    // assinatura expirada ou removida pelo navegador
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await db.from("push_devices").delete().eq("endpoint", endpoint);
    } else {
      console.error("Falha ao enviar push", err?.statusCode, err?.body);
    }
    return false;
  }
}

// ----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);
  if (!APP_TOKEN || req.headers.get("x-app-token") !== APP_TOKEN) return json({ error: "token inválido" }, 401);

  const body = await req.json().catch(() => ({}));

  if (body.action === "sync") {
    const sub = body.subscription;
    if (!sub?.endpoint) return json({ error: "assinatura ausente" }, 400);
    const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 500) : [];
    const { error } = await db.from("push_devices").upsert({
      endpoint: sub.endpoint,
      subscription: sub,
      settings: body.settings ?? {},
      tasks,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === "unsubscribe") {
    await db.from("push_devices").delete().eq("endpoint", body.endpoint ?? "");
    return json({ ok: true });
  }

  if (body.action === "test") {
    const { data } = await db.from("push_devices").select("*").eq("endpoint", body.endpoint ?? "").maybeSingle();
    if (!data) return json({ error: "dispositivo não encontrado; ative o push novamente" }, 404);
    const digest = buildDigest(data.tasks ?? [], data.settings?.timezone || "America/Sao_Paulo");
    const ok = await push(data.subscription, digest ?? { title: "Tudo em dia", body: "Push funcionando. Nenhuma demanda depende de você agora." }, data.endpoint);
    return json({ ok });
  }

  if (body.action === "send") {
    const { data: devices, error } = await db.from("push_devices").select("*");
    if (error) return json({ error: error.message }, 500);
    let sent = 0;
    for (const d of devices ?? []) {
      const s: Settings = {
        enabled: d.settings?.enabled !== false,
        frequencyHours: Number(d.settings?.frequencyHours) || 2,
        startTime: d.settings?.startTime || "08:00",
        endTime: d.settings?.endTime || "20:00",
        timezone: d.settings?.timezone || "America/Sao_Paulo",
      };
      if (!s.enabled) continue;
      if (!inWindow(s, localNow(s.timezone).minutes)) continue;
      const last = d.last_sent_at ? Date.parse(d.last_sent_at) : 0;
      // 5 min de folga porque o agendador roda em intervalos
      if (Date.now() - last < s.frequencyHours * 3600000 - 5 * 60000) continue;
      const digest = buildDigest(d.tasks ?? [], s.timezone);
      if (digest && (await push(d.subscription, digest, d.endpoint))) sent++;
      await db.from("push_devices").update({ last_sent_at: new Date().toISOString() }).eq("endpoint", d.endpoint);
    }
    return json({ ok: true, sent });
  }

  return json({ error: "ação desconhecida" }, 400);
});
