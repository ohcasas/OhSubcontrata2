-- ============================================================================
-- 0097 · Precio fijo en las obras de OH Casas: sin contraoferta (BORRADOR, no aplicar sin autorización)
-- ============================================================================
-- Regla de Dirección: en las obras que publica OH Casas el precio es el que figura en la app. Las empresas lo
-- aceptan o no se postulan; no proponen otro importe.
--
-- Qué hace
--   · Al crearse una postulación en una obra de OH Casas, la base de datos pone SIEMPRE como oferta el presupuesto
--     publicado de la obra, mande lo que mande la app. Así también vale para las versiones antiguas de la app.
--   · «Obra de OH Casas» = obra de empresa (no petición de particular) creada por administración.
--     Las licitaciones de promotoras y constructoras, y las peticiones de particulares, NO cambian.
--   · obra_precio_fijo(obra): lo consulta la app para mostrar el precio fijo en vez del campo de oferta.
--   · Se puede apagar y volver a encender sin tocar nada más (ver al final).
--
-- Qué NO hace
--   · No modifica las postulaciones que ya existen (para esas, el ajuste manual de la 0096).
--   · No acepta ni rechaza a nadie, no envía avisos y no borra nada.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

create table if not exists ajustes_postulaciones (
  id boolean primary key default true check (id),
  precio_fijo_obras_oh boolean not null default true
);
insert into ajustes_postulaciones (id) values (true) on conflict (id) do nothing;
alter table ajustes_postulaciones enable row level security;
drop policy if exists ajustes_postulaciones_admin on ajustes_postulaciones;
create policy ajustes_postulaciones_admin on ajustes_postulaciones for select to authenticated
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));
revoke all on table ajustes_postulaciones from anon, authenticated;
grant select on table ajustes_postulaciones to authenticated;

create or replace function obra_precio_fijo(p_obra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select precio_fijo_obras_oh from ajustes_postulaciones where id), false)
     and exists (
       select 1
         from obras o
         left join profiles p on p.id = o.creado_por
        where o.id = p_obra_id
          and o.origen = 'empresa'
          and (o.creado_por is null or p.role::text in ('admin', 'superadmin'))
     );
$$;
revoke all on function obra_precio_fijo(uuid) from public, anon;
grant execute on function obra_precio_fijo(uuid) to authenticated;

create or replace function trg_postulacion_precio_fijo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if obra_precio_fijo(new.obra_id) then
    new.oferta_economica := (select presupuesto from obras where id = new.obra_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_postulacion_precio_fijo on postulaciones;
create trigger trg_postulacion_precio_fijo before insert on postulaciones
  for each row execute function trg_postulacion_precio_fijo();

-- ---------------------------------------------------------------------------
-- Apagar / encender la regla (solo cambia las postulaciones nuevas):
--   update ajustes_postulaciones set precio_fijo_obras_oh = false;   -- vuelve a permitir ofertas libres
--   update ajustes_postulaciones set precio_fijo_obras_oh = true;
-- ROLLBACK completo:
--   drop trigger if exists trg_postulacion_precio_fijo on postulaciones;
--   drop function if exists trg_postulacion_precio_fijo(), obra_precio_fijo(uuid);
--   drop table if exists ajustes_postulaciones;
-- ---------------------------------------------------------------------------