-- Central de Tarefas v2: centrais com link próprio, tarefas sincronizadas e dispositivos com push.
-- Rode no Supabase: SQL Editor > New query > cole tudo e clique em Run.
-- Pode rodar de novo sem problema (não apaga dados existentes das tabelas novas).

create table if not exists public.centrals (
  id          text primary key,                       -- código aleatório que vai no link
  name        text not null,
  areas       jsonb not null default '[]'::jsonb,     -- [{ id, name, color }]
  settings    jsonb not null default '{}'::jsonb,     -- notificações: frequência e horários
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  central_id  text not null references public.centrals(id) on delete cascade,
  id          text not null,
  data        jsonb not null,                         -- a tarefa completa
  updated_at  timestamptz not null,
  primary key (central_id, id)
);

create table if not exists public.devices (
  central_id    text not null references public.centrals(id) on delete cascade,
  endpoint      text not null,                        -- endereço push do navegador
  subscription  jsonb not null,
  timezone      text not null default 'America/Sao_Paulo',
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  primary key (central_id, endpoint)
);

-- RLS ligado e SEM políticas: ninguém acessa pela API pública do Supabase.
-- Só a Edge Function "api" (com a service role, que fica no servidor) lê e grava.
alter table public.centrals enable row level security;
alter table public.tasks    enable row level security;
alter table public.devices  enable row level security;

-- Tabela da versão anterior (não é mais usada)
drop table if exists public.push_devices;
