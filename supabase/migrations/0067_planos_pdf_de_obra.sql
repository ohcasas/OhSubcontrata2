-- 0067 · Planos en PDF de cada obra
-- · El equipo de 3B sube (y borra) PDFs de planos desde el panel, dentro de cada obra.
-- · Los ve quien puede ver esa obra en la app (las mismas reglas que "obras"): las empresas con cuenta verificada,
--   el cliente que la creó, etc. Quien no puede ver la obra, no ve sus planos.
-- · Los archivos van a un almacén PRIVADO (obras-planos); la app los abre con un enlace temporal.

create table if not exists obras_planos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 160),
  archivo_path text not null unique,
  tamano_bytes bigint check (tamano_bytes is null or tamano_bytes between 1 and 26214400),
  subido_por uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_obras_planos_obra on obras_planos (obra_id, created_at);

alter table obras_planos enable row level security;
revoke all on obras_planos from anon, authenticated;
grant select, insert, update, delete on obras_planos to authenticated;

-- Ver: lo mismo que se ve de la obra (la consulta a "obras" respeta sus propias reglas)
drop policy if exists obras_planos_ver on obras_planos;
create policy obras_planos_ver on obras_planos for select to authenticated
  using (exists (select 1 from obras o where o.id = obras_planos.obra_id));

-- Subir, renombrar y borrar: solo el equipo de 3B
drop policy if exists obras_planos_equipo on obras_planos;
create policy obras_planos_equipo on obras_planos for all to authenticated
  using (public.auth_role() in ('admin', 'superadmin'))
  with check (public.auth_role() in ('admin', 'superadmin'));

-- Almacén privado: solo PDF, hasta 25 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('obras-planos', 'obras-planos', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists obras_planos_storage_ver on storage.objects;
create policy obras_planos_storage_ver on storage.objects for select to authenticated
  using (bucket_id = 'obras-planos' and exists (select 1 from public.obras_planos p where p.archivo_path = name));

drop policy if exists obras_planos_storage_equipo on storage.objects;
create policy obras_planos_storage_equipo on storage.objects for all to authenticated
  using (bucket_id = 'obras-planos' and public.auth_role() in ('admin', 'superadmin'))
  with check (bucket_id = 'obras-planos' and public.auth_role() in ('admin', 'superadmin'));