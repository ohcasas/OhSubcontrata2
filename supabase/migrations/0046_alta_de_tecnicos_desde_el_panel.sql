-- 0046: dar de alta a un técnico desde el panel
-- Una cuenta creada a mano en Supabase (Authentication → Add user) no tiene perfil, así que
-- panel_marcar_tecnico no la encontraba. Esta función la busca por correo, crea el perfil si
-- falta y la deja como técnico verificado (interno o externo).
-- Ejecutar DESPUÉS de la 0043.

create or replace function panel_crear_tecnico(p_email text, p_nombre text, p_externo boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role user_role;
  v_estado text;
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  perform panel_exigir_admin();

  select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if v_id is null then
    raise exception 'No hay ninguna cuenta con ese correo. Créala antes en Supabase (Authentication → Add user).';
  end if;

  select role, estado_cuenta into v_role, v_estado from profiles where id = v_id;
  if found then
    if v_role in ('admin', 'superadmin') then
      raise exception 'No se puede convertir en técnico a un administrador.';
    end if;
    if v_role not in ('tecnico', 'subcontratista') or (v_role = 'subcontratista' and v_estado <> 'pendiente') then
      raise exception 'Esa cuenta ya se usa con otro perfil. Usa un correo nuevo para el técnico.';
    end if;
    perform panel_marcar_tecnico(v_id, p_externo);
    return v_id;
  end if;

  if v_nombre is null then
    raise exception 'Escribe el nombre del técnico.';
  end if;

  insert into profiles (id, role, nombre_completo, email, estado_cuenta, tecnico_externo,
                        estado_cuenta_actualizado_en, estado_cuenta_actualizado_por)
  values (v_id, 'tecnico', v_nombre, lower(btrim(p_email)), 'verificada', coalesce(p_externo, false), now(), auth.uid());

  insert into cuenta_historial (profile_id, estado_anterior, estado_nuevo, motivo, hecho_por)
  values (v_id, null, 'verificada',
          'Alta como técnico ' || case when coalesce(p_externo, false) then 'externo' else 'interno' end, auth.uid());

  return v_id;
end;
$$;

revoke all on function panel_crear_tecnico(text, text, boolean) from public, anon;
grant execute on function panel_crear_tecnico(text, text, boolean) to authenticated;