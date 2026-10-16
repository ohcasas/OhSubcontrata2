-- ============================================================================
-- Panel de empresas: editar datos, notas internas y datos para filtrar/exportar
-- ============================================================================
-- 1) notas_cuenta: notas internas de OH sobre una cuenta (la persona nunca las ve).
-- 2) panel_cuentas_extra(): especialidad, zona, fecha de alta y nº de notas de cada
--    cuenta, para los filtros y la exportación del listado.
-- 3) panel_editar_cuenta(): corrige contacto, teléfono, empresa, CIF, especialidad
--    y zona de una cuenta. El correo no se toca (es el de acceso a la app).
-- Se puede ejecutar más de una vez sin problema.

create table if not exists notas_cuenta (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles (id) on delete cascade,
  autor_id uuid references profiles (id) on delete set null,
  autor_nombre text,
  texto text not null check (length(btrim(texto)) > 0 and length(texto) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_notas_cuenta_profile on notas_cuenta (profile_id, created_at desc);
alter table notas_cuenta enable row level security;
drop policy if exists notas_cuenta_admin on notas_cuenta;
create policy notas_cuenta_admin on notas_cuenta
  for all using (auth_role() in ('admin', 'superadmin'))
  with check (auth_role() in ('admin', 'superadmin'));

create or replace function panel_cuentas_extra()
returns table (profile_id uuid, especialidad text, zona text, alta timestamptz, notas integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
  select p.id,
         coalesce(nullif(btrim(e.especialidad), ''), nullif(btrim(d.datos ->> 'especialidad'), '')),
         nullif(btrim(d.datos ->> 'zona'), ''),
         p.created_at,
         (select count(*)::integer from notas_cuenta n where n.profile_id = p.id)
  from profiles p
  left join empresas_subcontratistas e on e.id = p.empresa_id
  left join datos_registro d on d.profile_id = p.id
  where p.role not in ('admin', 'superadmin');
end;
$$;
revoke execute on function panel_cuentas_extra() from public, anon;
grant execute on function panel_cuentas_extra() to authenticated;

create or replace function panel_editar_cuenta(
  p_profile_id uuid,
  p_nombre_completo text,
  p_telefono text,
  p_empresa text,
  p_cif text,
  p_especialidad text,
  p_zona text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_role user_role;
  v_nombre text := nullif(btrim(p_nombre_completo), '');
  v_nom_empresa text := nullif(btrim(p_empresa), '');
  v_cif text := nullif(btrim(p_cif), '');
  v_esp text := nullif(btrim(p_especialidad), '');
  v_zona text := nullif(btrim(p_zona), '');
begin
  perform panel_exigir_admin();

  select role, empresa_id into v_role, v_empresa from profiles where id = p_profile_id;
  if v_role is null then
    raise exception 'No se encuentra esta cuenta.';
  end if;
  if v_role in ('admin', 'superadmin') then
    raise exception 'Las cuentas de administración no se editan desde aquí.';
  end if;
  if v_nombre is null then
    raise exception 'El nombre de contacto no puede quedar vacío.';
  end if;

  update profiles
     set nombre_completo = v_nombre, telefono = nullif(btrim(p_telefono), '')
   where id = p_profile_id;

  if v_empresa is not null then
    update empresas_subcontratistas
       set nombre = coalesce(v_nom_empresa, nombre), cif = v_cif, especialidad = v_esp
     where id = v_empresa;
  elsif v_nom_empresa is not null then
    insert into empresas_subcontratistas (nombre, cif, especialidad)
    values (v_nom_empresa, v_cif, v_esp)
    returning id into v_empresa;
    update profiles set empresa_id = v_empresa where id = p_profile_id;
  end if;

  insert into datos_registro (profile_id, datos)
  values (p_profile_id, case when v_zona is null then '{}'::jsonb else jsonb_build_object('zona', v_zona) end)
  on conflict (profile_id) do update
    set datos = case when v_zona is null then datos_registro.datos - 'zona'
                     else datos_registro.datos || jsonb_build_object('zona', v_zona) end;

  insert into registro_actividad (quien, accion, origen, profile_id, tipo, detalle)
  values (auth.uid(), 'cuenta.editada', 'panel', p_profile_id, v_role::text,
          jsonb_build_object('nombre', v_nombre, 'empresa', v_nom_empresa, 'cif', v_cif));
exception
  when unique_violation then
    raise exception 'Ya existe otra empresa con ese CIF.';
end;
$$;
revoke execute on function panel_editar_cuenta(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function panel_editar_cuenta(uuid, text, text, text, text, text, text) to authenticated;