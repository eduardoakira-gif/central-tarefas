-- Central de Tarefas: tabela usada pela Edge Function "lembretes".
-- Rode no Supabase: SQL Editor > New query > cole e execute.

create table if not exists public.push_devices (
  endpoint      text primary key,          -- endereço único da assinatura push do navegador
  subscription  jsonb not null,            -- chaves da assinatura (públicas, geradas pelo navegador)
  settings      jsonb not null default '{}'::jsonb,  -- frequência, janela de horário e fuso
  tasks         jsonb not null default '[]'::jsonb,  -- resumo das tarefas abertas
  last_sent_at  timestamptz,
  updated_at    timestamptz not null default now()
);

-- RLS ligado e SEM políticas: ninguém acessa pela API pública.
-- Só a Edge Function (com a service role, que fica no servidor) lê e grava.
alter table public.push_devices enable row level security;
