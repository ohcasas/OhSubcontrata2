-- ============================================================================
-- 0101 · Catálogo: alta manual desde el panel y consultas de proveedores (BORRADOR, no aplicar sin autorización)
-- ============================================================================
-- REQUISITO: haber ejecutado antes la 0094 (catálogo de particulares).
--
-- Qué añade
--   1) Un icono propio por partida (catalogo_partidas.icono).
--   2) Precios MANUALES: administración escribe el precio de cada partida por acabado (básico, medio, alto) y por
--      modalidad (con materiales / solo mano de obra). Mismas reglas que los calculados: nada es visible para los
--      particulares hasta que una persona de administración lo publica, y cada cambio queda en el historial.
--   3) Funciones del panel para crear, editar, duplicar, publicar y ocultar partidas (no se borra nada).
--   4) Consultas de proveedores: una empresa puede ver el catálogo y escribir a 3B Conecta sobre una partida.
--      No se envía ningún correo ni se crea ninguna tarea programada: administración las ve en el panel.
--
-- El interruptor general del catálogo (ajustes_catalogo.activo) NO se toca: sigue como esté.
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Icono por partida y origen del precio
-- ---------------------------------------------------------------------------
alter table catalogo_partidas
  add column if not exists icono text check (icono is null or icono ~ '^[a-z0-9_]{2,30}$');

alter table catalogo_precios
  add column if not exists origen text not null default 'referencias' check (origen in ('referencias', 'manual'));

-- Un precio calculado exige zonas y referencias; uno manual no.
alter table catalogo_precios drop constraint if exists catalogo_precios_num_zonas_check;
alter table catalogo_precios drop constraint if exists catalogo_precios_num_referencias_check;
alter table catalogo_precios drop constraint if exists catalogo_precios_origen_ok;
alter table catalogo_precios add constraint catalogo_precios_origen_ok
  check (origen = 'manual' or (num_zonas >= 1 and num_referencias >= 1));

