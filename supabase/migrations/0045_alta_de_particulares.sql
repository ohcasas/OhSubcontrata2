-- 0045: alta de cuentas de particulares
-- Ninguna de las funciones de alta existentes crea el perfil cuando rol_solicitado = 'particular'
-- (handle_new_cuenta_oh_conecta solo acepta los perfiles de empresa), así que esa cuenta se quedaba
-- sin perfil. Esta función lo crea: sin empresa ni CIF, y en estado 'pendiente' hasta que 3B la verifique.
-- Ejecutar DESPUÉS de la 0043 (necesita el rol 'particular').

create or replace function handle_new_particular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_telefono text;
begin
  if new.raw_user_meta_data ->> 'rol_solicitado' is distinct from 'particular' then
    return new;
  end if;

  v_nombre := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nombre_completo', '')), '');
  v_telefono := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'telefono', '')), '');

  insert into profiles (id, role, nombre_completo, telefono, email)
  values (new.id, 'particular', coalesce(v_nombre, new.email), v_telefono, new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_particular on auth.users;
create trigger trg_handle_new_particular
  after insert on auth.users
  for each row execute function handle_new_particular();

-- Las funciones de trigger no se llaman desde la API
revoke all on function handle_new_particular() from public, anon, authenticated;