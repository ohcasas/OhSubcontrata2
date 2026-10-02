-- ============================================================================
-- OH Network — Fase 2: "OH Recomienda" (pipeline comercial de referencias)
-- ============================================================================
-- IMPORTANTE: ejecutar 0023_add_rol_referidor.sql ANTES que este archivo.
--
-- Sustituye por completo a la primera versión de este archivo (cálculo
-- automático de un % sobre el precio de venta). Esa primera versión nunca
-- llegó a ejecutarse en producción — se descarta sin dejar rastro, siguiendo
-- el documento "OH Network" que Ainhoa recibió de Dirección el 01/10/2026:
--
--   - Cualquier miembro puede registrar una referencia comercial (un
--     posible cliente), no solo un rol "referidor" dedicado — un
--     subcontratista puede referir igual que una inmobiliaria.
--   - El seguimiento de una referencia pasa por 7 ESTADOS, no un simple
--     "pendiente/aceptada": enviado -> contactado -> visita -> presupuesto
--     -> reserva -> venta -> comisión disponible (+ descartado, si no
--     prospera).
--   - La recompensa SÍ es un porcentaje (decisión final de Dirección,
--     01/10/2026, tras valorar también los importes fijos que proponía
--     el documento): 2% sobre el precio de venta si quien refiere es un
--     referidor dedicado, 1% si es un subcontratista que también refiere.
--     Se calcula sola al llegar al estado 'venta'. El porcentaje vive en
--     una tabla editable (reglas_recompensa_referido), no fijado en el
--     código, por si Dirección lo cambia más adelante.
--   - Transparencia: la persona que refiere tiene que poder ver en qué
--     estado está su referencia sin preguntar — cada cambio de estado
--     dispara una notificación.
--
-- Lo que esta migración NO resuelve, a propósito (son las mismas reservas
-- legales que ya marcaba el documento, sección 11):
--   - Consentimiento del cliente potencial: se registra un booleano
--     obligatorio, pero la base legal real (qué se le dice, cómo se
--     guarda la prueba) es una decisión legal de OH Casas, no de la app.
--   - Fiscalidad del pago (factura, retención, alta de autónomo): igual
--     que con el Club Partner, la app registra el acuerdo; el pago real
--     y sus papeles van por fuera.
--   - Prevención de fraude/auto-referencias: de momento solo hay una
--     restricción simple (no puedes referirte una obra a ti mismo como
--     adjudicatario — ver más abajo); reglas más finas quedan para cuando
--     haya volumen real que analizar.

-- ----------------------------------------------------------------------------
-- 0) Base ligera para "varios roles por usuario"
-- ----------------------------------------------------------------------------
-- El documento pide expresamente que el modelo de datos ya contemple esto
-- desde ahora, para no tener que rehacerlo más tarde. De momento se deja
-- preparada la tabla, sin tocar `profiles.role` (que sigue siendo el "rol
-- principal" y rige todo el acceso ya existente — subcontratistas, obras,
-- Club Partner, etc. — sin ningún cambio ni riesgo sobre lo que ya
-- funciona). `profile_roles` es para capacidades ADICIONALES: hoy no hace
-- falta ninguna fila aquí para poder referir (ver más abajo, es abierto a
-- cualquier persona con sesión), pero queda lista para cuando haga falta
-- un segundo rol de verdad (p.ej. un arquitecto que también sea
-- subcontratista).
create table if not exists profile_roles (
  profile_id uuid not null references profiles (id) on delete cascade,
  role user_role not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

comment on table profile_roles is
  'Roles ADICIONALES de una persona, más allá de su profiles.role principal. Preparado para el modelo "varios roles por usuario" del documento OH Network; todavía sin filas reales en la Fase 2.';

alter table profile_roles enable row level security;

create policy profile_roles_select on profile_roles
  for select using (profile_id = auth.uid() or auth_role() in ('admin', 'superadmin'));

create policy profile_roles_admin_write on profile_roles
  for all using (auth_role() in ('admin', 'superadmin'));

-- ----------------------------------------------------------------------------
-- 1) Porcentaje de comisión por rol — configurable, no fijado en el código
-- ----------------------------------------------------------------------------
-- Decisión final de Dirección (01/10/2026): porcentaje sobre el precio de
-- venta, no importes fijos por hito — 2% si quien refiere es un referidor
-- dedicado (inmobiliaria/persona externa), 1% si es un subcontratista ya
-- registrado que también refiere.
create table if not exists reglas_recompensa_referido (
  role user_role primary key,
  porcentaje numeric(4,2) not null,
  descripcion text
);

comment on table reglas_recompensa_referido is
  'Porcentaje de comisión sobre el precio de venta, según el rol de quien refiere. Editable desde Supabase si Dirección cambia los porcentajes.';

insert into reglas_recompensa_referido (role, porcentaje, descripcion) values
  ('referidor', 2.00, 'Inmobiliaria o persona externa dedicada a referir'),
  ('subcontratista', 1.00, 'Subcontratista ya registrado que también refiere clientes')
on conflict (role) do nothing;

alter table reglas_recompensa_referido enable row level security;

