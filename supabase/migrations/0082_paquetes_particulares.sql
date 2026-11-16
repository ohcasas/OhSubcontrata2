-- 0082 · Paquetes para particulares (Básico / Medio / Premium) con extra a cargo del particular (opción B).
--
-- Qué hace
--  · Tabla de paquetes editable (porcentaje del extra con mínimo y máximo en euros, servicios, plazo de revisión).
--  · La obra de un particular guarda el paquete elegido. El extra se SUMA a la oferta: el particular paga
--    oferta + extra; el oficio sigue cobrando la oferta menos la comisión base (no cambia el reparto actual).
--  · pagos.recargo_cents guarda el extra de cada pago; pago_iniciar devuelve cobrar_cents (oferta + extra).
--  · Interruptor ajustes_pagos.paquetes_activos (APAGADO por defecto): mientras esté apagado, el extra es 0
--    y todo funciona exactamente como hasta ahora.
--  · Reembolso: si se devuelve dinero al particular, también se le devuelve el extra entero (lo hace la
--    función stripe-liberar-pago y lo marca pagos.recargo_reembolsado).
--  · No envía correos, no crea tareas programadas y no borra nada.
-- Idempotente: se puede ejecutar más de una vez.

-- 1) Paquetes
create table if not exists paquetes_particular (
  codigo text primary key check (codigo ~ '^[a-z0-9_]{2,30}$'),
  nombre text not null check (length(btrim(nombre)) between 2 and 40),
  descripcion text not null default '' check (length(descripcion) <= 300),
  extra_pct numeric(5,2) not null default 0 check (extra_pct >= 0 and extra_pct <= 30),
  extra_min_cents bigint not null default 0 check (extra_min_cents >= 0),
  extra_max_cents bigint not null default 0 check (extra_max_cents >= 0 and extra_max_cents >= extra_min_cents),
  servicios jsonb not null default '[]'::jsonb check (jsonb_typeof(servicios) = 'array'),
  plazo_revision_horas integer check (plazo_revision_horas is null or plazo_revision_horas between 1 and 720),
  orden integer not null default 0,
  recomendado boolean not null default false,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table paquetes_particular enable row level security;
drop policy if exists paquetes_particular_select on paquetes_particular;
create policy paquetes_particular_select on paquetes_particular for select to authenticated using (activo);

insert into paquetes_particular (codigo, nombre, descripcion, extra_pct, extra_min_cents, extra_max_cents, servicios, plazo_revision_horas, orden, recomendado) values
 ('basico', 'Básico', 'Publicas y contratas tú, con una revisión mínima.', 0, 0, 0,
  '["Revisión mínima por chat","Publicación con fotos","Oficios verificados","Pago protegido en tramos","Plantilla de contrato"]'::jsonb, 48, 1, false),
 ('medio', 'Medio', 'Sabrás cuánto debería costar tu obra.', 3, 7000, 40000,
  '["Todo lo del Básico","Revisión técnica con ficha de la obra","Precio orientativo","Comparador de ofertas","Contrato revisado por 3B"]'::jsonb, null, 2, true),
 ('premium', 'Premium', 'Te acompañamos de principio a fin.', 6, 20000, 120000,
  '["Todo lo del Medio","Seguimiento de la obra","Informe de fin de obra","Mediación si hay incidencias","Atención prioritaria"]'::jsonb, null, 3, false)
on conflict (codigo) do nothing;

-- 2) Interruptor, obra y pago
alter table ajustes_pagos add column if not exists paquetes_activos boolean not null default false;
alter table obras add column if not exists paquete_codigo text references paquetes_particular (codigo);
alter table pagos add column if not exists recargo_cents bigint not null default 0 check (recargo_cents >= 0);
alter table pagos add column if not exists paquete_codigo text;
alter table pagos add column if not exists recargo_reembolsado boolean not null default false;

-- 3) Cálculo del extra: porcentaje de la oferta, con mínimo y máximo (0 si no hay paquete o está apagado)
create or replace function paquete_recargo_cents(p_importe_cents bigint, p_codigo text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_p paquetes_particular%rowtype; v_x bigint;
begin
  if p_codigo is null or p_importe_cents is null or p_importe_cents <= 0 then return 0; end if;
  if not coalesce((select paquetes_activos from ajustes_pagos where id), false) then return 0; end if;
  select * into v_p from paquetes_particular where codigo = p_codigo and activo;
  if not found or v_p.extra_pct <= 0 then return 0; end if;
  v_x := round(p_importe_cents * v_p.extra_pct / 100.0)::bigint;
  return least(greatest(v_x, v_p.extra_min_cents), v_p.extra_max_cents);
end;
$$;
revoke all on function paquete_recargo_cents(bigint, text) from public, anon;
grant execute on function paquete_recargo_cents(bigint, text) to authenticated;

-- 4) pago_iniciar: igual que antes, más el extra del paquete
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
  v_recargo bigint := 0;
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
  v_recargo := paquete_recargo_cents(v_cents, v_obra.paquete_codigo);

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
           recargo_cents = v_recargo,
           paquete_codigo = case when v_recargo > 0 then v_obra.paquete_codigo else null end,
           updated_at = now()
     where id = v_pago.id
     returning * into v_pago;
  else
    insert into pagos (obra_id, postulacion_id, empresa_id, cliente_id, importe_cents,
                       comision_pct, comision_cents, transfer_group, recargo_cents, paquete_codigo)
    values (p_obra_id, v_post.id, v_post.empresa_id, v_uid, v_cents,
            v_pct, calcular_comision_cents(v_cents, v_pct), 'obra_' || p_obra_id::text,
            v_recargo, case when v_recargo > 0 then v_obra.paquete_codigo else null end)
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
    'recargo_cents', v_pago.recargo_cents,
    'cobrar_cents', v_pago.importe_cents + v_pago.recargo_cents,
    'moneda', v_pago.moneda,
    'transfer_group', v_pago.transfer_group,
    'cuenta_oficio', v_cuenta.stripe_account_id
  );
