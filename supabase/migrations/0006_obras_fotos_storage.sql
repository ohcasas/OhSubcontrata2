-- ============================================================================
-- Bucket de Storage para fotos de obras
-- ============================================================================
-- Bucket público: las fotos de obras no son información sensible (son
-- fotos de la construcción/módulo, pensadas para verse en la app), así
-- que se sirven directamente por URL pública sin necesidad de firmar
-- cada petición — más simple y más rápido de renderizar en las listas.
--
-- Lo que SÍ protegen las políticas de abajo es quién puede subir, editar
-- o borrar objetos de este bucket: solo admin/superadmin, igual que el
-- resto de escritura administrativa de la app.

insert into storage.buckets (id, name, public)
values ('obras-fotos', 'obras-fotos', true)
on conflict (id) do nothing;

create policy "obras_fotos_admin_insert" on storage.objects
  for insert
  with check (bucket_id = 'obras-fotos' and public.auth_role() in ('admin', 'superadmin'));

create policy "obras_fotos_admin_update" on storage.objects
  for update
  using (bucket_id = 'obras-fotos' and public.auth_role() in ('admin', 'superadmin'));

create policy "obras_fotos_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'obras-fotos' and public.auth_role() in ('admin', 'superadmin'));