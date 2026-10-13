-- 0049 — Endurecimiento tras la prueba de seguridad
-- 1) Las funciones auxiliares de permisos ya no las puede llamar quien no ha iniciado sesión.
-- 2) Se fija el search_path en las que no lo tenían (evita suplantación de objetos).
-- No cambia nada para usuarios con sesión. Se puede ejecutar varias veces.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('auth_empresa_id', 'auth_role', 'cuenta_verificada', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated, service_role', f.firma);
  end loop;

  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('auth_empresa_id', 'auth_role')
  loop
    execute format('alter function %s set search_path = public', f.firma);
  end loop;
end $$;