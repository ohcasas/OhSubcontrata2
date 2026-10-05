-- ============================================================================
-- Pase de seguridad de las tablas de OH Conecta (0024-0027) + pago de comisiones
-- ============================================================================
-- Revisadas: referencias_comerciales, recompensas_referido, reglas_recompensa_referido,
-- profile_roles, suscripciones, precios_suscripcion, publicaciones_tablon y
-- fichas_directorio.
--
-- Lo que estaba bien:
--   - Todas con RLS activado y todas las políticas exigen sesión (auth.uid()
--     no nulo); en RLS, un NULL deniega (al contrario que en un IF de PL/pgSQL).
--   - referencias_comerciales, recompensas_referido y suscripciones no tienen
--     políticas de insert/update para usuarios: solo se escriben desde
--     funciones security definer (crear_referencia_comercial,
--     actualizar_estado_referencia, aceptar_recompensa_referido) o por admin.
--   - Los triggers de registro solo aceptan un rol_solicitado de la lista
--     cerrada; nadie puede registrarse como admin/superadmin mandando
--     metadatos manipulados.
--
-- Dos fallos menores de integridad (nada que dé acceso a datos de otros, pero
-- sí permitía hacerse pasar por otro tipo de perfil llamando a la API a mano):
--   1) fichas_directorio: el WITH CHECK comprobaba que el usuario fuera
--      proveedor/arquitecto/profesional, pero no que la columna `rol` de la
--      ficha coincidiera con SU rol real. Un proveedor podía guardar su ficha
--      como "arquitecto".
--   2) publicaciones_tablon: la política de INSERT exige que una necesidad la
--      publique un promotor/constructora y un aviso un administrador, pero la
--      de UPDATE no repetía esa regla: un promotor podía convertir su propia
--      necesidad en un "aviso" institucional.
--
-- Observaciones, sin cambio (decisiones de producto, no fallos):
--   - Los datos de contacto del Tablón y del Directorio los ve cualquier
--     cuenta registrada, y registrarse es libre: cualquiera puede recopilarlos.
--   - crear_referencia_comercial() no tiene límite de recomendaciones por día.

-- 1) La ficha del Directorio tiene que ser del tipo real de quien la escribe
drop policy if exists fichas_directorio_write_own on fichas_directorio;
create policy fichas_directorio_write_own on fichas_directorio
  for all using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and auth_role() in ('proveedor', 'arquitecto', 'profesional')
    and rol = auth_role()
  );

-- 2) Editar una publicación respeta las mismas reglas que crearla
drop policy if exists publicaciones_tablon_update_own on publicaciones_tablon;
create policy publicaciones_tablon_update_own on publicaciones_tablon
  for update
  using (autor_id = auth.uid() or auth_role() in ('admin', 'superadmin'))
  with check (
    auth_role() in ('admin', 'superadmin')
    or (
      autor_id = auth.uid()
      and (
        (tipo = 'necesidad' and auth_role() in ('promotor', 'constructora'))
        or (tipo = 'aviso' and auth_role() = 'administrador')
      )
    )
  );

-- ============================================================================
-- Marcar una comisión como pagada (admin)
-- ============================================================================
-- Hasta ahora una comisión llegaba a 'aceptada' y ahí se quedaba: nadie podía
-- marcarla como pagada, así que el apartado "Cobradas" del Perfil del
-- recomendador siempre estaba a cero. El pago en sí se hace fuera de la app
-- (transferencia, etc.); esto solo deja constancia de que ya se ha hecho y
-- avisa a la persona.
create or replace function marcar_recompensa_pagada(p_recompensa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referidor_id uuid;
  v_estado text;
  v_importe numeric(12,2);
  v_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;

  select referidor_id, estado, importe
    into v_referidor_id, v_estado, v_importe
    from recompensas_referido
    where id = p_recompensa_id
    for update;

  if v_estado is null then
    raise exception 'Comisión no encontrada';
  end if;
  if v_estado <> 'aceptada' then
    raise exception 'Solo se puede marcar como pagada una comisión que la persona ya ha aceptado (estado actual: %)', v_estado;
  end if;

  update recompensas_referido set estado = 'pagada', updated_at = now() where id = p_recompensa_id;

  if v_referidor_id is not null then
    select empresa_id into v_empresa_id from profiles where id = v_referidor_id;
    if v_empresa_id is not null then
      perform crear_notificacion(
        v_empresa_id,
        'comision_pagada',
        'Comisión pagada',
        'Hemos marcado como pagada tu comisión de ' || v_importe || ' €.',
        jsonb_build_object('recompensa_id', p_recompensa_id)
      );
    end if;
  end if;
end;
$$;

revoke execute on function marcar_recompensa_pagada(uuid) from public, anon;
grant execute on function marcar_recompensa_pagada(uuid) to authenticated;