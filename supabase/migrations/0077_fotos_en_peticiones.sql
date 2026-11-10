-- ===========================================================================
-- 0077 · Fotos al presentar una necesidad (particulares)
--
-- Qué hace
--   · Crea el almacén PRIVADO «peticiones-fotos» (JPG/PNG/WEBP, máx. 10 MB por foto).
--   · Guarda qué fotos pertenecen a cada petición (tabla obras_fotos), máximo 6 por petición.
--   · Quien envía la petición sube y adjunta sus fotos; solo él y el equipo de 3B pueden verlas.
--
-- Qué NO hace (a propósito)
--   · No toca app_crear_peticion_particular: la petición se crea igual que hasta ahora y las
--     fotos se adjuntan después con app_adjuntar_fotos_peticion.
--   · No enseña las fotos a técnicos ni a empresas: pueden mostrar el interior de una vivienda.
--     Si más adelante se quiere, se decide caso por caso desde 3B.
--   · No cambia el panel de administración (las fotos quedan accesibles para el equipo vía
--     app_fotos_peticion / almacén, pero verlas en el panel requiere tu autorización).
-- ===========================================================================

-- 1) Qué fotos tiene cada petición
create table if not exists obras_fotos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras (id) on delete cascade,
  ruta text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists obras_fotos_obra_idx on obras_fotos (obra_id);
alter table obras_fotos enable row level security;

drop policy if exists obras_fotos_select on obras_fotos;
create policy obras_fotos_select on obras_fotos
  for select using (
    auth_role() in ('admin', 'superadmin')
    or exists (select 1 from obras o where o.id = obras_fotos.obra_id and o.creado_por = auth.uid())
  );
-- Sin políticas de escritura: solo se escribe con la función de abajo.

-- 2) Almacén privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('peticiones-fotos', 'peticiones-fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Ruta obligatoria de cada foto: <id del usuario>/<id de la petición>/<archivo>
drop policy if exists "peticiones_fotos_insert" on storage.objects;
create policy "peticiones_fotos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'peticiones-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.auth_role() = 'particular'
  );

drop policy if exists "peticiones_fotos_select" on storage.objects;
create policy "peticiones_fotos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'peticiones-fotos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.auth_role() in ('admin', 'superadmin'))
  );

-- Quien subió una foto solo puede borrarla mientras no esté adjuntada a una petición
-- (sirve para limpiar si algo falla a mitad de camino).
drop policy if exists "peticiones_fotos_delete" on storage.objects;
create policy "peticiones_fotos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'peticiones-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.obras_fotos f where f.ruta = storage.objects.name)
  );

-- 3) Adjuntar fotos a una petición propia (máximo 6 en total)
create or replace function app_adjuntar_fotos_peticion(p_obra_id uuid, p_rutas text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ruta text;
  v_prefijo text;
  v_ya integer;
  v_nuevas integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  if coalesce(auth_role()::text, '') <> 'particular' then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1 from obras
    where id = p_obra_id and creado_por = v_uid and origen = 'particular'
      and estado in ('en_revision', 'pendiente_info')
  ) then
    raise exception 'Solo puedes añadir fotos a una petición tuya que aún esté en revisión.';
  end if;

  v_nuevas := coalesce(array_length(p_rutas, 1), 0);
  if v_nuevas = 0 then
    return 0;
  end if;

  select count(*) into v_ya from obras_fotos where obra_id = p_obra_id;
  if v_ya + v_nuevas > 6 then
    raise exception 'Cada petición admite hasta 6 fotos.';
  end if;

  v_prefijo := v_uid::text || '/' || p_obra_id::text || '/';
  foreach v_ruta in array p_rutas loop
    if v_ruta is null or left(v_ruta, length(v_prefijo)) <> v_prefijo or length(v_ruta) > 300 then
      raise exception 'Una de las fotos no es válida.';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'peticiones-fotos' and name = v_ruta) then
      raise exception 'Una de las fotos no se ha subido correctamente. Inténtalo de nuevo.';
    end if;
    insert into obras_fotos (obra_id, ruta) values (p_obra_id, v_ruta) on conflict (ruta) do nothing;
  end loop;

  return v_nuevas;
end;
$$;

-- 4) Rutas de las fotos de una petición (dueño o equipo de 3B)
create or replace function app_fotos_peticion(p_obra_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin')
     and not exists (select 1 from obras where id = p_obra_id and creado_por = auth.uid()) then
    raise exception 'No autorizado';
  end if;
  return coalesce((select array_agg(ruta order by created_at, id) from obras_fotos where obra_id = p_obra_id), '{}');
end;
$$;

revoke all on function app_adjuntar_fotos_peticion(uuid, text[]) from public, anon;
revoke all on function app_fotos_peticion(uuid) from public, anon;
grant execute on function app_adjuntar_fotos_peticion(uuid, text[]) to authenticated;
grant execute on function app_fotos_peticion(uuid) to authenticated;