-- ---------------------------------------------------------------------------
-- 2) Guardar una partida (datos básicos). Nace oculta: se publica aparte.
-- ---------------------------------------------------------------------------
create or replace function panel_cat_guardar_partida(
  p_id uuid,
  p_categoria text,
  p_nombre text,
  p_descripcion text,
  p_incluye text,
  p_unidad text,
  p_cant_defecto numeric,
  p_cant_min numeric,
  p_cant_max numeric,
  p_icono text default null,
  p_subcategoria text default null,
  p_orden integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede editar el catálogo.';
  end if;
  if not exists (select 1 from catalogo_categorias where codigo = p_categoria and not es_formulario) then
    raise exception 'La categoría no es válida.';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 3 or length(btrim(p_nombre)) > 120 then
    raise exception 'El nombre debe tener entre 3 y 120 caracteres.';
  end if;
  if p_unidad is null or btrim(p_unidad) = '' then
    raise exception 'Indica la unidad (m², ud, m...).';
  end if;
  if coalesce(p_cant_min, 0) <= 0 or coalesce(p_cant_max, 0) < p_cant_min
     or coalesce(p_cant_defecto, 0) < p_cant_min or p_cant_defecto > p_cant_max then
    raise exception 'Las cantidades no son coherentes: el mínimo debe ser mayor que 0 y la cantidad por defecto debe estar entre el mínimo y el máximo.';
  end if;
  if p_icono is not null and p_icono !~ '^[a-z0-9_]{2,30}$' then
    raise exception 'El icono no es válido.';
  end if;

  if p_id is null then
    insert into catalogo_partidas (categoria_codigo, subcategoria, nombre, descripcion, incluye, unidad,
                                   cantidad_defecto, cantidad_min, cantidad_max, icono, orden, activa)
    values (p_categoria, nullif(btrim(p_subcategoria), ''), btrim(p_nombre), left(coalesce(p_descripcion, ''), 500),
            nullif(left(btrim(coalesce(p_incluye, '')), 200), ''), btrim(p_unidad),
            p_cant_defecto, p_cant_min, p_cant_max, p_icono, coalesce(p_orden, 0), false)
    returning id into v_id;
  else
    update catalogo_partidas
       set categoria_codigo = p_categoria, subcategoria = nullif(btrim(p_subcategoria), ''),
           nombre = btrim(p_nombre), descripcion = left(coalesce(p_descripcion, ''), 500),
           incluye = nullif(left(btrim(coalesce(p_incluye, '')), 200), ''), unidad = btrim(p_unidad),
           cantidad_defecto = p_cant_defecto, cantidad_min = p_cant_min, cantidad_max = p_cant_max,
           icono = p_icono, orden = coalesce(p_orden, 0)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'La partida no existe.'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function panel_cat_guardar_partida(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, integer) from public, anon;
grant execute on function panel_cat_guardar_partida(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Guardar los precios de una partida (la cuadrícula completa: acabado × modalidad)
--    p_precios = [{"acabado":"basico","modalidad":"mano_obra_materiales","ref":123.45,"bajo":110,"alto":140}, ...]
--    · ref vacío (null) = quitar ese precio (se retira el publicado y se borra el borrador).
--    · bajo y alto son opcionales: si faltan valen lo mismo que ref.
--    · p_publicar = true: lo guardado queda publicado (aprobación explícita de quien llama).
-- ---------------------------------------------------------------------------
create or replace function panel_cat_guardar_precios(
  p_partida uuid,
  p_precios jsonb,
  p_publicar boolean default false,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e jsonb; v_ac text; v_mod text;
  v_ref numeric; v_bajo numeric; v_alto numeric;
  v_id uuid; v_pub catalogo_precios%rowtype;
  v_guardados integer := 0; v_publicados integer := 0; v_quitados integer := 0; v_iguales integer := 0;
  v_con numeric; v_sin numeric; a text;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede editar precios.';
  end if;
  if not exists (select 1 from catalogo_partidas where id = p_partida) then
    raise exception 'La partida no existe.';
  end if;
  if p_precios is null or jsonb_typeof(p_precios) <> 'array' or jsonb_array_length(p_precios) > 24 then
    raise exception 'Los precios no son válidos.';
  end if;

  -- Regla de coherencia: «solo mano de obra» no puede costar más que «con materiales» en el mismo acabado.
  foreach a in array array['unico', 'basico', 'medio', 'alto'] loop
    select max((x ->> 'ref')::numeric) filter (where x ->> 'modalidad' = 'mano_obra_materiales'),
           max((x ->> 'ref')::numeric) filter (where x ->> 'modalidad' = 'solo_mano_obra')
      into v_con, v_sin
      from jsonb_array_elements(p_precios) x
     where x ->> 'acabado' = a and nullif(x ->> 'ref', '') is not null;
    if v_con is not null and v_sin is not null and v_sin > v_con then
      raise exception 'En el acabado «%», «sin materiales» (%) no puede costar más que «con materiales» (%).', a, v_sin, v_con;
    end if;
  end loop;

  for e in select * from jsonb_array_elements(p_precios) loop
    v_ac := e ->> 'acabado'; v_mod := e ->> 'modalidad';
    if v_ac not in ('unico', 'basico', 'medio', 'alto') or v_mod not in ('solo_mano_obra', 'mano_obra_materiales') then
      raise exception 'Hay un precio con acabado o modalidad no válidos.';
    end if;

    if nullif(e ->> 'ref', '') is null then
      -- Quitar este precio
      update catalogo_precios set estado = 'retirado', motivo = left(coalesce(p_motivo, 'Quitado a mano'), 300)
       where partida_id = p_partida and acabado = v_ac and modalidad = v_mod and estado = 'publicado';
      if found then v_quitados := v_quitados + 1; end if;
      delete from catalogo_precios
       where partida_id = p_partida and acabado = v_ac and modalidad = v_mod and estado = 'borrador';
      continue;
    end if;

    begin
      v_ref := round((e ->> 'ref')::numeric, 4);
      v_bajo := round(coalesce(nullif(e ->> 'bajo', '')::numeric, v_ref), 4);
      v_alto := round(coalesce(nullif(e ->> 'alto', '')::numeric, v_ref), 4);
    exception when others then
      raise exception 'Hay un importe que no es un número.';
    end;
    if v_ref <= 0 or v_bajo <= 0 or v_alto <= 0 or v_ref > 1000000 or v_alto > 1000000 then
      raise exception 'Los importes deben ser mayores que 0.';
    end if;
    if not (v_bajo <= v_ref and v_ref <= v_alto) then
      raise exception 'El rango no cuadra (debe ser mínimo ≤ referencia ≤ máximo) en «% / %».', v_ac, v_mod;
    end if;

    -- ¿Ya está publicado exactamente igual? Entonces no se toca nada.
    select * into v_pub from catalogo_precios
     where partida_id = p_partida and acabado = v_ac and modalidad = v_mod and estado = 'publicado';
    if found and p_publicar and v_pub.precio_ref = v_ref and v_pub.precio_bajo = v_bajo and v_pub.precio_alto = v_alto then
      v_iguales := v_iguales + 1;
      delete from catalogo_precios
       where partida_id = p_partida and acabado = v_ac and modalidad = v_mod and estado = 'borrador';
      continue;
    end if;

    delete from catalogo_precios
     where partida_id = p_partida and acabado = v_ac and modalidad = v_mod and estado = 'borrador';
    insert into catalogo_precios (partida_id, acabado, modalidad, precio_bajo, precio_ref, precio_alto,
                                  num_zonas, num_referencias, fuentes, origen, motivo)
    values (p_partida, v_ac, v_mod, v_bajo, v_ref, v_alto, 0, 0, '[]'::jsonb, 'manual', left(p_motivo, 300))
    returning id into v_id;
    v_guardados := v_guardados + 1;

    if p_publicar then
      update catalogo_precios set estado = 'retirado'
       where partida_id = p_partida and acabado = v_ac and modalidad = v_mod and estado = 'publicado';
      update catalogo_precios
         set estado = 'publicado', aprobado_por = auth.uid(), aprobado_en = now()
       where id = v_id;
      v_publicados := v_publicados + 1;
    end if;
  end loop;

  return jsonb_build_object('guardados', v_guardados, 'publicados', v_publicados,
                            'quitados', v_quitados, 'sin_cambios', v_iguales);
end;
$$;
revoke all on function panel_cat_guardar_precios(uuid, jsonb, boolean, text) from public, anon;
grant execute on function panel_cat_guardar_precios(uuid, jsonb, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Mostrar u ocultar una partida (no se borra nada). Para mostrarla hace falta al menos un precio publicado.
-- ---------------------------------------------------------------------------
create or replace function panel_cat_activar(p_id uuid, p_activa boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede publicar partidas.';
  end if;
  if p_activa and not exists (select 1 from catalogo_precios where partida_id = p_id and estado = 'publicado') then
    raise exception 'Publica antes al menos un precio de esta partida.';
  end if;
  update catalogo_partidas set activa = coalesce(p_activa, false) where id = p_id;
  if not found then raise exception 'La partida no existe.'; end if;
end;
$$;
revoke all on function panel_cat_activar(uuid, boolean) from public, anon;
grant execute on function panel_cat_activar(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Duplicar una partida (nace oculta, con sus precios como borrador)
-- ---------------------------------------------------------------------------
create or replace function panel_cat_duplicar(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_nuevo uuid;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede editar el catálogo.';
  end if;
  insert into catalogo_partidas (categoria_codigo, subcategoria, nombre, descripcion, incluye, unidad,
                                 cantidad_defecto, cantidad_min, cantidad_max, icono, orden, activa)
  select categoria_codigo, subcategoria, left(nombre, 108) || ' (copia)', descripcion, incluye, unidad,
         cantidad_defecto, cantidad_min, cantidad_max, icono, orden, false
    from catalogo_partidas where id = p_id
  returning id into v_nuevo;
  if v_nuevo is null then raise exception 'La partida no existe.'; end if;

  insert into catalogo_precios (partida_id, acabado, modalidad, precio_bajo, precio_ref, precio_alto,
                                num_zonas, num_referencias, fuentes, origen, estado)
  select v_nuevo, acabado, modalidad, precio_bajo, precio_ref, precio_alto, 0, 0, '[]'::jsonb, 'manual', 'borrador'
    from catalogo_precios where partida_id = p_id and estado = 'publicado';
  return v_nuevo;
end;
$$;
revoke all on function panel_cat_duplicar(uuid) from public, anon;
grant execute on function panel_cat_duplicar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Lista completa para el panel (incluye partidas ocultas, precios publicados y en borrador)
-- ---------------------------------------------------------------------------
create or replace function panel_cat_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede ver el catálogo completo.';
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'orden_cat', (x ->> 'orden')::int, x ->> 'nombre'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'id', p.id, 'categoria', p.categoria_codigo, 'categoria_nombre', c.nombre, 'orden_cat', lpad(c.orden::text, 3, '0'),
      'subcategoria', p.subcategoria, 'nombre', p.nombre, 'descripcion', p.descripcion, 'incluye', p.incluye,
      'unidad', p.unidad, 'cantidad_defecto', p.cantidad_defecto, 'cantidad_min', p.cantidad_min,
      'cantidad_max', p.cantidad_max, 'icono', p.icono, 'orden', p.orden, 'activa', p.activa,
      'precios', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'acabado', pr.acabado, 'modalidad', pr.modalidad,
                    'estado', pr.estado, 'origen', pr.origen, 'bajo', pr.precio_bajo, 'ref', pr.precio_ref, 'alto', pr.precio_alto))
                  from catalogo_precios pr where pr.partida_id = p.id and pr.estado in ('publicado', 'borrador')), '[]'::jsonb)
    ) as x
    from catalogo_partidas p
    join catalogo_categorias c on c.codigo = p.categoria_codigo
  ) s;
  return v_out;
end;
$$;
revoke all on function panel_cat_listar() from public, anon;
grant execute on function panel_cat_listar() to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Consultas de proveedores a 3B Conecta
-- ---------------------------------------------------------------------------
create table if not exists catalogo_contactos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  partida_id uuid references catalogo_partidas (id) on delete set null,
  mensaje text not null check (length(btrim(mensaje)) between 5 and 1000 and mensaje !~ '[0-9]{13,19}'),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'atendido')),
  atendido_por uuid,
  atendido_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_catalogo_contactos_estado on catalogo_contactos (estado, created_at desc);