create policy reglas_recompensa_select on reglas_recompensa_referido
  for select using (auth.uid() is not null);

create policy reglas_recompensa_admin_write on reglas_recompensa_referido
  for all using (auth_role() in ('admin', 'superadmin'));

-- ----------------------------------------------------------------------------
-- 2) El pipeline: una fila por cada cliente potencial referido
-- ----------------------------------------------------------------------------
create table if not exists referencias_comerciales (
  id uuid primary key default uuid_generate_v4(),
  referidor_id uuid not null references profiles (id),
  nombre_cliente text not null,
  telefono_cliente text,
  email_cliente text,
  consentimiento_obtenido boolean not null default false,
  estado text not null default 'enviado' check (
    estado in ('enviado', 'contactado', 'visita', 'presupuesto', 'reserva', 'venta', 'comision_disponible', 'descartado')
  ),
  precio_venta numeric(12,2),            -- precio de venta al cliente final (sin IVA); se fija al llegar a 'venta'
  obra_id uuid references obras (id),   -- se enlaza si la venta llega a convertirse en una obra real
  notas_admin text,
  motivo_descarte text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table referencias_comerciales is
  'Una fila por cada "conozco a alguien que quiere construir" enviado desde la app. El pipeline de 7 estados y su seguimiento (módulo "OH Recomienda" del documento OH Network).';

create index if not exists idx_referencias_referidor on referencias_comerciales (referidor_id, created_at desc);

create trigger trg_referencias_comerciales_updated_at before update on referencias_comerciales
  for each row execute function set_updated_at();

alter table referencias_comerciales enable row level security;

-- Cualquier persona con sesión ve las suyas; el admin las ve todas.
create policy referencias_select on referencias_comerciales
  for select using (referidor_id = auth.uid() or auth_role() in ('admin', 'superadmin'));

-- El estado y el enlace a obra solo los toca el admin (vía la función de
-- abajo, no directamente) — por eso no hay política de update aquí: sin
-- una política de update, nadie puede escribir directamente a la tabla
-- salvo las funciones security definer, que sí pueden saltarse RLS.

-- ----------------------------------------------------------------------------
-- 3) Recompensas generadas (una por hito alcanzado, no por referencia)
-- ----------------------------------------------------------------------------
create table if not exists recompensas_referido (
  id uuid primary key default uuid_generate_v4(),
  referencia_id uuid not null references referencias_comerciales (id),
  referidor_id uuid not null references profiles (id),
  rol_referidor user_role not null,      -- copia del rol en el momento de generarse
  porcentaje numeric(4,2) not null,
  base_imponible numeric(12,2) not null, -- copia de precio_venta en ese momento
  importe numeric(12,2) not null,        -- base_imponible * porcentaje / 100
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'pagada', 'rechazada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referencia_id)   -- una sola recompensa por referencia (se genera al llegar a 'venta')
);

comment on table recompensas_referido is
  'Una fila por cada recompensa económica generada al alcanzar un hito (reserva o venta) de una referencia comercial. El pago real se gestiona fuera de la app.';

create trigger trg_recompensas_referido_updated_at before update on recompensas_referido
  for each row execute function set_updated_at();

alter table recompensas_referido enable row level security;

create policy recompensas_referido_select on recompensas_referido
  for select using (referidor_id = auth.uid() or auth_role() in ('admin', 'superadmin'));

-- ----------------------------------------------------------------------------
-- 4) Registrar una referencia — abierto a cualquier persona con sesión
-- ----------------------------------------------------------------------------
-- El documento es explícito: "Todo miembro puede registrar una referencia
-- de un posible cliente". No hace falta ningún rol especial — un
-- subcontratista, un referidor dedicado, cualquiera con cuenta.
create or replace function crear_referencia_comercial(
  p_nombre_cliente text,
  p_telefono_cliente text,
  p_email_cliente text,
  p_consentimiento boolean
)
returns referencias_comerciales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referencia referencias_comerciales;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if trim(coalesce(p_nombre_cliente, '')) = '' then
    raise exception 'Indica el nombre de la persona que quiere construir';
  end if;
  if p_consentimiento is distinct from true then
    raise exception 'Hace falta confirmar que la persona referida ha dado su consentimiento para ser contactada';
  end if;

  insert into referencias_comerciales (referidor_id, nombre_cliente, telefono_cliente, email_cliente, consentimiento_obtenido)
  values (v_uid, trim(p_nombre_cliente), nullif(trim(coalesce(p_telefono_cliente, '')), ''), nullif(trim(coalesce(p_email_cliente, '')), ''), true)
  returning * into v_referencia;

  return v_referencia;
end;
$$;

