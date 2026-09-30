-- ============================================================================
-- Adjuntos de postulaciones y documentos de homologación
-- ============================================================================
-- Bug encontrado: postulacion_archivos tiene RLS activado desde el
-- esquema inicial (0001) pero NUNCA se le crearon políticas — con RLS
-- activado y cero políticas, todo el acceso queda denegado por defecto.
-- Es decir, esta tabla era inservible hasta ahora, para admin y para
-- subcontratista por igual. Se corrige aquí.
--
-- Los dos buckets son PRIVADOS (a diferencia de obras-fotos/avatares):
-- son documentos de negocio (presupuestos, pólizas, certificados), no
-- algo para mostrar públicamente. El acceso a los archivos en sí se hace
-- con URLs firmadas de corta duración (createSignedUrl), nunca con URL
-- pública. Los objetos se guardan bajo una carpeta con el id de la
-- EMPRESA propietaria (`{empresa_id}/archivo.pdf`), y las políticas de
-- storage.objects comprueban esa carpeta contra auth_empresa_id().

-- ---------------------------------------------------------------------------
-- RLS de postulacion_archivos (la propia empresa de la postulación + admin)
-- ---------------------------------------------------------------------------
create policy postulacion_archivos_select on postulacion_archivos
  for select using (
    exists (
      select 1 from postulaciones p
      where p.id = postulacion_archivos.postulacion_id
        and (p.empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'))
    )
  );

create policy postulacion_archivos_insert on postulacion_archivos
  for insert with check (
    exists (
      select 1 from postulaciones p
      where p.id = postulacion_archivos.postulacion_id
        and (p.empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'))
    )
  );

create policy postulacion_archivos_delete on postulacion_archivos
  for delete using (
    exists (
      select 1 from postulaciones p
      where p.id = postulacion_archivos.postulacion_id
        and (p.empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'))
    )
  );

-- ---------------------------------------------------------------------------
-- Buckets privados
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('postulacion-archivos', 'postulacion-archivos', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('documentos-homologacion', 'documentos-homologacion', false)
on conflict (id) do update set public = false;

create policy "postulacion_archivos_storage_rw" on storage.objects
  for all
  using (
    bucket_id = 'postulacion-archivos'
    and ((storage.foldername(name))[1] = auth_empresa_id()::text or public.auth_role() in ('admin', 'superadmin'))
  )
  with check (
    bucket_id = 'postulacion-archivos'
    and ((storage.foldername(name))[1] = auth_empresa_id()::text or public.auth_role() in ('admin', 'superadmin'))
  );

create policy "documentos_homologacion_storage_rw" on storage.objects
  for all
  using (
    bucket_id = 'documentos-homologacion'
    and ((storage.foldername(name))[1] = auth_empresa_id()::text or public.auth_role() in ('admin', 'superadmin'))
  )
  with check (
    bucket_id = 'documentos-homologacion'
    and ((storage.foldername(name))[1] = auth_empresa_id()::text or public.auth_role() in ('admin', 'superadmin'))
  );