create index if not exists idx_catalogo_contactos_usuario on catalogo_contactos (usuario_id, created_at desc);

alter table catalogo_contactos enable row level security;
drop policy if exists catalogo_contactos_admin on catalogo_contactos;
create policy catalogo_contactos_admin on catalogo_contactos for select to authenticated using (catalogo_es_admin());
drop policy if exists catalogo_contactos_propios on catalogo_contactos;
create policy catalogo_contactos_propios on catalogo_contactos for select to authenticated using (usuario_id = auth.uid());
revoke all on table catalogo_contactos from anon, authenticated;
grant select on table catalogo_contactos to authenticated;   -- solo lectura: se crea y se atiende por función

drop trigger if exists trg_hist_catalogo_contactos on catalogo_contactos;
create trigger trg_hist_catalogo_contactos after insert or update or delete on catalogo_contactos
  for each row execute function trg_config_precios_historial();

-- Un proveedor (usuario con empresa) escribe a 3B Conecta. No se manda correo: administración lo ve en el panel.
create or replace function catalogo_contactar(p_partida uuid, p_mensaje text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform exigir_cuenta_activa();
  if auth_empresa_id() is null then
    raise exception 'Solo las empresas proveedoras pueden escribir desde aquí.';
  end if;
  if not catalogo_activo() then raise exception 'El catálogo todavía no está disponible.'; end if;
  if p_partida is not null and not exists (select 1 from catalogo_partidas where id = p_partida and activa) then
    raise exception 'La partida ya no está disponible.';
  end if;
  if p_mensaje is null or length(btrim(p_mensaje)) < 5 or length(p_mensaje) > 1000 then
    raise exception 'Escribe un mensaje de entre 5 y 1000 caracteres.';
  end if;
  if p_mensaje ~ '[0-9]{13,19}' then
    raise exception 'No escribas números de tarjeta ni de cuenta en el mensaje.';
  end if;
  if (select count(*) from catalogo_contactos where usuario_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Has enviado muchas consultas hoy. Espera a que las atendamos.';
  end if;
  insert into catalogo_contactos (usuario_id, partida_id, mensaje) values (v_uid, p_partida, btrim(p_mensaje))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function catalogo_contactar(uuid, text) from public, anon;
grant execute on function catalogo_contactar(uuid, text) to authenticated;

-- Lista de consultas para el panel
create or replace function panel_cat_contactos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede ver las consultas.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'estado', k.estado, 'mensaje', k.mensaje, 'creado', k.created_at,
      'partida', pa.nombre, 'persona', pf.nombre_completo, 'telefono', pf.telefono, 'empresa', e.nombre)
    order by (k.estado = 'nuevo') desc, k.created_at desc), '[]'::jsonb) into v_out
  from catalogo_contactos k
  left join catalogo_partidas pa on pa.id = k.partida_id
  left join profiles pf on pf.id = k.usuario_id
  left join empresas_subcontratistas e on e.id = pf.empresa_id;
  return v_out;
