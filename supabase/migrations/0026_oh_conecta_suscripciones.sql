-- ============================================================================
-- OH Conecta: cuentas de pago por suscripción (promotor, constructora,
-- arquitecto, proveedor, profesional, administrador)
-- ============================================================================
-- IMPORTANTE: ejecutar 0025_add_roles_oh_conecta.sql ANTES que este archivo.
--
-- Esta migración deja montado el registro y el seguimiento de la
-- suscripción de cada cuenta nueva. Lo que NO hace, a propósito, porque
-- todavía no hay cuenta de Stripe conectada: cobrar de verdad. Por eso:
--   - El precio mensual de cada rol vive en una tabla editable
--     (precios_suscripcion), vacía hasta que Dirección decida las cifras.
--   - Cada cuenta nueva nace con una fila en 'suscripciones' en estado
--     'pendiente_pago' — se registra la intención, no el cobro.
--   - Los campos de Stripe (stripe_customer_id, stripe_subscription_id)
--     están preparados pero se rellenan más adelante, cuando se conecte
--     de verdad una Edge Function de Supabase con las claves de Stripe.
--   - NO se ha añadido ningún bloqueo de acceso por falta de pago — eso
--     se hace en el mismo momento en que se conecte Stripe, no antes (si
--     se bloqueara ya, nadie podría ni entrar a pagar).

-- ----------------------------------------------------------------------------
-- 1) Precio mensual por rol — configurable, vacío hasta que se decida
-- ----------------------------------------------------------------------------
create table if not exists precios_suscripcion (
  role user_role primary key check (
    role in ('promotor', 'constructora', 'arquitecto', 'proveedor', 'profesional', 'administrador')
  ),
  precio_mensual numeric(10,2),   -- NULL = todavía sin fijar
  descripcion text
);

comment on table precios_suscripcion is
  'Precio mensual de la suscripción de OH Conecta por tipo de cuenta. NULL = sin fijar todavía. Editar desde Supabase cuando Dirección confirme las cifras.';

insert into precios_suscripcion (role) values
  ('promotor'), ('constructora'), ('arquitecto'), ('proveedor'), ('profesional'), ('administrador')
on conflict (role) do nothing;

alter table precios_suscripcion enable row level security;

create policy precios_suscripcion_select on precios_suscripcion
  for select using (auth.uid() is not null);

create policy precios_suscripcion_admin_write on precios_suscripcion
  for all using (auth_role() in ('admin', 'superadmin'));

-- ----------------------------------------------------------------------------
-- 2) Suscripciones — una fila por cuenta de pago
-- ----------------------------------------------------------------------------
create table if not exists suscripciones (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles (id) on delete cascade,
  role user_role not null,
  estado text not null default 'pendiente_pago' check (
    estado in ('pendiente_pago', 'activa', 'impagada', 'cancelada')
  ),
  precio_mensual numeric(10,2),         -- copia del precio en el momento de darse de alta
  stripe_customer_id text,
  stripe_subscription_id text,
  fecha_inicio timestamptz,
  fecha_proximo_cobro timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)   -- una persona, una suscripción
);

comment on table suscripciones is
  'Suscripción mensual de una cuenta de OH Conecta (promotor/constructora/arquitecto/proveedor/profesional/administrador). Nace en pendiente_pago; pasa a activa cuando se conecte Stripe y el primer cobro se confirme.';

create trigger trg_suscripciones_updated_at before update on suscripciones
  for each row execute function set_updated_at();

alter table suscripciones enable row level security;

create policy suscripciones_select on suscripciones
  for select using (profile_id = auth.uid() or auth_role() in ('admin', 'superadmin'));

create policy suscripciones_admin_write on suscripciones
  for all using (auth_role() in ('admin', 'superadmin'));

-- ----------------------------------------------------------------------------
-- 3) Registro — una cuenta nueva de cualquiera de los 6 roles de pago
-- ----------------------------------------------------------------------------
-- Mismo patrón que handle_new_referidor (0024): CIF/nombre de empresa
-- opcionales (un arquitecto o un profesional puede registrarse a título
-- personal, sin empresa detrás).
create or replace function handle_new_cuenta_oh_conecta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_nombre_completo text;
  v_telefono text;
  v_nombre_empresa text;
  v_cif text;
  v_empresa_id uuid;
  v_precio numeric(10,2);
begin
  v_rol := new.raw_user_meta_data ->> 'rol_solicitado';
  if v_rol not in ('promotor', 'constructora', 'arquitecto', 'proveedor', 'profesional', 'administrador') then
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

  select precio_mensual into v_precio from precios_suscripcion where role = v_rol::user_role;

  insert into suscripciones (profile_id, role, precio_mensual)
  values (new.id, v_rol::user_role, v_precio);

  return new;
end;
$$;

drop trigger if exists trg_handle_new_cuenta_oh_conecta on auth.users;
create trigger trg_handle_new_cuenta_oh_conecta
  after insert on auth.users
  for each row execute function handle_new_cuenta_oh_conecta();

-- ----------------------------------------------------------------------------
-- 4) Blindaje: que este registro no choque con los de subcontratista/
-- referidor si alguien manda nombre_empresa sin querer disparar el otro.
-- Ya protegíamos subcontratista contra referidor en 0024; ahora hace falta
-- protegerlo también contra estos 6 roles nuevos (y viceversa, aunque los
-- disparadores de estos 6 ya solo actúan si rol_solicitado coincide, así
-- que el único lado que falta blindar es handle_new_subcontratista).
-- ----------------------------------------------------------------------------
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
  if new.raw_user_meta_data ->> 'rol_solicitado' is not null
     and new.raw_user_meta_data ->> 'rol_solicitado' <> 'subcontratista' then
    return new;
  end if;

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

  perform disparar_webhook('empresa.registrada', jsonb_build_object(
    'empresa_id', v_empresa_id,
    'nombre', v_nombre_empresa,
    'cif', v_cif,
    'especialidad', v_especialidad,
    'contacto_nombre', v_nombre_completo,
    'contacto_telefono', v_telefono,
    'contacto_email', new.email
  ));

  return new;
end;
$$;