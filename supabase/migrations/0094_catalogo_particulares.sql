-- ============================================================================
-- 0094 · Catálogo de precios para particulares (BORRADOR, no aplicar sin autorización)
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0070 y 0071 (motor de precios, fuentes y licencias) y 0072 (anon cerrado).
--
-- Qué añade
--   1) Categorías (Baño, Cocina...) y partidas del catálogo, con unidad, cantidades permitidas y acabados.
--   2) UN SOLO precio de referencia para toda España por partida, acabado y modalidad
--      (con materiales / solo mano de obra). Sale de la MEDIA DE LAS ZONAS de las referencias de la 0070:
--        · primero se promedia cada zona (municipio, provincia, comunidad o nacional);
--        · después se promedia entre zonas. Rango = zona más barata – zona más cara.
--      Solo cuentan referencias de fuentes con licencia «permitida» y permiso para almacenar (control de la 0071),
--      vigentes y dentro de la antigüedad máxima. Si hay menos zonas que el mínimo, NO se calcula: revisión manual.
--   3) Un precio nunca es visible para los particulares hasta que un administrador lo aprueba (borrador → publicado).
--      Nada se publica solo, y el catálogo entero tiene un interruptor (ajustes_catalogo.activo) APAGADO por defecto.
--   4) Estimación automática: el particular elige partidas y cantidades; el servidor calcula el rango con los precios
--      publicados. El cliente nunca envía precios.
--   5) Solicitudes: la cesta del catálogo o el formulario «Otro» (proyecto personalizado) llegan a Administración,
--      que las revisa. No se contrata nada, no se envían correos, no se crean tareas programadas y no se borra nada.
--
-- NO se cargan precios ni partidas de ejemplo (solo las 11 categorías). Los 124 apartados de
-- docs/precios/partidas_catalogo_inicial.csv se asignan a categorías desde el panel.
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Ajustes e interruptor
-- ---------------------------------------------------------------------------
create table if not exists ajustes_catalogo (
  id boolean primary key default true check (id),
  activo boolean not null default false,
  min_zonas integer not null default 3 check (min_zonas >= 1),
  antiguedad_max_meses integer not null default 36 check (antiguedad_max_meses between 1 and 120),
  max_solicitudes_dia integer not null default 10 check (max_solicitudes_dia between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into ajustes_catalogo (id) values (true) on conflict (id) do nothing;

-- ¿Es personal de administración? (patrón seguro con NULL: sin sesión devuelve false)
create or replace function catalogo_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role()::text, '') in ('admin', 'superadmin');
$$;
revoke all on function catalogo_es_admin() from public, anon;
grant execute on function catalogo_es_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Categorías
-- ---------------------------------------------------------------------------
create table if not exists catalogo_categorias (
  codigo text primary key check (codigo ~ '^[a-z0-9_]{2,30}$'),
  nombre text not null check (length(btrim(nombre)) between 2 and 40),
  icono text not null check (icono ~ '^[a-z0-9_]{2,30}$'),
  es_formulario boolean not null default false,
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

insert into catalogo_categorias (codigo, nombre, icono, es_formulario, orden) values
  ('reforma_integral', 'Reforma integral', 'casa',     false, 1),
  ('bano',             'Baño',             'banera',   false, 2),
  ('cocina',           'Cocina',           'cocina',   false, 3),
  ('suelos',           'Suelos',           'capas',    false, 4),
  ('pintura',          'Pintura',          'rodillo',  false, 5),
  ('electricidad',     'Electricidad',     'rayo',     false, 6),
  ('fontaneria',       'Fontanería',       'gota',     false, 7),
  ('carpinteria',      'Carpintería',      'puerta',   false, 8),
  ('ventanas',         'Ventanas',         'ventana',  false, 9),
  ('fachada',          'Fachada',          'edificio', false, 10),
  ('otro',             'Otro',             'mas',      true,  11)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Partidas del catálogo y acabados
-- ---------------------------------------------------------------------------
create table if not exists catalogo_partidas (
  id uuid primary key default gen_random_uuid(),
  categoria_codigo text not null references catalogo_categorias (codigo),
  subcategoria text check (subcategoria is null or length(btrim(subcategoria)) between 2 and 40),
  nombre text not null check (length(btrim(nombre)) between 3 and 120),
  descripcion text not null default '' check (length(descripcion) <= 500),
  incluye text check (incluye is null or length(incluye) <= 200),
  unidad text not null check (btrim(unidad) <> ''),
  unidad_norm text,
  cantidad_defecto numeric(12,2) not null default 1 check (cantidad_defecto > 0),
  cantidad_min numeric(12,2) not null default 1 check (cantidad_min > 0),
  cantidad_max numeric(12,2) not null default 1000 check (cantidad_max >= cantidad_min),
  imagen_path text check (imagen_path is null or length(imagen_path) <= 200),
  orden integer not null default 0,
  activa boolean not null default false,          -- nace oculta: se activa a mano
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_partidas_defecto_en_rango check (cantidad_defecto between cantidad_min and cantidad_max)
);
create index if not exists idx_catalogo_partidas_cat on catalogo_partidas (categoria_codigo, orden);

create or replace function trg_catalogo_partidas_antes()
returns trigger
language plpgsql
as $$
begin
  new.unidad_norm := normalizar_unidad(new.unidad);
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_catalogo_partidas_antes on catalogo_partidas;
create trigger trg_catalogo_partidas_antes before insert or update on catalogo_partidas
  for each row execute function trg_catalogo_partidas_antes();

-- Qué referencia (partida_codigo de precios_referencia) alimenta cada acabado. Coincidencia EXACTA por código y unidad:
-- no hay búsqueda aproximada ni precios estimados. 'unico' = partida sin distinción de acabado.
create table if not exists catalogo_partida_acabados (
  partida_id uuid not null references catalogo_partidas (id) on delete cascade,
  acabado text not null check (acabado in ('unico', 'basico', 'medio', 'alto')),
  referencia_codigo text not null check (btrim(referencia_codigo) <> ''),
  primary key (partida_id, acabado)
);

-- ---------------------------------------------------------------------------
-- 3) Precios nacionales (borrador → publicado con aprobación)
-- ---------------------------------------------------------------------------
create table if not exists catalogo_precios (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references catalogo_partidas (id) on delete cascade,
  acabado text not null check (acabado in ('unico', 'basico', 'medio', 'alto')),
  modalidad text not null check (modalidad in ('solo_mano_obra', 'mano_obra_materiales')),
  precio_bajo numeric(14,4) not null check (precio_bajo > 0),
  precio_ref numeric(14,4) not null check (precio_ref > 0),
  precio_alto numeric(14,4) not null check (precio_alto > 0),
  num_zonas integer not null check (num_zonas >= 1),
  num_referencias integer not null check (num_referencias >= 1),
  fuentes jsonb not null default '[]'::jsonb check (jsonb_typeof(fuentes) = 'array'),
  calculado_en timestamptz not null default now(),
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado', 'retirado')),
  aprobado_por uuid,
  aprobado_en timestamptz,
  motivo text check (motivo is null or length(motivo) <= 300),
  constraint catalogo_precios_orden check (precio_bajo <= precio_ref and precio_ref <= precio_alto),
  constraint catalogo_precios_aprobado check (estado <> 'publicado' or (aprobado_por is not null and aprobado_en is not null))
);
create unique index if not exists uq_catalogo_precio_publicado
  on catalogo_precios (partida_id, acabado, modalidad) where estado = 'publicado';
create unique index if not exists uq_catalogo_precio_borrador
  on catalogo_precios (partida_id, acabado, modalidad) where estado = 'borrador';

-- ---------------------------------------------------------------------------
-- 4) Solicitudes de los particulares
-- ---------------------------------------------------------------------------
create table if not exists catalogo_solicitudes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('catalogo', 'personalizado')),
  modalidad text check (modalidad is null or modalidad in ('solo_mano_obra', 'mano_obra_materiales')),
  estado text not null default 'enviada' check (estado in ('enviada', 'en_revision', 'publicada_como_obra', 'descartada', 'cancelada')),
  total_bajo numeric(14,2),
  total_alto numeric(14,2),
  parcial boolean not null default false,
  descripcion text check (descripcion is null or length(descripcion) <= 2000),
  tipo_trabajo text check (tipo_trabajo is null or tipo_trabajo in ('reforma', 'ampliacion', 'exterior', 'reparacion', 'otro')),
  superficie_m2 numeric(10,2) check (superficie_m2 is null or (superficie_m2 > 0 and superficie_m2 <= 100000)),
  plazo text check (plazo is null or plazo in ('urgente', '1_mes', '3_meses', 'sin_prisa')),
  fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 8),
  obra_id uuid references obras (id) on delete set null,
  revisada_por uuid,
  revisada_en timestamptz,
  notas_admin text check (notas_admin is null or length(notas_admin) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_solicitud_personalizada check (tipo <> 'personalizado' or length(btrim(coalesce(descripcion, ''))) >= 10)
);
create index if not exists idx_catalogo_solicitudes_usuario on catalogo_solicitudes (usuario_id, created_at desc);
create index if not exists idx_catalogo_solicitudes_estado on catalogo_solicitudes (estado, created_at desc);

