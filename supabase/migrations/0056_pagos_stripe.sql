-- ============================================================================
-- Pagos con Stripe: el cliente paga al adjudicar, el dinero queda retenido en Stripe
-- y solo se libera al oficio al terminar la obra, tras la verificación.
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0055.
--
-- Flujo de estados de un pago:
--   pendiente           -> creado al empezar a pagar; aún no hay dinero
--   retenido            -> Stripe confirmó el cobro; el dinero está retenido
--   terminada_oficio    -> el oficio marca la obra como terminada (empieza el plazo del cliente)
--   confirmada_cliente  -> el cliente confirma, o pasa el plazo sin respuesta (7 días por defecto)
--   aprobado_3b         -> 3B da el visto bueno final (solo desde el panel)
--   liberando / liberado -> se transfiere al oficio (importe - comisión)
--   en_disputa          -> alguien reporta un problema: el pago queda congelado hasta que decida 3B
--   reembolsando / reembolsado -> se devuelve al cliente
--   fallido / cancelado -> cobro que no llegó a buen puerto
--
-- 3B nunca toca el dinero: lo cobra y lo guarda Stripe (Connect, cargos y transferencias
-- separados). Esta migración solo guarda el estado y las reglas; los movimientos de dinero
-- los hacen las Edge Functions con la clave secreta de Stripe.
--
-- La comisión es configurable (general, por empresa o por obra). Si no hay ningún valor,
-- la comisión es 0. El % usado se guarda en cada pago.
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 1) Ajustes y comisiones
-- ---------------------------------------------------------------------------
create table if not exists ajustes_pagos (
  id boolean primary key default true check (id),          -- una sola fila
  comision_general_pct numeric(5,2) check (comision_general_pct is null or (comision_general_pct >= 0 and comision_general_pct <= 50)),
  dias_confirmacion integer not null default 7 check (dias_confirmacion between 1 and 30),
  updated_at timestamptz not null default now()
);
insert into ajustes_pagos (id) values (true) on conflict (id) do nothing;
alter table ajustes_pagos enable row level security;
drop policy if exists ajustes_pagos_admin on ajustes_pagos;
create policy ajustes_pagos_admin on ajustes_pagos
  for select using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

alter table obras add column if not exists comision_pct numeric(5,2)
  check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 50));
alter table empresas_subcontratistas add column if not exists comision_pct numeric(5,2)
  check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 50));

-- Prioridad: obra > empresa > general. null = sin comisión definida.
create or replace function comision_aplicable(p_obra_id uuid, p_empresa_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select comision_pct from obras where id = p_obra_id),
    (select comision_pct from empresas_subcontratistas where id = p_empresa_id),
    (select comision_general_pct from ajustes_pagos where id)
  );
$$;