end;
$$;

-- 5) App: paquetes visibles y elección del paquete (solo el particular que publicó la obra, antes de pagar)
create or replace function app_paquetes()
returns table (codigo text, nombre text, descripcion text, extra_pct numeric, extra_min_cents bigint, extra_max_cents bigint,
               servicios jsonb, plazo_revision_horas integer, recomendado boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.codigo, p.nombre, p.descripcion, p.extra_pct, p.extra_min_cents, p.extra_max_cents,
         p.servicios, p.plazo_revision_horas, p.recomendado
    from paquetes_particular p
   where p.activo
     and coalesce((select paquetes_activos from ajustes_pagos where id), false)
   order by p.orden;
$$;

create or replace function app_elegir_paquete(p_obra_id uuid, p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_obra obras%rowtype;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not coalesce((select paquetes_activos from ajustes_pagos where id), false) then
    raise exception 'Los paquetes todavía no están disponibles.';
  end if;
  select * into v_obra from obras where id = p_obra_id;
  if not found or v_obra.creado_por is distinct from v_uid then
    raise exception 'Solo quien publicó la obra puede elegir su paquete.';
  end if;
  if v_obra.origen <> 'particular' then raise exception 'Los paquetes son para obras de particulares.'; end if;
  if exists (select 1 from pagos where obra_id = p_obra_id and estado not in ('pendiente', 'fallido', 'cancelado', 'reembolsado')) then
    raise exception 'La obra ya está pagada: el paquete no se puede cambiar.';
  end if;
  if not exists (select 1 from paquetes_particular where codigo = p_codigo and activo) then
    raise exception 'Ese paquete no existe.';
  end if;
  update obras set paquete_codigo = p_codigo, updated_at = now() where id = p_obra_id;
end;
$$;
revoke all on function app_paquetes() from public, anon;
revoke all on function app_elegir_paquete(uuid, text) from public, anon;
grant execute on function app_paquetes() to authenticated;
grant execute on function app_elegir_paquete(uuid, text) to authenticated;

-- 6) Panel: ver y editar paquetes, y el interruptor
create or replace function panel_paquetes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return jsonb_build_object(
    'activos', coalesce((select paquetes_activos from ajustes_pagos where id), false),
    'paquetes', coalesce((select jsonb_agg(to_jsonb(p) order by p.orden) from paquetes_particular p), '[]'::jsonb),
    'obras_por_paquete', coalesce((select jsonb_object_agg(coalesce(paquete_codigo, 'ninguno'), n)
                                     from (select paquete_codigo, count(*) n from obras where origen = 'particular' group by 1) x), '{}'::jsonb)
  );
end;
$$;

create or replace function panel_guardar_paquete(
  p_codigo text, p_nombre text, p_descripcion text, p_extra_pct numeric,
  p_extra_min_cents bigint, p_extra_max_cents bigint, p_servicios jsonb,
  p_plazo_revision_horas integer, p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  update paquetes_particular
     set nombre = p_nombre, descripcion = coalesce(p_descripcion, ''), extra_pct = p_extra_pct,
         extra_min_cents = p_extra_min_cents, extra_max_cents = p_extra_max_cents,
         servicios = p_servicios, plazo_revision_horas = p_plazo_revision_horas,
         activo = coalesce(p_activo, true), updated_at = now()
   where codigo = p_codigo;
  if not found then raise exception 'Ese paquete no existe.'; end if;
end;
$$;

create or replace function panel_paquetes_interruptor(p_activos boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  update ajustes_pagos set paquetes_activos = coalesce(p_activos, false), updated_at = now() where id;
end;
$$;
revoke all on function panel_paquetes() from public, anon;
revoke all on function panel_guardar_paquete(text, text, text, numeric, bigint, bigint, jsonb, integer, boolean) from public, anon;
revoke all on function panel_paquetes_interruptor(boolean) from public, anon;
grant execute on function panel_paquetes() to authenticated;
grant execute on function panel_guardar_paquete(text, text, text, numeric, bigint, bigint, jsonb, integer, boolean) to authenticated;
grant execute on function panel_paquetes_interruptor(boolean) to authenticated;