create table if not exists catalogo_solicitud_lineas (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references catalogo_solicitudes (id) on delete cascade,
  partida_id uuid references catalogo_partidas (id) on delete set null,
  nombre text not null,
  unidad text not null,
  acabado text not null,
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_bajo numeric(14,4),
  precio_alto numeric(14,4),
  subtotal_bajo numeric(14,2),
  subtotal_alto numeric(14,2),
  sin_precio boolean not null default false
);
create index if not exists idx_catalogo_lineas_solicitud on catalogo_solicitud_lineas (solicitud_id);

-- ---------------------------------------------------------------------------
-- 5) Historial de cambios (reutiliza el de la 0070)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ajustes_catalogo', 'catalogo_categorias', 'catalogo_partidas', 'catalogo_partida_acabados', 'catalogo_precios']
  loop
    execute format('drop trigger if exists trg_hist_%1$s on %1$I', t);
    execute format('create trigger trg_hist_%1$s after insert or update or delete on %1$I for each row execute function trg_config_precios_historial()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Permisos: RLS + GRANTs (defensa en profundidad, como en la 0093)
--    · Administración gestiona todo desde el panel (política «admin»).
--    · Los particulares NO leen precios ni partidas directamente: usan las funciones de la sección 8.
--    · Solo leen las categorías activas y sus propias solicitudes. Las solicitudes se crean únicamente por función.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ajustes_catalogo', 'catalogo_categorias', 'catalogo_partidas', 'catalogo_partida_acabados',
                           'catalogo_precios', 'catalogo_solicitudes', 'catalogo_solicitud_lineas']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format($p$create policy %I on %I for all to authenticated using (catalogo_es_admin()) with check (catalogo_es_admin())$p$, t || '_admin', t);
    execute format('revoke all on table %I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table %I to authenticated', t);
  end loop;
