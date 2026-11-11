-- 0080_version_minima_app.sql
-- Versión mínima y recomendada de la app. La app la consulta al abrirse:
--   · versión < mínima       -> pantalla que bloquea y lleva a la tienda para actualizar
--   · versión < recomendada  -> aviso que se puede cerrar
-- Se cambia desde el SQL Editor (ver el final del archivo), sin sacar una build nueva.
-- Solo lectura desde la app. No toca datos de usuarios, no envía nada, no crea tareas.
-- Idempotente: se puede ejecutar más de una vez (no pisa valores ya cambiados).

create table if not exists app_version_config (
  plataforma text primary key check (plataforma in ('android', 'ios')),
  version_minima text not null default '1.0.0' check (version_minima ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  version_recomendada text not null default '1.0.0' check (version_recomendada ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  url_tienda text,
  mensaje text check (mensaje is null or length(mensaje) <= 300),
  updated_at timestamptz not null default now()
);

alter table app_version_config enable row level security;
drop policy if exists app_version_config_select on app_version_config;
create policy app_version_config_select on app_version_config for select using (true);

revoke all on app_version_config from public, anon, authenticated;
grant select on app_version_config to anon, authenticated;

insert into app_version_config (plataforma, url_tienda) values
  ('android', 'https://play.google.com/store/apps/details?id=es.tresbe.conecta'),
  ('ios', null)
on conflict (plataforma) do nothing;

-- Cómo cambiarlo cuando haga falta (ejemplos; NO se ejecutan aquí):
--   Pedir que todos actualicen a la 1.2.0:
--     update app_version_config set version_minima = '1.2.0', version_recomendada = '1.2.0', updated_at = now() where plataforma = 'android';
--   Solo recomendar:
--     update app_version_config set version_recomendada = '1.3.0', updated_at = now() where plataforma = 'android';
--   Mensaje opcional que verá la gente:
--     update app_version_config set mensaje = 'Mejoras de seguridad y de la bolsa de empleo.' where plataforma = 'android';