-- Agendador dentro do próprio Supabase (recomendado).
-- Chama a função a cada 15 minutos; ela decide quem deve receber lembrete.
--
-- 1) Em Database > Extensions, ative "pg_cron" e "pg_net".
-- 2) Troque SEU-PROJETO e SEU_APP_TOKEN abaixo e execute no SQL Editor.
--    Este arquivo no GitHub fica com os valores de exemplo; NÃO faça commit do token real.

select cron.schedule(
  'central-tarefas-lembretes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU-PROJETO.supabase.co/functions/v1/lembretes',
    headers := jsonb_build_object('content-type', 'application/json', 'x-app-token', 'SEU_APP_TOKEN'),
    body    := jsonb_build_object('action', 'send')
  );
  $$
);

-- Para conferir:      select * from cron.job;
-- Para remover:       select cron.unschedule('central-tarefas-lembretes');