-- Comisión en céntimos, redondeada al céntimo más cercano.
create or replace function calcular_comision_cents(p_importe_cents bigint, p_pct numeric)
returns bigint
language sql
immutable
as $$
  select case
    when p_pct is null or p_pct <= 0 or p_importe_cents is null or p_importe_cents <= 0 then 0
    else round(p_importe_cents * p_pct / 100.0)::bigint
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Cuentas de cobro de los oficios (Stripe Connect Express)
-- ---------------------------------------------------------------------------
create table if not exists stripe_cuentas (
  empresa_id uuid primary key references empresas_subcontratistas (id) on delete cascade,
  stripe_account_id text not null unique,
  detalles_enviados boolean not null default false,
  cobros_activos boolean not null default false,
  transferencias_activas boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table stripe_cuentas enable row level security;
drop policy if exists stripe_cuentas_select on stripe_cuentas;
create policy stripe_cuentas_select on stripe_cuentas
  for select using (
    empresa_id = auth_empresa_id()
    or coalesce(auth_role()::text, '') in ('admin', 'superadmin')
  );

-- ---------------------------------------------------------------------------
-- 3) Pagos
-- ---------------------------------------------------------------------------
create table if not exists pagos (
  id uuid primary key default uuid_generate_v4(),
  obra_id uuid not null references obras (id) on delete restrict,
  postulacion_id uuid not null references postulaciones (id) on delete restrict,
  empresa_id uuid not null references empresas_subcontratistas (id) on delete restrict,
  cliente_id uuid not null references profiles (id) on delete restrict,
  importe_cents bigint not null check (importe_cents > 0),
  moneda text not null default 'eur',
  comision_pct numeric(5,2),
  comision_cents bigint not null default 0,
  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b',
    'en_disputa', 'liberando', 'liberado', 'reembolsando', 'reembolsado', 'fallido', 'cancelado'
  )),
  estado_previo_disputa text,
  estado_antes_preparar text,
  stripe_payment_intent_id text unique,
  stripe_transfer_id text,
  stripe_refund_id text,
  transfer_group text not null,
  pagado_at timestamptz,
  terminada_at timestamptz,
  auto_confirma_at timestamptz,
  confirmada_at timestamptz,
  confirmada_automaticamente boolean not null default false,
  aprobado_3b_at timestamptz,
  aprobado_3b_por uuid references profiles (id),
  liberado_at timestamptz,
  importe_oficio_cents bigint,
  importe_reembolso_cents bigint,
  disputa_motivo text,
  disputa_por uuid references profiles (id),
  disputa_at timestamptz,
  resolucion_nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pagos_obra on pagos (obra_id);
create index if not exists idx_pagos_empresa on pagos (empresa_id);
create index if not exists idx_pagos_cliente on pagos (cliente_id);
create index if not exists idx_pagos_estado on pagos (estado);
-- Solo un pago "vivo" por obra
create unique index if not exists uq_pagos_obra_vivo on pagos (obra_id)
  where estado not in ('fallido', 'cancelado', 'reembolsado');

alter table pagos enable row level security;
drop policy if exists pagos_select on pagos;
create policy pagos_select on pagos
  for select using (
    cliente_id = auth.uid()
    or empresa_id = auth_empresa_id()
    or coalesce(auth_role()::text, '') in ('admin', 'superadmin')
  );