revoke execute on function crear_referencia_comercial(text, text, text, boolean) from public, anon;
grant execute on function crear_referencia_comercial(text, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Avanzar el pipeline — solo admin. Genera recompensa en 'reserva'/'venta'
-- ----------------------------------------------------------------------------
create or replace function actualizar_estado_referencia(
  p_referencia_id uuid,
  p_nuevo_estado text,
  p_motivo_descarte text default null,
  p_obra_id uuid default null,
  p_precio_venta numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referidor_id uuid;
  v_nombre_cliente text;
  v_estado_actual text;
  v_precio_venta numeric(12,2);
  v_rol_referidor user_role;
  v_porcentaje numeric(4,2);
  v_importe numeric(12,2);
  v_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  if p_nuevo_estado not in ('enviado', 'contactado', 'visita', 'presupuesto', 'reserva', 'venta', 'comision_disponible', 'descartado') then
    raise exception 'Estado no válido: %', p_nuevo_estado;
  end if;

  select referidor_id, nombre_cliente, estado, coalesce(p_precio_venta, precio_venta)
    into v_referidor_id, v_nombre_cliente, v_estado_actual, v_precio_venta
    from referencias_comerciales
    where id = p_referencia_id
    for update;

  if v_referidor_id is null then
    raise exception 'Referencia no encontrada';
  end if;

  if p_nuevo_estado = 'venta' and v_precio_venta is null then
    raise exception 'Para marcar esta referencia como venta hace falta indicar el precio de venta al cliente';
  end if;

  update referencias_comerciales
    set estado = p_nuevo_estado,
        motivo_descarte = case when p_nuevo_estado = 'descartado' then p_motivo_descarte else motivo_descarte end,
        obra_id = coalesce(p_obra_id, obra_id),
        precio_venta = coalesce(p_precio_venta, precio_venta),
        updated_at = now()
    where id = p_referencia_id;

  -- Comisión automática al llegar a 'venta' — % según el rol de quien
  -- refiere, sobre el precio de venta. Una sola vez por referencia (el
  -- unique de recompensas_referido la blinda de duplicados si la venta se
  -- marca, se revierte y se vuelve a marcar).
  if p_nuevo_estado = 'venta' then
    select role into v_rol_referidor from profiles where id = v_referidor_id;
    select porcentaje into v_porcentaje from reglas_recompensa_referido where role = v_rol_referidor;

    if v_porcentaje is not null then
      v_importe := round(v_precio_venta * v_porcentaje / 100, 2);

      insert into recompensas_referido (referencia_id, referidor_id, rol_referidor, porcentaje, base_imponible, importe)
      values (p_referencia_id, v_referidor_id, v_rol_referidor, v_porcentaje, v_precio_venta, v_importe)
      on conflict (referencia_id) do nothing;
    end if;
  end if;

  -- Transparencia: quien refiere se entera del cambio sin tener que
  -- preguntar. Se reutiliza crear_notificacion(), que reparte el aviso a
  -- todos los profiles de esa empresa (lo normal es que solo haya uno).
  select empresa_id into v_empresa_id from profiles where id = v_referidor_id;
  if v_empresa_id is not null then
    perform crear_notificacion(
      v_empresa_id,
      'referencia_actualizada',
      'Tu recomendación ha avanzado',
      'La recomendación de «' || v_nombre_cliente || '» ha pasado a: ' || p_nuevo_estado || '.'
        || case when p_nuevo_estado = 'venta' and v_importe is not null
             then ' Se ha generado una comisión de ' || v_importe || ' € (' || v_porcentaje || '% sobre ' || v_precio_venta || ' €).'
             else '' end,
      jsonb_build_object('referencia_id', p_referencia_id, 'estado', p_nuevo_estado)
    );
  end if;
end;
$$;

revoke execute on function actualizar_estado_referencia(uuid, text, text, uuid, numeric) from public, anon;
grant execute on function actualizar_estado_referencia(uuid, text, text, uuid, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) Aceptar una recompensa (la persona referidora, desde la app)
-- ----------------------------------------------------------------------------
create or replace function aceptar_recompensa_referido(p_recompensa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referidor_id uuid;
  v_estado text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select referidor_id, estado into v_referidor_id, v_estado
    from recompensas_referido
    where id = p_recompensa_id
    for update;

  if v_referidor_id is null then
    raise exception 'Recompensa no encontrada';
  end if;
  if v_referidor_id <> v_uid then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta recompensa ya se ha resuelto';
  end if;

  update recompensas_referido set estado = 'aceptada', updated_at = now() where id = p_recompensa_id;
end;
$$;

revoke execute on function aceptar_recompensa_referido(uuid) from public, anon;
grant execute on function aceptar_recompensa_referido(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Registro de un "referidor" dedicado (inmobiliaria o persona sin más
-- rol) — igual que handle_new_subcontratista, pero CIF/empresa opcionales.
-- Un subcontratista NO necesita pasar por aquí para poder referir: ya
-- puede hacerlo con su cuenta normal (ver punto 4).
-- ----------------------------------------------------------------------------
create or replace function handle_new_referidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_completo text;
  v_telefono text;
  v_nombre_empresa text;
  v_cif text;
  v_empresa_id uuid;
begin
  if new.raw_user_meta_data ->> 'rol_solicitado' is distinct from 'referidor' then
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
  values (new.id, 'referidor', v_nombre_completo, v_telefono, new.email, v_empresa_id);

  return new;
end;
$$;

drop trigger if exists trg_handle_new_referidor on auth.users;
create trigger trg_handle_new_referidor
  after insert on auth.users
  for each row execute function handle_new_referidor();