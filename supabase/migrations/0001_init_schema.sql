-- ============================================================================
-- OH Casas Modulares — Portal de Subcontratas
-- Migración inicial: esquema de base de datos (Fase 0)
-- Motor: PostgreSQL (Supabase)
-- ============================================================================
-- Nada de esto ha sido desplegado todavía. Es la propuesta de esquema a
-- revisar antes de aplicarlo con `supabase db push` o desde el dashboard.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONES Y TIPOS
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create type user_role as enum ('subcontratista', 'admin', 'superadmin');

create type nivel_partner as enum ('bronce', 'plata', 'oro', 'platino');

create type estado_documento as enum ('vigente', 'vencido', 'pendiente_revision');

create type tipo_documento as enum (
  'alta_autonomo',
  'seguro_rc',
  'certificado_prl',
  'certificado_aeat_tgss',
  'otro'
);

create type estado_obra as enum ('abierta', 'cerrada', 'adjudicada', 'cancelada');

create type estado_postulacion as enum ('enviada', 'en_revision', 'aceptada', 'rechazada');

create type tipo_movimiento_puntos as enum ('ganancia', 'canje', 'ajuste');

create type estado_canje as enum ('pendiente', 'completado', 'cancelado');

-- ----------------------------------------------------------------------------
-- 1. EMPRESAS SUBCONTRATISTAS
-- ----------------------------------------------------------------------------
create table empresas_subcontratistas (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  cif text unique,
  especialidad text,                         -- ej. "Electricidad Industrial & Climatización"
  direccion text,
  homologado boolean not null default false,
  nivel_partner nivel_partner not null default 'bronce',
  puntos_disponibles integer not null default 0,
  rating_medio numeric(3,2) default null,      -- ej. 4.9
  obras_completadas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table empresas_subcontratistas is
  'Ficha de cada subcontrata/gremio (equivalente a "Instalaciones Técnicas del Norte S.L." en el diseño)';

-- ----------------------------------------------------------------------------
-- 2. PERFILES (extiende auth.users de Supabase)
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'subcontratista',
  nombre_completo text not null,
  telefono text,
  avatar_url text,
  empresa_id uuid references empresas_subcontratistas (id) on delete set null,
  two_factor_enabled boolean not null default false,   -- el diseño admin exige 2FA forzado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is
  'Un perfil por usuario autenticado. role=admin/superadmin => personal interno OH Casas; role=subcontratista => vinculado a empresas_subcontratistas';

-- ----------------------------------------------------------------------------
-- 3. DOCUMENTACIÓN DE HOMOLOGACIÓN (PRL, seguros, altas fiscales…)
-- ----------------------------------------------------------------------------
create table documentos_homologacion (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  tipo tipo_documento not null,
  estado estado_documento not null default 'pendiente_revision',
  descripcion text,                          -- ej. "Certificados PRL & Equipo Técnico"
  cobertura_eur numeric(12,2),                -- ej. 600000.00 para seguro RC
  fecha_emision date,
  fecha_vencimiento date,
  storage_path text,                          -- ruta en Supabase Storage (bucket privado)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table documentos_homologacion is
  'Documentos legales/PRL por empresa. La vigencia (fecha_vencimiento) alimenta el badge "100% CONFORME" del perfil profesional';

-- ----------------------------------------------------------------------------
-- 4. OBRAS / LICITACIONES
-- ----------------------------------------------------------------------------
create table obras (
  id uuid primary key default uuid_generate_v4(),
  referencia text unique not null,            -- ej. "LIC-2024-089" / "OH-2025-MOD89"
  titulo text not null,
  descripcion text,
  especialidad_requerida text,
  ubicacion text,
  modulos integer,
  m2 numeric(8,2),
  presupuesto numeric(12,2) not null,
  moneda text not null default 'EUR',
  puntos_bonus integer default 0,
  fecha_inicio date,
  duracion_dias integer,
  plazo_cierre timestamptz,                   -- cuenta atrás "Cierra en 48h"
  estado estado_obra not null default 'abierta',
  requisitos text,                            -- ej. "PRL 20h + Instalador"
  creado_por uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table obras is 'Licitaciones publicadas por OH Casas para subcontratas';

-- ----------------------------------------------------------------------------
-- 5. POSTULACIONES (ofertas de subcontratas a una obra)
-- ----------------------------------------------------------------------------
create table postulaciones (
  id uuid primary key default uuid_generate_v4(),
  obra_id uuid not null references obras (id) on delete cascade,
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  oferta_economica numeric(12,2) not null,
  disponibilidad_equipo text,
  motivacion text,
  estado estado_postulacion not null default 'enviada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, empresa_id)                 -- una postulación por empresa y obra
);

create table postulacion_archivos (
  id uuid primary key default uuid_generate_v4(),
  postulacion_id uuid not null references postulaciones (id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,
  tipo_mime text,
  tamano_bytes bigint,
  created_at timestamptz not null default now()
);

comment on table postulaciones is 'Ofertas/postulaciones enviadas por una subcontrata a una obra concreta';
comment on table postulacion_archivos is 'Adjuntos de una postulación (presupuesto desglosado, pólizas, etc.)';

-- ----------------------------------------------------------------------------
-- 6. CLUB OH PARTNER — PUNTOS Y RECOMPENSAS
-- ----------------------------------------------------------------------------
create table club_partner_movimientos (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  tipo tipo_movimiento_puntos not null,
  puntos integer not null,                     -- positivo=ganancia, negativo=canje/ajuste
  concepto text not null,                      -- ej. "Certificación final de cerramientos sin incidencias"
  obra_id uuid references obras (id) on delete set null,
  created_at timestamptz not null default now()
);

create table recompensas_catalogo (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  descripcion text,
  puntos_requeridos integer not null,
  categoria text,                              -- ej. "efectivo", "herramienta", "seguro", "formación"
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table canjes (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  recompensa_id uuid not null references recompensas_catalogo (id),
  puntos_gastados integer not null,
  estado estado_canje not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table club_partner_movimientos is 'Ledger de puntos — histórico inmutable (append-only) por empresa';
comment on table recompensas_catalogo is 'Catálogo de canje mostrado en la pantalla Club OH Partner';
comment on table canjes is 'Canjes solicitados por una empresa contra el catálogo de recompensas';

-- ----------------------------------------------------------------------------
-- 7. AUDITORÍA (exigida explícitamente por el diseño del panel admin)
-- ----------------------------------------------------------------------------
create table logs_auditoria (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles (id),
  accion text not null,                        -- ej. "postulacion.aceptada", "documento.subido"
  entidad text not null,                        -- ej. "postulaciones"
  entidad_id uuid,
  detalles jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

comment on table logs_auditoria is
  'Registro de auditoría exportable — corresponde a "2FA forzado • Registro de auditoría exportable" del panel admin';

-- ----------------------------------------------------------------------------
-- 8. ÍNDICES
-- ----------------------------------------------------------------------------
create index idx_profiles_empresa on profiles (empresa_id);
create index idx_documentos_empresa on documentos_homologacion (empresa_id);
create index idx_documentos_vencimiento on documentos_homologacion (fecha_vencimiento);
create index idx_obras_estado on obras (estado);
create index idx_postulaciones_obra on postulaciones (obra_id);
create index idx_postulaciones_empresa on postulaciones (empresa_id);
create index idx_movimientos_empresa on club_partner_movimientos (empresa_id);
create index idx_auditoria_entidad on logs_auditoria (entidad, entidad_id);
create index idx_auditoria_actor on logs_auditoria (actor_id);

-- ----------------------------------------------------------------------------
-- 9. TRIGGERS — updated_at automático
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_empresas_updated_at before update on empresas_subcontratistas
  for each row execute function set_updated_at();
create trigger trg_documentos_updated_at before update on documentos_homologacion
  for each row execute function set_updated_at();
create trigger trg_obras_updated_at before update on obras
  for each row execute function set_updated_at();
create trigger trg_postulaciones_updated_at before update on postulaciones
  for each row execute function set_updated_at();
create trigger trg_canjes_updated_at before update on canjes
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY — activada en todas las tablas
-- ----------------------------------------------------------------------------
alter table empresas_subcontratistas enable row level security;
alter table profiles enable row level security;
alter table documentos_homologacion enable row level security;
alter table obras enable row level security;
alter table postulaciones enable row level security;
alter table postulacion_archivos enable row level security;
alter table club_partner_movimientos enable row level security;
alter table recompensas_catalogo enable row level security;
alter table canjes enable row level security;
alter table logs_auditoria enable row level security;

-- Función auxiliar: rol del usuario autenticado actual
create or replace function auth_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Función auxiliar: empresa del usuario autenticado actual
create or replace function auth_empresa_id()
returns uuid as $$
  select empresa_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- profiles: cada uno ve/edita el suyo; admins ven todos
create policy profiles_select_own_or_admin on profiles
  for select using (id = auth.uid() or auth_role() in ('admin', 'superadmin'));
create policy profiles_update_own on profiles
  for update using (id = auth.uid());

-- empresas_subcontratistas: visible para sus propios miembros y para admins
create policy empresas_select on empresas_subcontratistas
  for select using (id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'));
create policy empresas_admin_write on empresas_subcontratistas
  for all using (auth_role() in ('admin', 'superadmin'));

-- documentos_homologacion: sólo la propia empresa + admins
create policy documentos_select on documentos_homologacion
  for select using (empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'));
create policy documentos_write on documentos_homologacion
  for insert with check (empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'));

-- obras: lectura abierta a todo autenticado; escritura sólo admins
create policy obras_select_authenticated on obras
  for select using (auth.uid() is not null);
create policy obras_admin_write on obras
  for all using (auth_role() in ('admin', 'superadmin'));

-- postulaciones: sólo la empresa propietaria y admins
create policy postulaciones_select on postulaciones
  for select using (empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'));
create policy postulaciones_insert on postulaciones
  for insert with check (empresa_id = auth_empresa_id());
create policy postulaciones_admin_update on postulaciones
  for update using (auth_role() in ('admin', 'superadmin'));

-- club_partner_movimientos: sólo lectura para la propia empresa; escritura sólo backend/admin
create policy movimientos_select on club_partner_movimientos
  for select using (empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'));
create policy movimientos_admin_write on club_partner_movimientos
  for insert with check (auth_role() in ('admin', 'superadmin'));

-- recompensas_catalogo: lectura pública autenticada; escritura sólo admin
create policy catalogo_select on recompensas_catalogo
  for select using (auth.uid() is not null);
create policy catalogo_admin_write on recompensas_catalogo
  for all using (auth_role() in ('admin', 'superadmin'));

-- canjes: la propia empresa puede crear/leer los suyos; admins todo
create policy canjes_select on canjes
  for select using (empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'));
create policy canjes_insert on canjes
  for insert with check (empresa_id = auth_empresa_id());
create policy canjes_admin_update on canjes
  for update using (auth_role() in ('admin', 'superadmin'));

-- logs_auditoria: sólo admins pueden leer; inserción reservada a rol de servicio
create policy auditoria_select_admin on logs_auditoria
  for select using (auth_role() in ('admin', 'superadmin'));

-- ============================================================================
-- FIN — Fase 0. Pendiente de revisión antes de aplicar (`supabase db push`).
-- ============================================================================
