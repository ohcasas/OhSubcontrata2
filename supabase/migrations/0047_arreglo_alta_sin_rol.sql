-- 0047 — Arreglo: crear un usuario sin "rol_solicitado" (p. ej. con "Add user" de Supabase)
-- fallaba con "null value in column role of relation profiles".
-- Causa: en handle_new_cuenta_oh_conecta, "NULL not in (...)" da NULL (no verdadero),
-- así que la función no salía y trataba de insertar un perfil sin rol.
-- Solución: salir también cuando el rol viene vacío. Resto de la función, igual.

create or replace function public.handle_new_cuenta_oh_conecta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text;
  v_nombre_completo text;
  v_telefono text;
  v_nombre_empresa text;
  v_cif text;
  v_empresa_id uuid;
begin
  v_rol := new.raw_user_meta_data ->> 'rol_solicitado';
  if v_rol is null or v_rol not in ('promotor', 'constructora', 'arquitecto', 'proveedor', 'profesional', 'administrador') then
    return new;
  end if;

  v_nombre_completo := coalesce(new.raw_user_meta_data ->> 'nombre_completo', new.email);
  v_telefono := new.raw_user_meta_data ->> 'telefono';
  v_nombre_empresa := coalesce(new.raw_user_meta_data ->> 'nombre_empresa', v_nombre_completo);
  v_cif := new.raw_user_meta_data ->> 'cif';

  if v_cif is not null and exists (select 1 from empresas_subcontratistas where cif = v_cif) then
    raise exception 'CIF_DUPLICADO';
  end if;

  insert into empresas_subcontratistas (nombre, cif, especialidad, homologado)
  values (v_nombre_empresa, v_cif, null, false)
  returning id into v_empresa_id;

  insert into profiles (id, role, nombre_completo, telefono, email, empresa_id)
  values (new.id, v_rol::user_role, v_nombre_completo, v_telefono, new.email, v_empresa_id);

  -- El precio NO se copia aquí: se calcula al activar el cobro (ver precio_aplicable()).
  insert into suscripciones (profile_id, role)
  values (new.id, v_rol::user_role);

  return new;
end;
$function$;