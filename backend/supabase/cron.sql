-- Agendador dos lembretes push (roda dentro do Supabase).
-- Chama a função a cada 15 minutos; ela decide quem deve receber lembrete.
--
-- 1) Em Database > Extensions, ative "pg_cron" e "pg_net".
-- 2) Troque SEU-PROJETO e SEU_CRON_SECRET abaixo e execute no SQL Editor.
--    NÃO faça commit do segredo real no GitHub.

-- Remove o agendamento da versão anterior, se existir (ignore erro se não existir)
select cron.unschedule('central-tarefas-lembretes')
where exists (select 1 from cron.job where jobname = 'central-tarefas-lembretes');

select cron.schedule(
  'central-tarefas-lembretes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU-PROJETO.supabase.co/functions/v1/api',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', 'SEU_CRON_SECRET'),
    body    := jsonb_build_object('action', 'send')
  );
  $$
);

-- Conferir:  select * from cron.job;
-- Remover:   select cron.unschedule('central-tarefas-lembretes');