end $$;

-- Las solicitudes y sus líneas no se crean ni se borran con acceso directo: solo función (y el personal puede revisarlas)
revoke insert, delete on table catalogo_solicitudes from authenticated;
revoke insert, delete on table catalogo_solicitud_lineas from authenticated;

drop policy if exists catalogo_categorias_leer on catalogo_categorias;
create policy catalogo_categorias_leer on catalogo_categorias for select to authenticated using (activa);

drop policy if exists catalogo_solicitudes_propias on catalogo_solicitudes;
create policy catalogo_solicitudes_propias on catalogo_solicitudes for select to authenticated using (usuario_id = auth.uid());

drop policy if exists catalogo_lineas_propias on catalogo_solicitud_lineas;
create policy catalogo_lineas_propias on catalogo_solicitud_lineas for select to authenticated
  using (exists (select 1 from catalogo_solicitudes s where s.id = solicitud_id and s.usuario_id = auth.uid()));

-- Un particular no puede modificar sus solicitudes por acceso directo (la política «admin» es la única de escritura)
revoke update on table catalogo_solicitudes from authenticated;
grant update (estado, revisada_por, revisada_en, notas_admin, obra_id, updated_at) on table catalogo_solicitudes to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Cálculo del precio nacional (solo administración)
-- ---------------------------------------------------------------------------
create or replace function catalogo_calcular_precio(p_partida uuid, p_acabado text, p_modalidad text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part catalogo_partidas%rowtype;
  v_ref text;
  v_aj ajustes_catalogo%rowtype;
  v_zonas integer; v_refs integer;
  v_min numeric; v_max numeric; v_avg numeric;
  v_fuentes jsonb;
  v_id uuid;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede calcular precios.';
  end if;
  if p_modalidad not in ('solo_mano_obra', 'mano_obra_materiales') then
    raise exception 'Modalidad no válida.';
  end if;
  select * into v_part from catalogo_partidas where id = p_partida;
  if not found then raise exception 'La partida no existe.'; end if;
  select referencia_codigo into v_ref from catalogo_partida_acabados where partida_id = p_partida and acabado = p_acabado;
  if v_ref is null then
    return jsonb_build_object('ok', false, 'motivo', 'La partida no tiene una referencia asignada para ese acabado.');
  end if;
  select * into v_aj from ajustes_catalogo where id;

  with validas as (
    select r.id, r.fuente_id,
           case p_modalidad when 'mano_obra_materiales' then r.precio_unitario else r.precio_mano_obra end as precio,
           r.ambito_tipo || ':' || coalesce(r.ambito_codigo, r.ambito_valor, '') as zona
      from precios_referencia r
      join precios_fuentes f on f.id = r.fuente_id
     where r.vigente
       and f.activa and f.permite_almacenar and f.licencia_estado = 'permitida'
       and r.partida_codigo = v_ref
       and r.unidad_norm = v_part.unidad_norm
       and r.fecha_precio >= (current_date - make_interval(months => v_aj.antiguedad_max_meses))
       and (case p_modalidad when 'mano_obra_materiales' then r.precio_unitario else r.precio_mano_obra end) > 0
  ), porzona as (
    select zona, avg(precio) as p from validas group by zona
  )
  select (select count(*) from porzona), (select count(*) from validas),
         (select min(p) from porzona), (select max(p) from porzona), (select avg(p) from porzona),
         (select coalesce(jsonb_agg(distinct f.nombre), '[]'::jsonb) from validas v join precios_fuentes f on f.id = v.fuente_id)
    into v_zonas, v_refs, v_min, v_max, v_avg, v_fuentes;

  if v_zonas < v_aj.min_zonas then
    return jsonb_build_object('ok', false, 'zonas', v_zonas, 'referencias', v_refs, 'minimo_zonas', v_aj.min_zonas,
      'motivo', 'Hay menos zonas con referencias válidas que el mínimo exigido: revisión manual.');
  end if;

  delete from catalogo_precios where partida_id = p_partida and acabado = p_acabado and modalidad = p_modalidad and estado = 'borrador';
  insert into catalogo_precios (partida_id, acabado, modalidad, precio_bajo, precio_ref, precio_alto, num_zonas, num_referencias, fuentes)
  values (p_partida, p_acabado, p_modalidad, round(v_min, 4), round(v_avg, 4), round(v_max, 4), v_zonas, v_refs, v_fuentes)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'precio_bajo', round(v_min, 2), 'precio_ref', round(v_avg, 2),
    'precio_alto', round(v_max, 2), 'zonas', v_zonas, 'referencias', v_refs, 'fuentes', v_fuentes,
    'estado', 'borrador');
