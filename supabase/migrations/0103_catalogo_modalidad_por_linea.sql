-- 0103 · Catálogo de particulares: «con materiales» / «sin materiales» se elige en CADA línea del pedido.
-- Ejecutar DESPUÉS de 0094, 0101 y 0102. No enciende nada: el catálogo sigue apagado (ajustes_catalogo.activo).
-- Qué cambia:
--   * Cada línea del pedido puede llevar su propia "modalidad". Si una línea no la trae, se usa la general (como antes).
--   * El servidor sigue calculando TODOS los precios (la app nunca envía precios).
--   * Se guarda la modalidad de cada línea en la solicitud. La solicitud queda con modalidad general solo si todas coinciden.
-- No hay borrados ni cambios sobre datos existentes.
begin;

alter table catalogo_solicitud_lineas
  add column if not exists modalidad text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'catalogo_lineas_modalidad_check') then
    alter table catalogo_solicitud_lineas add constraint catalogo_lineas_modalidad_check
      check (modalidad is null or modalidad in ('solo_mano_obra', 'mano_obra_materiales'));
  end if;
end $$;

create or replace function catalogo_estimar_interno(p_lineas jsonb, p_modalidad text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l jsonb; v_n integer := 0;
  v_id uuid; v_cant numeric; v_ac text; v_mod text;
  p catalogo_partidas%rowtype; pr catalogo_precios%rowtype;
  v_lineas jsonb := '[]'::jsonb;
  v_bajo numeric := 0; v_alto numeric := 0; v_parcial boolean := false;
  v_sb numeric; v_sa numeric; v_sin boolean;
  v_mods text[] := '{}';
begin
  if p_modalidad is not null and p_modalidad not in ('solo_mano_obra', 'mano_obra_materiales') then
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
      v_mod := coalesce(nullif(l ->> 'modalidad', ''), p_modalidad);
    exception when others then
      raise exception 'La línea % no es válida.', v_n;
    end;
    if v_ac not in ('unico', 'basico', 'medio', 'alto') then
      raise exception 'La línea % tiene un acabado no válido.', v_n;
    end if;
    if v_mod is null or v_mod not in ('solo_mano_obra', 'mano_obra_materiales') then
      raise exception 'En la línea % elige si incluye materiales o solo mano de obra.', v_n;
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
     where partida_id = v_id and acabado = v_ac and modalidad = v_mod and estado = 'publicado';
    v_sin := not found;
    if v_sin then
      v_parcial := true; v_sb := null; v_sa := null;
    else
      v_sb := round(v_cant * pr.precio_bajo, 2); v_sa := round(v_cant * pr.precio_alto, 2);
      v_bajo := v_bajo + v_sb; v_alto := v_alto + v_sa;
    end if;
    if not (v_mod = any (v_mods)) then v_mods := v_mods || v_mod; end if;
    v_lineas := v_lineas || jsonb_build_object(
      'partida_id', p.id, 'nombre', p.nombre, 'unidad', p.unidad, 'acabado', v_ac, 'modalidad', v_mod, 'cantidad', v_cant,
      'precio_bajo', case when v_sin then null else round(pr.precio_bajo, 2) end,
      'precio_alto', case when v_sin then null else round(pr.precio_alto, 2) end,
      'subtotal_bajo', v_sb, 'subtotal_alto', v_sa, 'sin_precio', v_sin);
  end loop;

  return jsonb_build_object('lineas', v_lineas, 'total_bajo', v_bajo, 'total_alto', v_alto, 'parcial', v_parcial,
    'modalidad', case when array_length(v_mods, 1) = 1 then v_mods[1] else null end, 'orientativo', true, 'iva', 'a_confirmar');
end;
$$;
revoke all on function catalogo_estimar_interno(jsonb, text) from public, anon, authenticated;

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
    values (v_uid, 'catalogo', nullif(v_est ->> 'modalidad', ''), (v_est ->> 'total_bajo')::numeric, (v_est ->> 'total_alto')::numeric,
            (v_est ->> 'parcial')::boolean, p_fotos)
    returning id into v_id;
    insert into catalogo_solicitud_lineas (solicitud_id, partida_id, nombre, unidad, acabado, modalidad, cantidad, precio_bajo, precio_alto, subtotal_bajo, subtotal_alto, sin_precio)
    select v_id, (x ->> 'partida_id')::uuid, x ->> 'nombre', x ->> 'unidad', x ->> 'acabado', x ->> 'modalidad', (x ->> 'cantidad')::numeric,
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

-- La estimación pública acepta ahora p_modalidad nulo (cada línea trae la suya)
create or replace function catalogo_estimar(p_lineas jsonb, p_modalidad text default null)
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

commit;