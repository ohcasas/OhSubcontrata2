-- ============================================================================
-- Bucket de Storage para fotos de perfil (avatares)
-- ============================================================================
-- A diferencia de obras-fotos (donde solo el admin puede escribir), aquí
-- cada usuario sube y gestiona SU PROPIA foto — ni siquiera el admin
-- necesita escribir en el avatar de otro. Los objetos se guardan bajo
-- una carpeta con el propio id de usuario (`{auth.uid()}/archivo.jpg`),
-- y la política solo deja escribir dentro de la carpeta que coincide con
-- el uid de quien hace la petición — storage.foldername(name) devuelve
-- los segmentos de carpeta del path, sin el nombre de archivo.
--
-- Bucket público: la foto de perfil no es información sensible, se sirve
-- por URL pública para no complicar el renderizado en la app.

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do update set public = true;

create policy "avatares_propio_insert" on storage.objects
  for insert
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatares_propio_update" on storage.objects
  for update
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatares_propio_delete" on storage.objects
  for delete
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);