end;
$$;
revoke all on function catalogo_calcular_precio(uuid, text, text) from public, anon;
grant execute on function catalogo_calcular_precio(uuid, text, text) to authenticated;

-- Publicar = aprobación explícita de una persona de administración
create or replace function catalogo_publicar_precio(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v catalogo_precios%rowtype;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede publicar precios.';
  end if;
  select * into v from catalogo_precios where id = p_id for update;
  if not found then raise exception 'El precio no existe.'; end if;
  if v.estado <> 'borrador' then raise exception 'Solo se pueden publicar precios en borrador.'; end if;
  update catalogo_precios set estado = 'retirado'
   where partida_id = v.partida_id and acabado = v.acabado and modalidad = v.modalidad and estado = 'publicado';
  update catalogo_precios
     set estado = 'publicado', aprobado_por = auth.uid(), aprobado_en = now(), motivo = left(p_motivo, 300)
   where id = p_id;
end;
$$;
revoke all on function catalogo_publicar_precio(uuid, text) from public, anon;
grant execute on function catalogo_publicar_precio(uuid, text) to authenticated;

create or replace function catalogo_retirar_precio(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede retirar precios.';
  end if;
  update catalogo_precios set estado = 'retirado', motivo = left(p_motivo, 300) where id = p_id and estado in ('publicado', 'borrador');
  if not found then raise exception 'No hay un precio publicado o en borrador con ese identificador.'; end if;
end;
$$;
revoke all on function catalogo_retirar_precio(uuid, text) from public, anon;
grant execute on function catalogo_retirar_precio(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Funciones para los particulares (el servidor calcula; el cliente nunca manda precios)
-- ---------------------------------------------------------------------------
create or replace function catalogo_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select activo from ajustes_catalogo where id), false);
$$;
revoke all on function catalogo_activo() from public, anon;
grant execute on function catalogo_activo() to authenticated;

-- Lista del catálogo: solo partidas activas con al menos un precio publicado
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
      'imagen_path', p.imagen_path,
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

-- Cálculo interno de la cesta (no ejecutable desde fuera)
create or replace function catalogo_estimar_interno(p_lineas jsonb, p_modalidad text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l jsonb; v_n integer := 0;
  v_id uuid; v_cant numeric; v_ac text;
  p catalogo_partidas%rowtype; pr catalogo_precios%rowtype;
  v_lineas jsonb := '[]'::jsonb;
  v_bajo numeric := 0; v_alto numeric := 0; v_parcial boolean := false;
  v_sb numeric; v_sa numeric; v_sin boolean;
begin
  if p_modalidad not in ('solo_mano_obra', 'mano_obra_materiales') then
    raise exception 'Elige si el precio incluye materiales o solo mano de obra.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Añade al menos una partida.';
  end if;
  if jsonb_array_length(p_lineas) > 60 then
    raise exception 'Máximo 60 partidas por solicitud.';
  end if;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_n := v_n + 1;
    begin
      v_id := (l ->> 'partida_id')::uuid;
      v_cant := round((l ->> 'cantidad')::numeric, 2);
      v_ac := coalesce(nullif(l ->> 'acabado', ''), 'unico');
    exception when others then
      raise exception 'La línea % no es válida.', v_n;
    end;
    if v_ac not in ('unico', 'basico', 'medio', 'alto') then
      raise exception 'La línea % tiene un acabado no válido.', v_n;
    end if;
    select pa.* into p from catalogo_partidas pa join catalogo_categorias c on c.codigo = pa.categoria_codigo
     where pa.id = v_id and pa.activa and c.activa;
    if not found then
      raise exception 'Una de las partidas ya no está disponible.';
    end if;
    if v_cant is null or v_cant < p.cantidad_min or v_cant > p.cantidad_max then
      raise exception 'La cantidad de «%» debe estar entre % y % %.', p.nombre, p.cantidad_min, p.cantidad_max, p.unidad;
    end if;
    select * into pr from catalogo_precios
     where partida_id = v_id and acabado = v_ac and modalidad = p_modalidad and estado = 'publicado';
    v_sin := not found;
    if v_sin then
      v_parcial := true; v_sb := null; v_sa := null;
    else
      v_sb := round(v_cant * pr.precio_bajo, 2); v_sa := round(v_cant * pr.precio_alto, 2);
      v_bajo := v_bajo + v_sb; v_alto := v_alto + v_sa;
    end if;
    v_lineas := v_lineas || jsonb_build_object(
      'partida_id', p.id, 'nombre', p.nombre, 'unidad', p.unidad, 'acabado', v_ac, 'cantidad', v_cant,
      'precio_bajo', case when v_sin then null else round(pr.precio_bajo, 2) end,
      'precio_alto', case when v_sin then null else round(pr.precio_alto, 2) end,
      'subtotal_bajo', v_sb, 'subtotal_alto', v_sa, 'sin_precio', v_sin);
  end loop;

  return jsonb_build_object('lineas', v_lineas, 'total_bajo', v_bajo, 'total_alto', v_alto, 'parcial', v_parcial,
    'modalidad', p_modalidad, 'orientativo', true, 'iva', 'a_confirmar');
end;
$$;
revoke all on function catalogo_estimar_interno(jsonb, text) from public, anon, authenticated;

create or replace function catalogo_estimar(p_lineas jsonb, p_modalidad text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not catalogo_activo() then raise exception 'El catálogo todavía no está disponible.'; end if;
  return catalogo_estimar_interno(p_lineas, p_modalidad);
end;
$$;
revoke all on function catalogo_estimar(jsonb, text) from public, anon;
grant execute on function catalogo_estimar(jsonb, text) to authenticated;

-- Enviar la cesta (tipo catalogo) o el formulario «Otro» (tipo personalizado) a Administración
create or replace function catalogo_enviar_solicitud(
  p_tipo text,
  p_modalidad text default null,
  p_lineas jsonb default '[]'::jsonb,
  p_descripcion text default null,
  p_tipo_trabajo text default null,
  p_superficie numeric default null,
  p_plazo text default null,
  p_fotos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_max integer; v_est jsonb; v_id uuid; f jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform exigir_cuenta_activa();
  if not catalogo_activo() then raise exception 'El catálogo todavía no está disponible.'; end if;
  if p_tipo not in ('catalogo', 'personalizado') then raise exception 'Tipo de solicitud no válido.'; end if;

  select max_solicitudes_dia into v_max from ajustes_catalogo where id;
  if (select count(*) from catalogo_solicitudes where usuario_id = v_uid and created_at > now() - interval '24 hours') >= v_max then
    raise exception 'Has enviado muchas solicitudes hoy. Inténtalo mañana o espera a que las revisemos.';
  end if;

  if p_fotos is null or jsonb_typeof(p_fotos) <> 'array' or jsonb_array_length(p_fotos) > 8 then
    raise exception 'Máximo 8 fotos.';
  end if;
  for f in select * from jsonb_array_elements(p_fotos) loop
    if jsonb_typeof(f) <> 'string' or length(f #>> '{}') > 200 or (f #>> '{}') like '%..%'
       or left(f #>> '{}', length(v_uid::text) + 1) <> v_uid::text || '/' then
      raise exception 'Una de las fotos no es válida.';
    end if;
  end loop;

  if p_tipo = 'catalogo' then
    v_est := catalogo_estimar_interno(p_lineas, p_modalidad);
    insert into catalogo_solicitudes (usuario_id, tipo, modalidad, total_bajo, total_alto, parcial, fotos)
    values (v_uid, 'catalogo', p_modalidad, (v_est ->> 'total_bajo')::numeric, (v_est ->> 'total_alto')::numeric,
            (v_est ->> 'parcial')::boolean, p_fotos)
    returning id into v_id;
    insert into catalogo_solicitud_lineas (solicitud_id, partida_id, nombre, unidad, acabado, cantidad, precio_bajo, precio_alto, subtotal_bajo, subtotal_alto, sin_precio)
    select v_id, (x ->> 'partida_id')::uuid, x ->> 'nombre', x ->> 'unidad', x ->> 'acabado', (x ->> 'cantidad')::numeric,
           (x ->> 'precio_bajo')::numeric, (x ->> 'precio_alto')::numeric,
           (x ->> 'subtotal_bajo')::numeric, (x ->> 'subtotal_alto')::numeric, (x ->> 'sin_precio')::boolean
      from jsonb_array_elements(v_est -> 'lineas') x;
  else
    if length(btrim(coalesce(p_descripcion, ''))) < 10 or length(p_descripcion) > 2000 then
      raise exception 'Describe el proyecto con al menos 10 caracteres.';
    end if;
    insert into catalogo_solicitudes (usuario_id, tipo, descripcion, tipo_trabajo, superficie_m2, plazo, fotos)
    values (v_uid, 'personalizado', btrim(p_descripcion), p_tipo_trabajo, p_superficie, p_plazo, p_fotos)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function catalogo_enviar_solicitud(text, text, jsonb, text, text, numeric, text, jsonb) from public, anon;
grant execute on function catalogo_enviar_solicitud(text, text, jsonb, text, text, numeric, text, jsonb) to authenticated;

-- El particular puede cancelar su solicitud mientras Administración no la haya empezado a revisar
create or replace function catalogo_cancelar_solicitud(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  update catalogo_solicitudes set estado = 'cancelada', updated_at = now()
   where id = p_id and usuario_id = auth.uid() and estado = 'enviada';
  if not found then raise exception 'No se puede cancelar esta solicitud.'; end if;
end;
$$;
revoke all on function catalogo_cancelar_solicitud(uuid) from public, anon;
grant execute on function catalogo_cancelar_solicitud(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Comprobación (solo lectura). Esperado: catálogo apagado, 0 partidas, 0 precios.
-- ---------------------------------------------------------------------------
-- select (select activo from ajustes_catalogo) as catalogo_activo,
--        (select count(*) from catalogo_categorias) as categorias,
--        (select count(*) from catalogo_partidas) as partidas,
--        (select count(*) from catalogo_precios) as precios;
--
-- ROLLBACK (solo si no hay solicitudes reales; no hay datos de otras tablas implicados):
-- drop table if exists catalogo_solicitud_lineas, catalogo_solicitudes, catalogo_precios,
--   catalogo_partida_acabados, catalogo_partidas, catalogo_categorias, ajustes_catalogo cascade;
-- drop function if exists catalogo_calcular_precio(uuid, text, text), catalogo_publicar_precio(uuid, text),
--   catalogo_retirar_precio(uuid, text), catalogo_listar(text, text), catalogo_estimar_interno(jsonb, text),
--   catalogo_estimar(jsonb, text), catalogo_enviar_solicitud(text, text, jsonb, text, text, numeric, text, jsonb),
--   catalogo_cancelar_solicitud(uuid), catalogo_activo(), catalogo_es_admin(), trg_catalogo_partidas_antes();