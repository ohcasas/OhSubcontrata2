-- ============================================================================
-- Email accesible en profiles
-- ============================================================================
-- El email de login vive en auth.users, un esquema que la app no puede
-- leer directamente desde el cliente (PostgREST no lo expone). Como varias
-- pantallas necesitan mostrarlo (detalle de Gremios, contactar a un
-- postulante), se guarda una copia en profiles.email.
--
-- Se rellena solo en el registro nuevo (trigger actualizado más abajo) y
-- se hace un backfill una vez para los perfiles que ya existían.

alter table profiles add column if not exists email text;
comment on column profiles.email is
  'Copia de auth.users.email, para poder mostrarlo sin leer el esquema auth directamente desde el cliente.';

update profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- Redefine el trigger de 0004 para que también guarde el email.
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

  if v_nombre_empresa is null then
    return new;
  end if;

  if exists (select 1 from empresas_subcontratistas where cif = v_cif) then
    raise exception 'CIF_DUPLICADO';
  end if;

  insert into empresas_subcontratistas (nombre, cif, especialidad, homologado)
  values (v_nombre_empresa, v_cif, v_especialidad, false)
  returning id into v_empresa_id;

  insert into profiles (id, role, nombre_completo, telefono, email, empresa_id)
  values (new.id, 'subcontratista', v_nombre_completo, v_telefono, new.email, v_empresa_id);

  return new;
end;
$$;