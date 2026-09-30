-- ============================================================================
-- Registro de subcontratistas — creación automática de empresa + perfil
-- ============================================================================
-- Un subcontratista nuevo no puede insertar directamente en `empresas_
-- subcontratistas` (solo admins, por RLS) ni en `profiles` (no hay policy
-- de insert para nadie). En vez de abrir esas tablas con políticas nuevas,
-- se usa el patrón estándar de Supabase: un trigger `security definer`
-- sobre `auth.users` que crea la empresa y el perfil en la misma
-- transacción que el alta en Auth — funciona tanto si la confirmación de
-- email está activada como si no, porque no depende de que exista una
-- sesión autenticada en el momento de la llamada (el trigger corre con
-- privilegios elevados, no con los del usuario recién creado).
--
-- Los datos de la empresa y de la persona viajan en el `data` que el
-- cliente pasa a `supabase.auth.signUp({ options: { data: {...} } })`,
-- y quedan disponibles aquí como `new.raw_user_meta_data`.

create or replace function handle_new_subcontratista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_empresa text;
  v_cif text;
  v_especialidad text;
  v_nombre_completo text;
  v_telefono text;
  v_empresa_id uuid;
begin
  v_nombre_empresa := new.raw_user_meta_data ->> 'nombre_empresa';
  v_cif := new.raw_user_meta_data ->> 'cif';
  v_especialidad := new.raw_user_meta_data ->> 'especialidad';
  v_nombre_completo := coalesce(new.raw_user_meta_data ->> 'nombre_completo', new.email);
  v_telefono := new.raw_user_meta_data ->> 'telefono';

  -- Solo se auto-registran subcontratistas. Los admins se crean a mano
  -- desde el dashboard de Supabase, sin pasar por este flujo.
  if v_nombre_empresa is null then
    return new;
  end if;

  if exists (select 1 from empresas_subcontratistas where cif = v_cif) then
    raise exception 'CIF_DUPLICADO';
  end if;

  insert into empresas_subcontratistas (nombre, cif, especialidad, homologado)
  values (v_nombre_empresa, v_cif, v_especialidad, false)
  returning id into v_empresa_id;

  insert into profiles (id, role, nombre_completo, telefono, empresa_id)
  values (new.id, 'subcontratista', v_nombre_completo, v_telefono, v_empresa_id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_subcontratista();
  