-- Eventos de Stripe ya procesados (el webhook puede recibir el mismo evento más de una vez)
create table if not exists stripe_eventos (
  id text primary key,
  tipo text not null,
  procesado_at timestamptz not null default now()
);
alter table stripe_eventos enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Empezar a pagar (lo llama el cliente al aceptar la oferta)
-- ---------------------------------------------------------------------------
create or replace function pago_iniciar(p_obra_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_obra obras%rowtype;
  v_post postulaciones%rowtype;
  v_cuenta stripe_cuentas%rowtype;
  v_cents bigint;
  v_pct numeric;
  v_pago pagos%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select * into v_obra from obras where id = p_obra_id;
  if not found then
    raise exception 'La obra no existe.';
  end if;
  if v_obra.creado_por is distinct from v_uid then
    raise exception 'Solo quien publicó la obra puede pagarla.';
  end if;
  if v_obra.estado not in ('adjudicada', 'en_curso') then
    raise exception 'La obra todavía no tiene una oferta aceptada.';
  end if;

  select * into v_post from postulaciones
    where obra_id = p_obra_id and estado = 'aceptada'
    order by updated_at desc limit 1;
  if not found then
    raise exception 'No hay una oferta aceptada para esta obra.';
  end if;

  select * into v_cuenta from stripe_cuentas where empresa_id = v_post.empresa_id;
  if not found or not v_cuenta.transferencias_activas then
    raise exception 'El oficio todavía no ha configurado su cuenta de cobro. Avisaremos cuando pueda recibir el pago.';
  end if;

  v_cents := round(v_post.oferta_economica * 100)::bigint;
  if v_cents <= 0 then
    raise exception 'El importe de la oferta no es válido.';
  end if;
  v_pct := comision_aplicable(p_obra_id, v_post.empresa_id);

  select * into v_pago from pagos
    where obra_id = p_obra_id and estado not in ('fallido', 'cancelado', 'reembolsado');
  if found then
    if v_pago.estado <> 'pendiente' then
      raise exception 'Esta obra ya está pagada.';
    end if;
    update pagos
       set importe_cents = v_cents,
           empresa_id = v_post.empresa_id,
           postulacion_id = v_post.id,
           comision_pct = v_pct,
           comision_cents = calcular_comision_cents(v_cents, v_pct),
           updated_at = now()
     where id = v_pago.id
     returning * into v_pago;
  else
    insert into pagos (obra_id, postulacion_id, empresa_id, cliente_id, importe_cents,
                       comision_pct, comision_cents, transfer_group)
    values (p_obra_id, v_post.id, v_post.empresa_id, v_uid, v_cents,
            v_pct, calcular_comision_cents(v_cents, v_pct), 'obra_' || p_obra_id::text)
    returning * into v_pago;
  end if;

  return jsonb_build_object(
    'pago_id', v_pago.id,
    'importe_cents', v_pago.importe_cents,
    'moneda', v_pago.moneda,
    'transfer_group', v_pago.transfer_group,
    'cuenta_oficio', v_cuenta.stripe_account_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Lo que hace el webhook de Stripe (solo service_role)
-- ---------------------------------------------------------------------------
create or replace function pago_marcar_retenido(p_payment_intent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_titulo text;
begin
  select * into v_pago from pagos where stripe_payment_intent_id = p_payment_intent for update;
  if not found or v_pago.estado <> 'pendiente' then
    return;  -- evento repetido o pago desconocido
  end if;
  update pagos set estado = 'retenido', pagado_at = now(), updated_at = now() where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform crear_notificacion(v_pago.empresa_id, 'pago_retenido',
    'Pago asegurado',
    'El cliente ha pagado la obra "' || coalesce(v_titulo, '') || '". El dinero queda retenido y se te liberará al terminar y verificar el trabajo.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  perform avisar_usuario(v_pago.cliente_id, 'pago_retenido',
    'Pago realizado',
    'Tu pago de la obra "' || coalesce(v_titulo, '') || '" está retenido de forma segura. Solo se entrega al oficio cuando confirmes que el trabajo está bien.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
end;
$$;

create or replace function pago_marcar_fallido(p_payment_intent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pagos set estado = 'fallido', updated_at = now()
   where stripe_payment_intent_id = p_payment_intent and estado = 'pendiente';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) El oficio marca la obra como terminada
-- ---------------------------------------------------------------------------
create or replace function pago_oficio_termina(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_dias integer;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  select * into v_pago from pagos where id = p_pago_id for update;
  if not found or v_pago.empresa_id is distinct from auth_empresa_id() then
    raise exception 'No autorizado';
  end if;
  if v_pago.estado <> 'retenido' then
    raise exception 'El pago no está en un estado que permita marcar la obra como terminada.';
  end if;

  select dias_confirmacion into v_dias from ajustes_pagos where id;
  update pagos
     set estado = 'terminada_oficio',
         terminada_at = now(),
         auto_confirma_at = now() + make_interval(days => v_dias),
         updated_at = now()
   where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform avisar_usuario(v_pago.cliente_id, 'pago_obra_terminada',
    'Obra terminada: revísala',
    'El oficio ha marcado como terminada la obra "' || coalesce(v_titulo, '') || '". Confírmala si está bien o avísanos de cualquier problema. Si no respondes en ' || v_dias || ' días, se dará por buena.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) El cliente confirma la obra
-- ---------------------------------------------------------------------------
create or replace function pago_cliente_confirma(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select * into v_pago from pagos where id = p_pago_id for update;
  if not found or v_pago.cliente_id is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_pago.estado <> 'terminada_oficio' then
    raise exception 'Todavía no se puede confirmar: el oficio no ha marcado la obra como terminada.';
  end if;
  update pagos
     set estado = 'confirmada_cliente', confirmada_at = now(), updated_at = now()
   where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform avisar_equipo('pago_pendiente_aprobar',
    'Pago listo para aprobar',
    'El cliente ha confirmado la obra "' || coalesce(v_titulo, '') || '". Falta el visto bueno de 3B.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  perform crear_notificacion(v_pago.empresa_id, 'pago_confirmado_cliente',
    'El cliente ha confirmado la obra',
    'Ahora 3B hace la comprobación final y liberará tu pago.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Reportar un problema (cliente u oficio): congela el pago
-- ---------------------------------------------------------------------------
create or replace function pago_abrir_disputa(p_pago_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 10 then
    raise exception 'Cuéntanos qué ha pasado (mínimo 10 caracteres).';
  end if;
  select * into v_pago from pagos where id = p_pago_id for update;
  if not found
     or (v_pago.cliente_id is distinct from auth.uid() and v_pago.empresa_id is distinct from auth_empresa_id()) then
    raise exception 'No autorizado';
  end if;
  if v_pago.estado not in ('retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b') then
    raise exception 'No se puede reportar un problema en este estado del pago.';
  end if;

  update pagos
     set estado_previo_disputa = estado,
         estado = 'en_disputa',
         disputa_motivo = left(trim(p_motivo), 2000),
         disputa_por = auth.uid(),
         disputa_at = now(),
         updated_at = now()
   where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform avisar_equipo('pago_disputa',
    'Problema reportado en un pago',
    'Se ha reportado un problema en la obra "' || coalesce(v_titulo, '') || '". El pago está congelado hasta que lo revise 3B.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  if v_pago.cliente_id is distinct from auth.uid() then
    perform avisar_usuario(v_pago.cliente_id, 'pago_disputa',
      'Pago en revisión',
      'Se ha reportado un problema en la obra "' || coalesce(v_titulo, '') || '". 3B lo revisará antes de mover el dinero.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  else
    perform crear_notificacion(v_pago.empresa_id, 'pago_disputa',
      'Pago en revisión',
      'El cliente ha reportado un problema en la obra "' || coalesce(v_titulo, '') || '". 3B lo revisará antes de mover el dinero.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Confirmación automática por silencio del cliente (la ejecuta un cron cada hora)
-- ---------------------------------------------------------------------------
create or replace function pagos_autoconfirmar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select id, obra_id from pagos
     where estado = 'terminada_oficio' and auto_confirma_at <= now()
     for update skip locked
  loop
    update pagos
       set estado = 'confirmada_cliente', confirmada_at = now(),
           confirmada_automaticamente = true, updated_at = now()
     where id = r.id;
    perform avisar_equipo('pago_pendiente_aprobar',
      'Pago listo para aprobar',
      'Ha pasado el plazo sin respuesta del cliente: la obra se da por confirmada. Falta el visto bueno de 3B.',
      jsonb_build_object('obra_id', r.obra_id, 'pago_id', r.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

do $$
begin
  perform cron.unschedule('pagos_autoconfirmar');
exception when others then null;
end $$;
do $$
begin
  perform cron.schedule('pagos_autoconfirmar', '7 * * * *', 'select public.pagos_autoconfirmar()');
exception when others then
  raise notice 'pg_cron no disponible: activa la extensión y programa a mano select pagos_autoconfirmar() cada hora.';
end $$;

-- ---------------------------------------------------------------------------
-- 10) Panel de 3B
-- ---------------------------------------------------------------------------
create or replace function panel_pagos(p_estado text default null)
returns table (
  id uuid, obra_id uuid, obra_titulo text, empresa_id uuid, empresa_nombre text,
  cliente_email text, estado text, importe_cents bigint, comision_pct numeric,
  comision_cents bigint, moneda text, pagado_at timestamptz, terminada_at timestamptz,
  auto_confirma_at timestamptz, confirmada_at timestamptz, confirmada_automaticamente boolean,
  disputa_motivo text, disputa_at timestamptz, estado_previo_disputa text,
  stripe_payment_intent_id text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select p.id, p.obra_id, o.titulo, p.empresa_id, e.nombre, pr.email, p.estado,
           p.importe_cents, p.comision_pct, p.comision_cents, p.moneda, p.pagado_at,
           p.terminada_at, p.auto_confirma_at, p.confirmada_at, p.confirmada_automaticamente,
           p.disputa_motivo, p.disputa_at, p.estado_previo_disputa,
           p.stripe_payment_intent_id, p.created_at
      from pagos p
      join obras o on o.id = p.obra_id
      join empresas_subcontratistas e on e.id = p.empresa_id
      left join profiles pr on pr.id = p.cliente_id
     where p_estado is null or p.estado = p_estado
     order by case p.estado
                when 'en_disputa' then 0
                when 'confirmada_cliente' then 1
                else 2 end,
              p.created_at desc;
end;
$$;

create or replace function panel_ajustes_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a ajustes_pagos%rowtype;
begin
  perform panel_exigir_admin();
  select * into v_a from ajustes_pagos where id;
  return jsonb_build_object(
    'comision_general_pct', v_a.comision_general_pct,
    'dias_confirmacion', v_a.dias_confirmacion
  );
end;
$$;

create or replace function panel_guardar_ajustes_pagos(p_comision_general_pct numeric, p_dias_confirmacion integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if p_comision_general_pct is not null and (p_comision_general_pct < 0 or p_comision_general_pct > 50) then
    raise exception 'La comisión debe estar entre 0 y 50 %%.';
  end if;
  if p_dias_confirmacion is null or p_dias_confirmacion < 1 or p_dias_confirmacion > 30 then
    raise exception 'El plazo de confirmación debe estar entre 1 y 30 días.';
  end if;
  update ajustes_pagos
     set comision_general_pct = p_comision_general_pct,
         dias_confirmacion = p_dias_confirmacion,
         updated_at = now()
   where id;
end;
$$;

-- Comisión propia de una empresa o de una obra (null = usar la general)
create or replace function panel_guardar_comision(p_tipo text, p_id uuid, p_pct numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if p_pct is not null and (p_pct < 0 or p_pct > 50) then
    raise exception 'La comisión debe estar entre 0 y 50 %%.';
  end if;
  if p_tipo = 'empresa' then
    update empresas_subcontratistas set comision_pct = p_pct, updated_at = now() where id = p_id;
  elsif p_tipo = 'obra' then
    update obras set comision_pct = p_pct, updated_at = now() where id = p_id;
  else
    raise exception 'Tipo no válido.';
  end if;
end;
$$;


-- Cambiar la comisión de un pago concreto antes de liberarlo (null = sin comisión)
create or replace function panel_fijar_comision_pago(p_pago_id uuid, p_pct numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  if p_pct is not null and (p_pct < 0 or p_pct > 50) then
    raise exception 'La comisión debe estar entre 0 y 50 %%.';
  end if;
  update pagos
     set comision_pct = p_pct,
         comision_cents = calcular_comision_cents(importe_cents, p_pct),
         updated_at = now()
   where id = p_pago_id
     and estado in ('pendiente', 'retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b', 'en_disputa');
  if not found then
    raise exception 'Este pago ya no admite cambios de comisión.';
  end if;
end;
$$;

-- Prepara la liberación o el reembolso. Lo llama la Edge Function con el JWT del admin;
-- devuelve los importes y deja el pago en 'liberando' / 'reembolsando' para que nadie lo
-- mueva dos veces. Acciones: liberar (todo al oficio), reembolsar (todo al cliente),
-- dividir (p_importe_oficio_cents al oficio y el resto al cliente).
create or replace function panel_preparar_pago(
  p_pago_id uuid, p_accion text, p_importe_oficio_cents bigint default null, p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_oficio bigint;
  v_reembolso bigint;
  v_pct numeric;
  v_comision bigint;
  v_cuenta stripe_cuentas%rowtype;
begin
  perform panel_exigir_admin();
  select * into v_pago from pagos where id = p_pago_id for update;
  if not found then
    raise exception 'El pago no existe.';
  end if;

  if p_accion = 'liberar' and v_pago.estado not in ('confirmada_cliente', 'aprobado_3b', 'en_disputa') then
    raise exception 'Para liberar, el cliente debe haber confirmado la obra (o el pago estar en disputa).';
  end if;
  if p_accion in ('reembolsar', 'dividir') and v_pago.estado not in ('retenido', 'terminada_oficio', 'confirmada_cliente', 'aprobado_3b', 'en_disputa') then
    raise exception 'Este pago no se puede reembolsar en su estado actual.';
  end if;
  if p_accion not in ('liberar', 'reembolsar', 'dividir') then
    raise exception 'Acción no válida.';
  end if;

  if p_accion = 'liberar' then
    v_oficio := v_pago.importe_cents; v_reembolso := 0;
  elsif p_accion = 'reembolsar' then
    v_oficio := 0; v_reembolso := v_pago.importe_cents;
  else
    if p_importe_oficio_cents is null or p_importe_oficio_cents <= 0 or p_importe_oficio_cents >= v_pago.importe_cents then
      raise exception 'El importe para el oficio debe ser mayor que 0 y menor que el total.';
    end if;
    v_oficio := p_importe_oficio_cents;
    v_reembolso := v_pago.importe_cents - v_oficio;
  end if;

  -- Si no había comisión definida al cobrar, se toma la vigente ahora.
  v_pct := coalesce(v_pago.comision_pct, comision_aplicable(v_pago.obra_id, v_pago.empresa_id));
  v_comision := calcular_comision_cents(v_oficio, v_pct);

  select * into v_cuenta from stripe_cuentas where empresa_id = v_pago.empresa_id;
  if v_oficio > 0 and (not found or not v_cuenta.transferencias_activas) then
    raise exception 'La cuenta de cobro del oficio no está activa.';
  end if;

  update pagos
     set estado = case when v_oficio > 0 then 'liberando' else 'reembolsando' end,
         estado_antes_preparar = estado,
         comision_pct = v_pct,
         comision_cents = v_comision,
         importe_oficio_cents = v_oficio,
         importe_reembolso_cents = v_reembolso,
         aprobado_3b_at = coalesce(aprobado_3b_at, now()),
         aprobado_3b_por = coalesce(aprobado_3b_por, auth.uid()),
         resolucion_nota = nullif(left(trim(coalesce(p_nota, '')), 2000), ''),
         updated_at = now()
   where id = v_pago.id;

  return jsonb_build_object(
    'pago_id', v_pago.id,
    'payment_intent', v_pago.stripe_payment_intent_id,
    'transfer_group', v_pago.transfer_group,
    'cuenta_oficio', v_cuenta.stripe_account_id,
    'moneda', v_pago.moneda,
    'transferir_cents', greatest(v_oficio - v_comision, 0),
    'comision_cents', v_comision,
    'reembolsar_cents', v_reembolso
  );
end;
$$;

-- Si Stripe falla a mitad, el panel puede devolver el pago a su estado anterior
create or replace function panel_deshacer_preparacion(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  update pagos
     set estado = case when stripe_transfer_id is null and stripe_refund_id is null then
                         coalesce(estado_antes_preparar, 'confirmada_cliente')
                       else estado end,
         updated_at = now()
   where id = p_pago_id and estado in ('liberando', 'reembolsando');
end;
$$;

-- La Edge Function confirma que Stripe hizo el movimiento (solo service_role)
create or replace function pago_finalizar(p_pago_id uuid, p_transfer_id text, p_refund_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_titulo text;
  v_nuevo text;
begin
  select * into v_pago from pagos where id = p_pago_id for update;
  if not found or v_pago.estado not in ('liberando', 'reembolsando') then
    return;
  end if;
  v_nuevo := case when v_pago.estado = 'liberando' then 'liberado' else 'reembolsado' end;
  update pagos
     set estado = v_nuevo,
         stripe_transfer_id = coalesce(p_transfer_id, stripe_transfer_id),
         stripe_refund_id = coalesce(p_refund_id, stripe_refund_id),
         liberado_at = case when v_nuevo = 'liberado' then now() else liberado_at end,
         updated_at = now()
   where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  if v_nuevo = 'liberado' then
    perform crear_notificacion(v_pago.empresa_id, 'pago_liberado',
      'Pago liberado',
      'Te hemos enviado el pago de la obra "' || coalesce(v_titulo, '') || '". Llegará a tu cuenta según el calendario de Stripe.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
    perform avisar_usuario(v_pago.cliente_id, 'pago_liberado',
      'Pago entregado al oficio',
      'El pago de la obra "' || coalesce(v_titulo, '') || '" se ha entregado al oficio.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  else
    perform avisar_usuario(v_pago.cliente_id, 'pago_reembolsado',
      'Pago reembolsado',
      'Te hemos devuelto el pago de la obra "' || coalesce(v_titulo, '') || '". Tu banco puede tardar unos días en mostrarlo.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11) Permisos
-- ---------------------------------------------------------------------------
revoke all on function comision_aplicable(uuid, uuid) from public, anon, authenticated;
revoke all on function calcular_comision_cents(bigint, numeric) from public, anon;
revoke all on function pago_marcar_retenido(text) from public, anon, authenticated;
revoke all on function pago_marcar_fallido(text) from public, anon, authenticated;
revoke all on function pago_finalizar(uuid, text, text) from public, anon, authenticated;
revoke all on function pagos_autoconfirmar() from public, anon, authenticated;
grant execute on function pago_marcar_retenido(text) to service_role;
grant execute on function pago_marcar_fallido(text) to service_role;
grant execute on function pago_finalizar(uuid, text, text) to service_role;
grant execute on function pagos_autoconfirmar() to service_role;

revoke all on function pago_iniciar(uuid) from public, anon;
revoke all on function pago_oficio_termina(uuid) from public, anon;
revoke all on function pago_cliente_confirma(uuid) from public, anon;
revoke all on function pago_abrir_disputa(uuid, text) from public, anon;
grant execute on function pago_iniciar(uuid) to authenticated;
grant execute on function pago_oficio_termina(uuid) to authenticated;
grant execute on function pago_cliente_confirma(uuid) to authenticated;
grant execute on function pago_abrir_disputa(uuid, text) to authenticated;

revoke all on function panel_pagos(text) from public, anon;
revoke all on function panel_ajustes_pagos() from public, anon;
revoke all on function panel_guardar_ajustes_pagos(numeric, integer) from public, anon;
revoke all on function panel_guardar_comision(text, uuid, numeric) from public, anon;
revoke all on function panel_preparar_pago(uuid, text, bigint, text) from public, anon;
revoke all on function panel_deshacer_preparacion(uuid) from public, anon;
revoke all on function panel_fijar_comision_pago(uuid, numeric) from public, anon;
grant execute on function panel_pagos(text) to authenticated;
grant execute on function panel_ajustes_pagos() to authenticated;
grant execute on function panel_guardar_ajustes_pagos(numeric, integer) to authenticated;
grant execute on function panel_guardar_comision(text, uuid, numeric) to authenticated;
grant execute on function panel_preparar_pago(uuid, text, bigint, text) to authenticated;
grant execute on function panel_deshacer_preparacion(uuid) to authenticated;
grant execute on function panel_fijar_comision_pago(uuid, numeric) to authenticated;