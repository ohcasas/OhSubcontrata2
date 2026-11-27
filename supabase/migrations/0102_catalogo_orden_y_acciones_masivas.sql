-- ============================================================================
-- 0102 · Catálogo: orden manual y acciones en bloque desde el panel (BORRADOR, no aplicar sin autorización)
-- ============================================================================
-- REQUISITO: haber ejecutado antes la 0094 y la 0101.
--
--   1) panel_cat_orden: guarda el orden en que administración coloca las partidas (arrastrando en el panel).
--   2) panel_cat_masivo: mostrar, ocultar o cambiar de categoría varias partidas a la vez.
--      «Mostrar» solo afecta a las que ya tienen algún precio publicado (como en la 0101); no borra nada.
--   3) catalogo_listar (lo que ven particulares y proveedores) respeta ese orden dentro de cada categoría.
--
-- Idempotente. No toca el interruptor general del catálogo.
-- ============================================================================

create or replace function panel_cat_orden(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede ordenar el catálogo.';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null or array_length(p_ids, 1) > 500 then
    raise exception 'La lista de partidas no es válida.';
  end if;
  update catalogo_partidas p
     set orden = x.pos::integer
    from unnest(p_ids) with ordinality as x(id, pos)
   where p.id = x.id;
end;
$$;
revoke all on function panel_cat_orden(uuid[]) from public, anon;
grant execute on function panel_cat_orden(uuid[]) to authenticated;

create or replace function panel_cat_masivo(p_ids uuid[], p_accion text, p_valor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer := 0; v_omitidas integer := 0;
begin
  if not catalogo_es_admin() then
    raise exception 'Solo el personal de administración puede editar el catálogo.';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null or array_length(p_ids, 1) > 500 then
    raise exception 'La lista de partidas no es válida.';
  end if;

  if p_accion = 'ocultar' then
    update catalogo_partidas set activa = false where id = any(p_ids) and activa;
    get diagnostics v_n = row_count;
  elsif p_accion = 'mostrar' then
    update catalogo_partidas p set activa = true
     where p.id = any(p_ids) and not p.activa
       and exists (select 1 from catalogo_precios pr where pr.partida_id = p.id and pr.estado = 'publicado');
    get diagnostics v_n = row_count;
    select count(*) into v_omitidas from catalogo_partidas p
     where p.id = any(p_ids) and not p.activa;
  elsif p_accion = 'categoria' then
    if not exists (select 1 from catalogo_categorias where codigo = p_valor and not es_formulario) then
      raise exception 'La categoría no es válida.';
    end if;
    update catalogo_partidas set categoria_codigo = p_valor where id = any(p_ids) and categoria_codigo <> p_valor;
    get diagnostics v_n = row_count;
  else
    raise exception 'Acción no válida.';
  end if;
  return jsonb_build_object('cambiadas', v_n, 'sin_precio_publicado', v_omitidas);
end;
$$;
revoke all on function panel_cat_masivo(uuid[], text, text) from public, anon;
grant execute on function panel_cat_masivo(uuid[], text, text) to authenticated;

-- El listado de la app sigue el orden elegido dentro de cada categoría
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
  select coalesce(jsonb_agg(x order by x ->> 'orden_cat', (x ->> 'orden')::integer, x ->> 'nombre'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'id', p.id, 'categoria', p.categoria_codigo, 'orden_cat', lpad(c.orden::text, 3, '0'), 'orden', p.orden,
      'subcategoria', p.subcategoria, 'nombre', p.nombre, 'descripcion', p.descripcion, 'incluye', p.incluye, 'unidad', p.unidad,
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

-- ROLLBACK:
-- drop function if exists panel_cat_orden(uuid[]), panel_cat_masivo(uuid[], text, text);
-- (catalogo_listar vuelve a la versión de la 0101 volviendo a ejecutar esa función.)