end;
$$;
revoke all on function panel_cat_contactos() from public, anon;
grant execute on function panel_cat_contactos() to authenticated;

create or replace function panel_cat_contacto_atender(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede atender consultas.';
  end if;
  update catalogo_contactos set estado = 'atendido', atendido_por = auth.uid(), atendido_en = now()
   where id = p_id and estado = 'nuevo';
  if not found then raise exception 'La consulta no existe o ya estaba atendida.'; end if;
end;
$$;
revoke all on function panel_cat_contacto_atender(uuid) from public, anon;
grant execute on function panel_cat_contacto_atender(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) El listado para particulares y proveedores también devuelve el icono de la partida
-- ---------------------------------------------------------------------------
create or replace function catalogo_listar(p_categoria text default null, p_busqueda text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_q text := norm_txt(left(p_busqueda, 80)); v_out jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not catalogo_activo() then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by x ->> 'orden_cat', x ->> 'nombre'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'id', p.id, 'categoria', p.categoria_codigo, 'orden_cat', lpad(c.orden::text, 3, '0'), 'subcategoria', p.subcategoria,
      'nombre', p.nombre, 'descripcion', p.descripcion, 'incluye', p.incluye, 'unidad', p.unidad,
      'cantidad_defecto', p.cantidad_defecto, 'cantidad_min', p.cantidad_min, 'cantidad_max', p.cantidad_max,
      'imagen_path', p.imagen_path, 'icono', p.icono,
      'precios', (select jsonb_agg(jsonb_build_object('acabado', pr.acabado, 'modalidad', pr.modalidad,
                    'bajo', round(pr.precio_bajo, 2), 'ref', round(pr.precio_ref, 2), 'alto', round(pr.precio_alto, 2))
                    order by pr.acabado, pr.modalidad)
                  from catalogo_precios pr where pr.partida_id = p.id and pr.estado = 'publicado')
    ) as x
    from catalogo_partidas p
    join catalogo_categorias c on c.codigo = p.categoria_codigo and c.activa
    where p.activa
      and (p_categoria is null or p.categoria_codigo = p_categoria)
      and (v_q is null or strpos(norm_txt(p.nombre), v_q) > 0)
      and exists (select 1 from catalogo_precios pr where pr.partida_id = p.id and pr.estado = 'publicado')
    limit 100
  ) s;
  return v_out;
end;
$$;
revoke all on function catalogo_listar(text, text) from public, anon;
grant execute on function catalogo_listar(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Comprobación (solo lectura)
-- ---------------------------------------------------------------------------
-- select (select activo from ajustes_catalogo) as catalogo_activo,
--        (select count(*) from catalogo_partidas) as partidas,
--        (select count(*) from catalogo_precios where origen = 'manual') as precios_manuales,
--        (select count(*) from catalogo_contactos) as consultas;
--
-- ROLLBACK (no hay datos de otras tablas implicados):
-- drop function if exists panel_cat_guardar_partida(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, integer),
--   panel_cat_guardar_precios(uuid, jsonb, boolean, text), panel_cat_activar(uuid, boolean), panel_cat_duplicar(uuid),
--   panel_cat_listar(), panel_cat_contactos(), panel_cat_contacto_atender(uuid), catalogo_contactar(uuid, text);
-- drop table if exists catalogo_contactos;
-- (catalogo_listar vuelve a su versión de la 0094 volviendo a ejecutar esa función; las columnas nuevas pueden quedarse.)