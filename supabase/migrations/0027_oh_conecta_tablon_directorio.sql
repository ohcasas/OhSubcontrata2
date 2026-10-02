-- ============================================================================
-- OH Conecta: Tablón (necesidades/avisos) y Directorio (fichas de oferta)
-- ============================================================================
-- Fase gratuita, sin Stripe todavía: cualquiera con una cuenta de los 6
-- roles nuevos puede usar esto desde ya, sin ningún cobro ni bloqueo.
--
-- Dos tablas, en vez de una por cada uno de los 6 roles:
--   - publicaciones_tablon: "busco X" (promotor/constructora) o avisos
--     institucionales (administrador). Lo ve cualquiera con sesión.
--   - fichas_directorio: "ofrezco X" (proveedor/arquitecto/profesional).
--     Una ficha por persona, visible para que la busquen. Lo ve
--     cualquiera con sesión.
--
-- Nada de esto usa funciones RPC con lógica compleja — son publicaciones
-- simples, así que se gestiona directamente con políticas RLS, sin pasar
-- por funciones intermedias (no hay dinero ni estados que proteger aquí).

create table if not exists publicaciones_tablon (
  id uuid primary key default uuid_generate_v4(),
  autor_id uuid not null references profiles (id) on delete cascade,
  tipo text not null check (tipo in ('necesidad', 'aviso')),
  titulo text not null,
  descripcion text,
  categoria text,
  ubicacion text,
  contacto_telefono text,
  contacto_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table publicaciones_tablon is
  'Tablón de OH Conecta: necesidades publicadas por promotores/constructoras, o avisos institucionales de administradores. Visible para cualquier cuenta con sesión.';

create index if not exists idx_publicaciones_tablon_created on publicaciones_tablon (created_at desc);

create trigger trg_publicaciones_tablon_updated_at before update on publicaciones_tablon
  for each row execute function set_updated_at();

alter table publicaciones_tablon enable row level security;

create policy publicaciones_tablon_select on publicaciones_tablon
  for select using (auth.uid() is not null);

create policy publicaciones_tablon_insert on publicaciones_tablon
  for insert with check (
    autor_id = auth.uid()
    and (
      (tipo = 'necesidad' and auth_role() in ('promotor', 'constructora'))
      or (tipo = 'aviso' and auth_role() = 'administrador')
      or auth_role() in ('admin', 'superadmin')
    )
  );

create policy publicaciones_tablon_update_own on publicaciones_tablon
  for update using (autor_id = auth.uid() or auth_role() in ('admin', 'superadmin'));

create policy publicaciones_tablon_delete_own on publicaciones_tablon
  for delete using (autor_id = auth.uid() or auth_role() in ('admin', 'superadmin'));

create table if not exists fichas_directorio (
  profile_id uuid primary key references profiles (id) on delete cascade,
  rol user_role not null check (rol in ('proveedor', 'arquitecto', 'profesional')),
  nombre_mostrar text not null,
  categoria text,
  descripcion text,
  zona_cobertura text,
  telefono text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table fichas_directorio is
  'Ficha pública de OH Conecta para proveedores, arquitectos y profesionales — lo que ofrecen, para que otras cuentas los encuentren. Una ficha por persona.';

create trigger trg_fichas_directorio_updated_at before update on fichas_directorio
  for each row execute function set_updated_at();

alter table fichas_directorio enable row level security;

create policy fichas_directorio_select on fichas_directorio
  for select using (auth.uid() is not null);

-- Separada en dos: si la de arriba combinara "admin puede tocar cualquier
-- fila" con el WITH CHECK de "mi rol tiene que ser proveedor/arquitecto/
-- profesional", un admin (cuyo rol no es ninguno de esos tres) no podría
-- ni editar ni insertar nada — el WITH CHECK se aplica también cuando
-- entra por el lado de USING de admin. Por eso van separadas.
create policy fichas_directorio_write_own on fichas_directorio
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and auth_role() in ('proveedor', 'arquitecto', 'profesional'));

create policy fichas_directorio_admin_delete on fichas_directorio
  for delete using (auth_role() in ('admin', 'superadmin'));