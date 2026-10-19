-- =============================================================================
-- 0055 · Avisos a los oficios cuando se publica una obra de su especialidad
-- =============================================================================
-- Depende de la 0054 (etiquetas). Ejecutar después de ella.
--
--   1) Tabla interna obras_avisos_etiqueta: apunta a quién se ha avisado ya por cada
--      obra, para no repetir el aviso si el dueño cambia las etiquetas después.
--   2) avisar_oficios_de_obra(obra): manda una notificación (campana + push) a las
--      empresas que marcaron alguna de las etiquetas activas de esa obra. Solo si
--      la obra está abierta, solo a cuentas verificadas y nunca al propio dueño.
--   3) asignar_etiquetas_obra(): igual que en la 0054, pero al terminar llama a (2).
--   4) Disparador: si una obra con etiquetas pasa de "en revisión" a "abierta"
--      (peticiones de particulares que 3B publica), también se avisa.
--
-- Es seguro ejecutarla más de una vez.
-- =============================================================================

create table if not exists obras_avisos_etiqueta (
  obra_id uuid not null references obras (id) on delete cascade,
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (obra_id, empresa_id)
);
alter table obras_avisos_etiqueta enable row level security;
revoke all on obras_avisos_etiqueta from anon, authenticated;

create or replace function avisar_oficios_de_obra(p_obra_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
  v_ubicacion text;
  v_estado text;
  v_dueno_empresa uuid;
  v_nombres text;
  v_cuerpo text;
  r record;
  n integer := 0;
begin
  select o.titulo, o.ubicacion, o.estado::text, pr.empresa_id
    into v_titulo, v_ubicacion, v_estado, v_dueno_empresa
    from obras o
    left join profiles pr on pr.id = o.creado_por
    where o.id = p_obra_id;

  if v_estado is distinct from 'abierta' then
    return 0;
  end if;

  select string_agg(e.nombre, ', ' order by e.orden, e.nombre)
    into v_nombres
    from obras_etiquetas oe
    join etiquetas e on e.id = oe.etiqueta_id and e.estado = 'activa'
    where oe.obra_id = p_obra_id;

  if v_nombres is null then
    return 0;
  end if;

  v_cuerpo := '«' || coalesce(v_titulo, 'Nueva obra') || '»'
    || case when coalesce(trim(v_ubicacion), '') <> '' then ' en ' || trim(v_ubicacion) else '' end
    || ' · ' || v_nombres || '.';

  for r in
    select distinct ee.empresa_id
    from empresa_etiquetas ee
    join obras_etiquetas oe on oe.etiqueta_id = ee.etiqueta_id and oe.obra_id = p_obra_id
    join etiquetas e on e.id = ee.etiqueta_id and e.estado = 'activa'
    where ee.empresa_id is distinct from v_dueno_empresa
      and exists (
        select 1 from profiles p where p.empresa_id = ee.empresa_id and p.estado_cuenta = 'verificada'
      )
      and not exists (
        select 1 from obras_avisos_etiqueta a where a.obra_id = p_obra_id and a.empresa_id = ee.empresa_id
      )
  loop
    insert into obras_avisos_etiqueta (obra_id, empresa_id) values (p_obra_id, r.empresa_id)
      on conflict do nothing;
    perform crear_notificacion(
      r.empresa_id, 'nueva_obra_especialidad',
      'Nueva obra de tu especialidad', v_cuerpo,
      jsonb_build_object('obra_id', p_obra_id)
    );
    n := n + 1;
  end loop;

  return n;
end;
$$;
revoke execute on function avisar_oficios_de_obra(uuid) from public, anon, authenticated;

-- 3) Publicar etiquetas de una obra: igual que en la 0054 + el aviso final.
create or replace function asignar_etiquetas_obra(p_obra_id uuid, p_etiquetas uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rol text;
  v_admin boolean;
  v_owner uuid;
  v_estado text;
  v_ids uuid[];
  v_validas integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  v_rol := coalesce(auth_role()::text, '');
  v_admin := v_rol in ('admin', 'superadmin');

  select o.creado_por, o.estado::text into v_owner, v_estado from obras o where o.id = p_obra_id;
  if v_estado is null then
    raise exception 'Obra no encontrada';
  end if;
  if not v_admin and (v_owner is distinct from v_uid or v_rol not in ('promotor', 'constructora', 'administrador')) then
    raise exception 'No autorizado';
  end if;
  if v_estado in ('cerrada', 'cancelada', 'rechazada') then
    raise exception 'No se pueden cambiar las etiquetas de una obra cerrada o cancelada.';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_etiquetas, '{}')) as x;
  if cardinality(v_ids) > 5 then
    raise exception 'Una obra puede llevar como máximo 5 etiquetas.';
  end if;

  select count(*) into v_validas
    from etiquetas e
    where e.id = any (v_ids)
      and (e.estado = 'activa' or (e.estado = 'propuesta' and (e.propuesta_por = v_uid or v_admin)));
  if v_validas <> cardinality(v_ids) then
    raise exception 'Alguna etiqueta ya no está disponible. Vuelve a elegirlas.';
  end if;

  delete from obras_etiquetas where obra_id = p_obra_id and etiqueta_id <> all (v_ids);
  insert into obras_etiquetas (obra_id, etiqueta_id)
    select p_obra_id, x from unnest(v_ids) as x
    on conflict do nothing;

  -- Si la obra ya está abierta, avisa a los oficios de esas especialidades.
  -- (Si está en revisión, el aviso sale cuando se publique: ver el disparador de más abajo.)
  if v_estado = 'abierta' then
    perform avisar_oficios_de_obra(p_obra_id);
  end if;
end;
$$;

-- 4) Obra con etiquetas que pasa a "abierta" (p. ej. la publica 3B tras revisarla).
create or replace function notificar_obra_abierta_por_etiquetas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado::text = 'abierta' and old.estado::text is distinct from 'abierta' then
    perform avisar_oficios_de_obra(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function notificar_obra_abierta_por_etiquetas() from public, anon, authenticated;

drop trigger if exists trg_obra_abierta_avisar_etiquetas on obras;
create trigger trg_obra_abierta_avisar_etiquetas
  after update of estado on obras
  for each row execute function notificar_obra_abierta_por_etiquetas();

revoke execute on function asignar_etiquetas_obra(uuid, uuid[]) from public, anon;
grant execute on function asignar_etiquetas_obra(uuid, uuid[]) to authenticated;