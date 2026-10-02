-- Central de Tarefas v3
-- Rode no Supabase: SQL Editor > New query > cole tudo e clique em Run.
-- Pode rodar quantas vezes quiser: só cria o que ainda não existe e não apaga dados.

create table if not exists public.centrals (
  id          text primary key,                       -- código aleatório que vai no link
  name        text not null,
  areas       jsonb not null default '[]'::jsonb,     -- [{ id, name, color }]
  settings    jsonb not null default '{}'::jsonb,     -- lembretes e resumo diário
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.centrals add column if not exists people   jsonb not null default '[]'::jsonb; -- equipe [{ id, name }]
alter table public.centrals add column if not exists pin_salt text;
alter table public.centrals add column if not exists pin_hash text;

create table if not exists public.tasks (
  central_id  text not null references public.centrals(id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null,
  primary key (central_id, id)
);

create table if not exists public.notes (
  central_id  text not null references public.centrals(id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null,
  primary key (central_id, id)
);

create table if not exists public.devices (
  central_id    text not null references public.centrals(id) on delete cascade,
  endpoint      text not null,
  subscription  jsonb not null,
  timezone      text not null default 'America/Sao_Paulo',
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  primary key (central_id, endpoint)
);
alter table public.devices add column if not exists last_summary_on text; -- dia do último resumo diário

create table if not exists public.ai_usage (
  central_id  text not null references public.centrals(id) on delete cascade,
  day         text not null,
  count       integer not null default 0,
  primary key (central_id, day)
);

-- RLS ligado e SEM políticas: ninguém acessa pela API pública do Supabase.
-- Só a Edge Function "api" (com a service role, que fica no servidor) lê e grava.
alter table public.centrals enable row level security;
alter table public.tasks    enable row level security;
alter table public.notes    enable row level security;
alter table public.devices  enable row level security;
alter table public.ai_usage enable row level security;

drop table if exists public.push_devices; -- tabela da versão 1, não é mais usada
