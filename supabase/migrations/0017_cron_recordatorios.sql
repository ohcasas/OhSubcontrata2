-- Programa la comprobación de recordatorios de ofertas guardadas: cada hora
-- en punto se ejecuta enviar_recordatorios_ofertas() (definida en 0016).
--
-- Va en un archivo aparte porque depende de la extensión pg_cron. Si esta
-- migración da error del tipo "extension pg_cron is not available", actívala
-- primero en el panel de Supabase (Database → Extensions → busca "pg_cron" →
-- activar) y vuelve a ejecutar este archivo. El resto del sistema funciona
-- igual sin él; solo faltarían los recordatorios automáticos.

create extension if not exists pg_cron;

-- Si ya existía un trabajo con este nombre, se reemplaza (no se duplica).
select cron.schedule(
  'recordatorios-ofertas',
  '0 * * * *',
  $$ select public.enviar_recordatorios_ofertas(); $$
);