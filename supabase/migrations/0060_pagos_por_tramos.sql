-- ============================================================================
-- Pagos por tramos: el cliente paga la obra entera de una vez (queda retenida) y el dinero
-- se libera al oficio poco a poco, tramo a tramo (por ejemplo 30 % / 40 % / 30 %).
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0056, 0058 y 0059.
--
-- Cómo funciona:
--   * El oficio propone el calendario en su oferta (postulaciones.plan_pagos). Sin plan, la obra
--     se paga y libera como hasta ahora (un único tramo): nada cambia para esas obras.
--   * Al empezar a pagar, el plan se copia a la tabla pago_tramos (un tramo = un hito).
--   * Cada tramo sigue este camino: pendiente -> terminado_oficio -> confirmado_cliente -> liberando -> liberado.
--     El oficio marca el tramo como terminado, el cliente lo confirma (o pasa el plazo sin respuesta)
--     y 3B aprueba y libera ese tramo desde el panel.
--   * El pago (pagos) sigue 'retenido' mientras queden tramos; pasa a 'liberado' al liberar el último.
--   * Un problema reportado congela todo el pago. 3B decide qué hacer con lo que queda
--     (liberar, devolver o dividir el saldo pendiente) desde el panel, como siempre.
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 1) Plan de pagos en la oferta
-- ---------------------------------------------------------------------------
create or replace function plan_pagos_valido(p jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  e jsonb;
  v_suma numeric := 0;
  v_n integer;
begin
  if p is null then
    return true;                                   -- sin plan = un solo pago
  end if;
  if jsonb_typeof(p) <> 'array' then
    return false;
  end if;
  v_n := jsonb_array_length(p);
  if v_n < 2 or v_n > 6 then
    return false;
  end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'pct') is distinct from 'number'
       or jsonb_typeof(e -> 'titulo') is distinct from 'string'
       or length(trim(e ->> 'titulo')) = 0
       or length(e ->> 'titulo') > 40
       or (e ->> 'pct')::numeric <= 0
       or (e ->> 'pct')::numeric >= 100 then
      return false;
    end if;
    v_suma := v_suma + (e ->> 'pct')::numeric;
  end loop;
  return v_suma = 100;
end;
$$;

alter table postulaciones add column if not exists plan_pagos jsonb;
alter table postulaciones drop constraint if exists postulaciones_plan_pagos_check;
alter table postulaciones add constraint postulaciones_plan_pagos_check check (plan_pagos_valido(plan_pagos));

-- ---------------------------------------------------------------------------
-- 2) Tramos del pago
-- ---------------------------------------------------------------------------
alter table pagos add column if not exists con_tramos boolean not null default false;
alter table pagos add column if not exists liberado_cents bigint not null default 0;

create table if not exists pago_tramos (
  id uuid primary key default uuid_generate_v4(),
  pago_id uuid not null references pagos (id) on delete cascade,
  orden integer not null check (orden >= 1),
  titulo text not null,
  pct numeric(5,2) not null,
  importe_cents bigint not null check (importe_cents > 0),
  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'terminado_oficio', 'confirmado_cliente', 'liberando', 'liberado', 'cerrado'
  )),
  estado_antes_preparar text,
  terminado_at timestamptz,
  auto_confirma_at timestamptz,
  confirmado_at timestamptz,
  confirmado_automaticamente boolean not null default false,
  liberado_at timestamptz,
  comision_cents bigint not null default 0,
  stripe_transfer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pago_id, orden)
);
create index if not exists idx_pago_tramos_pago on pago_tramos (pago_id);
create index if not exists idx_pago_tramos_estado on pago_tramos (estado);

