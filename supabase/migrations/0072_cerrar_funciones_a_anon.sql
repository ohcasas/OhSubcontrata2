-- 0072 · Cerrar a "anon" las funciones de negocio SECURITY DEFINER
--
-- Hallazgo (validación sobre el esquema reconstruido desde Git): estas funciones
-- eran ejecutables por el rol "anon" (visitante sin sesión). Las de administración
-- comprueban `if auth_role() not in ('admin','superadmin')`, pero sin sesión
-- auth_role() devuelve NULL, la condición da NULL (no TRUE) y el `if` no se
-- ejecuta: la comprobación se salta. Es el mismo patrón que corregía la
-- migración 0022, que no está en el repositorio.
--
-- Corrección mínima y sin cambiar la lógica: quitar EXECUTE a PUBLIC y anon,
-- dejarlo a authenticated y service_role. Idempotente. No toca datos.

do $$
declare
  f text;
  v_oid oid;
begin
  foreach f in array array[
    'aceptar_postulacion(uuid)',
    'cambiar_estado_obra(uuid,estado_obra)',
    'finalizar_obra(uuid)',
    'registrar_avance_obra(uuid,text,integer)',
    'resolver_canje(uuid,estado_canje)',
    'solicitar_canje(uuid)'
  ] loop
    v_oid := to_regprocedure('public.' || f);
    if v_oid is null then
      raise notice '0072: % no existe, se omite', f;
      continue;
    end if;
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;