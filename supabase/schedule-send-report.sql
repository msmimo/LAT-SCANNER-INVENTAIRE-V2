-- ============================================================================
-- Planification du rapport courriel (Edge Function « send-report »)
-- ----------------------------------------------------------------------------
-- À exécuter UNE FOIS dans le SQL Editor du projet Supabase TABLE-APEX
-- (zkulkxmwgfkgsdmfuohc), APRÈS avoir déployé la fonction :
--   supabase functions deploy send-report --no-verify-jwt
--
-- Un job pg_cron appelle la fonction toutes les 5 minutes. La fonction gère
-- elle-même la temporisation (elle n'envoie que si la plus ancienne
-- notification non envoyée a au moins 5 minutes), donc l'appeler souvent est
-- sans danger : la plupart des appels ne font rien.
-- ============================================================================

-- 1. Extensions nécessaires (déjà activées sur la plupart des projets)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Supprimer un ancien job du même nom (pour ré-exécution idempotente)
select cron.unschedule('send-report-every-5min')
where exists (select 1 from cron.job where jobname = 'send-report-every-5min');

-- 3. Planifier l'appel HTTP toutes les 5 minutes.
--    ⚠️ La fonction est déployée avec --no-verify-jwt : aucun en-tête d'auth
--    n'est requis. Si vous la déployez AVEC vérification JWT, ajoutez :
--        headers := jsonb_build_object(
--          'Content-Type','application/json',
--          'Authorization','Bearer <ANON_KEY>')
select cron.schedule(
  'send-report-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://zkulkxmwgfkgsdmfuohc.supabase.co/functions/v1/send-report',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);

-- Vérifier :  select * from cron.job;
-- Historique: select * from cron.job_run_details order by start_time desc limit 20;