alter table pago_tramos enable row level security;
drop policy if exists pago_tramos_select on pago_tramos;
create policy pago_tramos_select on pago_tramos
  for select using (
    exists (
      select 1 from pagos p
       where p.id = pago_tramos.pago_id
         and (p.cliente_id = auth.uid()
              or p.empresa_id = auth_empresa_id()
              or coalesce(auth_role()::text, '') in ('admin', 'superadmin'))
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Empezar a pagar: copia el plan de la oferta a los tramos
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
  e jsonb;
  v_i integer;
  v_n integer;
  v_resto bigint;
  v_tramo bigint;
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

  -- Tramos: se rehacen mientras el pago esté pendiente (el importe o el plan pueden haber cambiado)
  delete from pago_tramos where pago_id = v_pago.id;
  if v_post.plan_pagos is not null then
    v_n := jsonb_array_length(v_post.plan_pagos);
    v_resto := v_cents;
    v_i := 0;
    for e in select * from jsonb_array_elements(v_post.plan_pagos) loop
      v_i := v_i + 1;
      if v_i < v_n then
        v_tramo := round(v_cents * (e ->> 'pct')::numeric / 100.0)::bigint;
        v_resto := v_resto - v_tramo;
      else
        v_tramo := v_resto;                        -- el último absorbe el redondeo
      end if;
      insert into pago_tramos (pago_id, orden, titulo, pct, importe_cents)
      values (v_pago.id, v_i, trim(e ->> 'titulo'), (e ->> 'pct')::numeric, v_tramo);
    end loop;
    update pagos set con_tramos = true where id = v_pago.id;
  else
    update pagos set con_tramos = false where id = v_pago.id;
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
-- 4) Aviso de pago realizado (el mensaje cambia si hay tramos)
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
  if not found or v_pago.estado not in ('pendiente', 'fallido') then
    return;  -- evento repetido o pago desconocido
  end if;
  update pagos set estado = 'retenido', pagado_at = now(), updated_at = now() where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  if v_pago.con_tramos then
    perform crear_notificacion(v_pago.empresa_id, 'pago_retenido',
      'Pago asegurado',
      'El cliente ha pagado la obra "' || coalesce(v_titulo, '') || '". El dinero queda retenido y se te irá liberando por tramos, según vayas terminando cada parte.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
    perform avisar_usuario(v_pago.cliente_id, 'pago_retenido',
      'Pago realizado',
      'Tu pago de la obra "' || coalesce(v_titulo, '') || '" está retenido de forma segura. Se entregará al oficio por tramos, cada uno cuando confirmes esa parte del trabajo.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  else
    perform crear_notificacion(v_pago.empresa_id, 'pago_retenido',
      'Pago asegurado',
      'El cliente ha pagado la obra "' || coalesce(v_titulo, '') || '". El dinero queda retenido y se te liberará al terminar y verificar el trabajo.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
    perform avisar_usuario(v_pago.cliente_id, 'pago_retenido',
      'Pago realizado',
      'Tu pago de la obra "' || coalesce(v_titulo, '') || '" está retenido de forma segura. Solo se entrega al oficio cuando confirmes que el trabajo está bien.',
      jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Obras con tramos: el flujo de "obra terminada" va por tramo, no por pago entero
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
  if v_pago.con_tramos then
    raise exception 'Esta obra se cobra por tramos: marca como terminado el tramo que corresponda.';
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
  if v_pago.con_tramos then
    raise exception 'Esta obra se cobra por tramos: confirma el tramo que corresponda.';
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
-- 6) Tramos: el oficio marca terminado, el cliente confirma
-- ---------------------------------------------------------------------------
create or replace function tramo_oficio_termina(p_tramo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t pago_tramos%rowtype;
  v_pago pagos%rowtype;
  v_dias integer;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  select * into v_t from pago_tramos where id = p_tramo_id for update;
  if not found then
    raise exception 'El tramo no existe.';
  end if;
  select * into v_pago from pagos where id = v_t.pago_id for update;
  if v_pago.empresa_id is distinct from auth_empresa_id() then
    raise exception 'No autorizado';
  end if;
  if v_pago.estado <> 'retenido' then
    raise exception 'El pago no está en un estado que permita marcar este tramo como terminado.';
  end if;
  if v_t.estado <> 'pendiente' then
    raise exception 'Este tramo ya está marcado como terminado.';
  end if;
  if exists (
    select 1 from pago_tramos
     where pago_id = v_t.pago_id and orden < v_t.orden
       and estado not in ('confirmado_cliente', 'liberando', 'liberado')
  ) then
    raise exception 'Primero tiene que estar confirmado el tramo anterior.';
  end if;

  select dias_confirmacion into v_dias from ajustes_pagos where id;
  update pago_tramos
     set estado = 'terminado_oficio',
         terminado_at = now(),
         auto_confirma_at = now() + make_interval(days => v_dias),
         updated_at = now()
   where id = v_t.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform avisar_usuario(v_pago.cliente_id, 'pago_obra_terminada',
    'Tramo terminado: revísalo',
    'El oficio ha marcado como terminado el tramo "' || v_t.titulo || '" de la obra "' || coalesce(v_titulo, '') || '". Confírmalo si está bien o avísanos de cualquier problema. Si no respondes en ' || v_dias || ' días, se dará por bueno.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id, 'tramo_id', v_t.id));
end;
$$;

create or replace function tramo_cliente_confirma(p_tramo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t pago_tramos%rowtype;
  v_pago pagos%rowtype;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select * into v_t from pago_tramos where id = p_tramo_id for update;
  if not found then
    raise exception 'El tramo no existe.';
  end if;
  select * into v_pago from pagos where id = v_t.pago_id for update;
  if v_pago.cliente_id is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_pago.estado <> 'retenido' then
    raise exception 'El pago está congelado o cerrado: no se puede confirmar este tramo ahora.';
  end if;
  if v_t.estado <> 'terminado_oficio' then
    raise exception 'Todavía no se puede confirmar: el oficio no ha marcado este tramo como terminado.';
  end if;
  update pago_tramos
     set estado = 'confirmado_cliente', confirmado_at = now(), updated_at = now()
   where id = v_t.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform avisar_equipo('pago_pendiente_aprobar',
    'Tramo listo para aprobar',
    'El cliente ha confirmado el tramo "' || v_t.titulo || '" de la obra "' || coalesce(v_titulo, '') || '". Falta el visto bueno de 3B.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id, 'tramo_id', v_t.id));
  perform crear_notificacion(v_pago.empresa_id, 'pago_confirmado_cliente',
    'El cliente ha confirmado un tramo',
    'El cliente ha confirmado el tramo "' || v_t.titulo || '". 3B hace la comprobación final y liberará ese pago.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id, 'tramo_id', v_t.id));
end;
$$;

-- Confirmación automática por silencio del cliente (cron cada hora): obras enteras y tramos
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

  for r in
    select t.id, t.titulo, p.obra_id, p.id as pago_id
      from pago_tramos t
      join pagos p on p.id = t.pago_id
     where t.estado = 'terminado_oficio' and t.auto_confirma_at <= now() and p.estado = 'retenido'
     for update of t skip locked
  loop
    update pago_tramos
       set estado = 'confirmado_cliente', confirmado_at = now(),
           confirmado_automaticamente = true, updated_at = now()
     where id = r.id;
    perform avisar_equipo('pago_pendiente_aprobar',
      'Tramo listo para aprobar',
      'Ha pasado el plazo sin respuesta del cliente: el tramo "' || r.titulo || '" se da por confirmado. Falta el visto bueno de 3B.',
      jsonb_build_object('obra_id', r.obra_id, 'pago_id', r.pago_id, 'tramo_id', r.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Panel de 3B: listar y liberar tramos
-- ---------------------------------------------------------------------------
create or replace function panel_tramos()
returns table (
  id uuid, pago_id uuid, obra_id uuid, obra_titulo text, empresa_nombre text, cliente_email text,
  orden integer, total_tramos integer, titulo text, pct numeric, importe_cents bigint,
  comision_pct numeric, estado text, pago_estado text, terminado_at timestamptz,
  auto_confirma_at timestamptz, confirmado_at timestamptz, confirmado_automaticamente boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select t.id, t.pago_id, p.obra_id, o.titulo, e.nombre, pr.email,
           t.orden, (select count(*)::integer from pago_tramos x where x.pago_id = t.pago_id),
           t.titulo, t.pct, t.importe_cents, p.comision_pct, t.estado, p.estado,
           t.terminado_at, t.auto_confirma_at, t.confirmado_at, t.confirmado_automaticamente
      from pago_tramos t
      join pagos p on p.id = t.pago_id
      join obras o on o.id = p.obra_id
      join empresas_subcontratistas e on e.id = p.empresa_id
      left join profiles pr on pr.id = p.cliente_id
     where p.estado not in ('pendiente', 'fallido', 'cancelado')
     order by case when t.estado = 'confirmado_cliente' then 0 else 1 end,
              p.created_at desc, t.orden;
end;
$$;

-- Prepara la liberación de un tramo (lo llama la Edge Function con el JWT del admin)
create or replace function panel_preparar_tramo(p_tramo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t pago_tramos%rowtype;
  v_pago pagos%rowtype;
  v_pct numeric;
  v_comision bigint;
  v_cuenta stripe_cuentas%rowtype;
begin
  perform panel_exigir_admin();
  select * into v_t from pago_tramos where id = p_tramo_id for update;
  if not found then
    raise exception 'El tramo no existe.';
  end if;
  select * into v_pago from pagos where id = v_t.pago_id for update;
  if v_pago.estado <> 'retenido' then
    raise exception 'El pago está congelado o cerrado: resuélvelo desde el pago entero.';
  end if;
  if v_t.estado <> 'confirmado_cliente' then
    raise exception 'El cliente todavía no ha confirmado este tramo.';
  end if;

  v_pct := coalesce(v_pago.comision_pct, comision_aplicable(v_pago.obra_id, v_pago.empresa_id));
  v_comision := calcular_comision_cents(v_t.importe_cents, v_pct);

  select * into v_cuenta from stripe_cuentas where empresa_id = v_pago.empresa_id;
  if not found or not v_cuenta.transferencias_activas then
    raise exception 'La cuenta de cobro del oficio no está activa.';
  end if;

  update pago_tramos
     set estado = 'liberando', estado_antes_preparar = estado, comision_cents = v_comision, updated_at = now()
   where id = v_t.id;

  return jsonb_build_object(
    'tramo_id', v_t.id,
    'pago_id', v_pago.id,
    'payment_intent', v_pago.stripe_payment_intent_id,
    'transfer_group', v_pago.transfer_group,
    'cuenta_oficio', v_cuenta.stripe_account_id,
    'moneda', v_pago.moneda,
    'transferir_cents', greatest(v_t.importe_cents - v_comision, 0),
    'comision_cents', v_comision
  );
end;
$$;

create or replace function panel_deshacer_tramo(p_tramo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  update pago_tramos
     set estado = coalesce(estado_antes_preparar, 'confirmado_cliente'), updated_at = now()
   where id = p_tramo_id and estado = 'liberando' and stripe_transfer_id is null;
end;
$$;

-- La Edge Function confirma que Stripe hizo la transferencia del tramo (solo service_role)
create or replace function tramo_finalizar(p_tramo_id uuid, p_transfer_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t pago_tramos%rowtype;
  v_pago pagos%rowtype;
  v_titulo text;
  v_quedan integer;
begin
  select * into v_t from pago_tramos where id = p_tramo_id for update;
  if not found or v_t.estado <> 'liberando' then
    return;
  end if;
  select * into v_pago from pagos where id = v_t.pago_id for update;

  update pago_tramos
     set estado = 'liberado', stripe_transfer_id = p_transfer_id, liberado_at = now(), updated_at = now()
   where id = v_t.id;

  select count(*) into v_quedan from pago_tramos
   where pago_id = v_t.pago_id and estado not in ('liberado', 'cerrado');

  update pagos
     set liberado_cents = liberado_cents + v_t.importe_cents,
         estado = case when v_quedan = 0 then 'liberado' else estado end,
         liberado_at = case when v_quedan = 0 then now() else liberado_at end,
         stripe_transfer_id = p_transfer_id,
         comision_cents = (select coalesce(sum(comision_cents), 0) from pago_tramos
                            where pago_id = v_t.pago_id and estado = 'liberado'),
         importe_oficio_cents = case when v_quedan = 0 then importe_cents else importe_oficio_cents end,
         updated_at = now()
   where id = v_pago.id;

  select titulo into v_titulo from obras where id = v_pago.obra_id;
  perform crear_notificacion(v_pago.empresa_id, 'pago_liberado',
    'Tramo liberado',
    'Te hemos enviado el tramo "' || v_t.titulo || '" de la obra "' || coalesce(v_titulo, '') || '". Llegará a tu cuenta según el calendario de Stripe.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id, 'tramo_id', v_t.id));
  perform avisar_usuario(v_pago.cliente_id, 'pago_liberado',
    'Tramo entregado al oficio',
    'El tramo "' || v_t.titulo || '" de la obra "' || coalesce(v_titulo, '') || '" se ha entregado al oficio.',
    jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id, 'tramo_id', v_t.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Resolver un pago con tramos (liberar, devolver o dividir lo que queda)
-- ---------------------------------------------------------------------------
-- Igual que antes, pero los importes se calculan sobre el saldo pendiente
-- (importe - lo ya liberado) y no se puede resolver si hay un tramo a medio liberar.
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
  v_base bigint;
  v_oficio bigint;
  v_reembolso bigint;
  v_pct numeric;
  v_comision bigint;
  v_previa bigint;
  v_cuenta stripe_cuentas%rowtype;
begin
  perform panel_exigir_admin();
  select * into v_pago from pagos where id = p_pago_id for update;
  if not found then
    raise exception 'El pago no existe.';
  end if;
  if exists (select 1 from pago_tramos where pago_id = v_pago.id and estado = 'liberando') then
    raise exception 'Hay un tramo liberándose en este momento. Espera a que termine.';
  end if;

  v_base := v_pago.importe_cents - v_pago.liberado_cents;
  if v_base <= 0 then
    raise exception 'No queda saldo pendiente en este pago.';
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
    v_oficio := v_base; v_reembolso := 0;
  elsif p_accion = 'reembolsar' then
    v_oficio := 0; v_reembolso := v_base;
  else
    if p_importe_oficio_cents is null or p_importe_oficio_cents <= 0 or p_importe_oficio_cents >= v_base then
      raise exception 'El importe para el oficio debe ser mayor que 0 y menor que el saldo pendiente.';
    end if;
    v_oficio := p_importe_oficio_cents;
    v_reembolso := v_base - v_oficio;
  end if;

  v_pct := coalesce(v_pago.comision_pct, comision_aplicable(v_pago.obra_id, v_pago.empresa_id));
  v_comision := calcular_comision_cents(v_oficio, v_pct);
  select coalesce(sum(comision_cents), 0) into v_previa
    from pago_tramos where pago_id = v_pago.id and estado = 'liberado';

  select * into v_cuenta from stripe_cuentas where empresa_id = v_pago.empresa_id;
  if v_oficio > 0 and (not found or not v_cuenta.transferencias_activas) then
    raise exception 'La cuenta de cobro del oficio no está activa.';
  end if;

  update pagos
     set estado = case when v_oficio > 0 then 'liberando' else 'reembolsando' end,
         estado_antes_preparar = estado,
         comision_pct = v_pct,
         comision_cents = v_previa + v_comision,
         importe_oficio_cents = v_oficio + v_pago.liberado_cents,
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

-- Al cerrar el pago entero, los tramos que quedaban sin liberar se cierran
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
  update pago_tramos
     set estado = 'cerrado', updated_at = now()
   where pago_id = v_pago.id and estado not in ('liberado', 'cerrado');

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
-- 9) Permisos
-- ---------------------------------------------------------------------------
revoke all on function plan_pagos_valido(jsonb) from public, anon;
revoke all on function pago_iniciar(uuid) from public, anon;
revoke all on function pago_oficio_termina(uuid) from public, anon;
revoke all on function pago_cliente_confirma(uuid) from public, anon;
revoke all on function tramo_oficio_termina(uuid) from public, anon;
revoke all on function tramo_cliente_confirma(uuid) from public, anon;
revoke all on function tramo_finalizar(uuid, text) from public, anon, authenticated;
revoke all on function pago_marcar_retenido(text) from public, anon, authenticated;
revoke all on function pago_finalizar(uuid, text, text) from public, anon, authenticated;
revoke all on function pagos_autoconfirmar() from public, anon, authenticated;
revoke all on function panel_tramos() from public, anon;
revoke all on function panel_preparar_tramo(uuid) from public, anon;
revoke all on function panel_deshacer_tramo(uuid) from public, anon;
revoke all on function panel_preparar_pago(uuid, text, bigint, text) from public, anon;
grant execute on function plan_pagos_valido(jsonb) to authenticated;
grant execute on function pago_iniciar(uuid) to authenticated;
grant execute on function pago_oficio_termina(uuid) to authenticated;
grant execute on function pago_cliente_confirma(uuid) to authenticated;
grant execute on function tramo_oficio_termina(uuid) to authenticated;
grant execute on function tramo_cliente_confirma(uuid) to authenticated;
grant execute on function tramo_finalizar(uuid, text) to service_role;
grant execute on function pago_marcar_retenido(text) to service_role;
grant execute on function pago_finalizar(uuid, text, text) to service_role;
grant execute on function pagos_autoconfirmar() to service_role;
grant execute on function panel_tramos() to authenticated;
grant execute on function panel_preparar_tramo(uuid) to authenticated;
grant execute on function panel_deshacer_tramo(uuid) to authenticated;
grant execute on function panel_preparar_pago(uuid, text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Quien publica la obra ve el plan de pagos de cada oferta antes de adjudicar
-- ---------------------------------------------------------------------------
create or replace function plan_pagos_de_ofertas(p_obra_id uuid)
returns table (postulacion_id uuid, plan_pagos jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.plan_pagos
    from postulaciones p
    join obras o on o.id = p.obra_id
   where p.obra_id = p_obra_id
     and (o.creado_por = auth.uid() or coalesce(auth_role()::text, '') in ('admin', 'superadmin'));
$$;
revoke all on function plan_pagos_de_ofertas(uuid) from public, anon;
grant execute on function plan_pagos_de_ofertas(uuid) to authenticated;