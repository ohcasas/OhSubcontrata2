-- ============================================================================
-- 0095 · Pagos manuales desde el panel (BORRADOR, no aplicar sin autorización)
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0056 (pagos), 0062 y 0070 (comision_aplicable / ajustes_pagos).
--
-- Para qué sirve
--   Obras en las que quien paga es OH Casas (u otra empresa) FUERA de la app: por transferencia o con una tarjeta de
--   empresa en su banco. El panel calcula cuánto hay que pagar a la subcontrata (oferta aceptada menos su comisión) y
--   deja constancia: quién lo registró, cuándo, el importe, la comisión que se queda 3B y la referencia de la operación.
--
-- Qué NO hace
--   · No mueve dinero, no se conecta a Stripe ni a ningún banco.
--   · NO guarda datos de tarjeta ni cuentas bancarias: si en la referencia o las notas hay algo que parezca un número
--     de tarjeta (13-19 cifras), lo rechaza.
--   · No envía correos ni avisos, no crea tareas programadas y no borra nada (un pago se ANULA, no se borra).
--   · No toca la tabla «pagos» ni su flujo de Stripe. Nada cambia mientras no se use. pagos_activos sigue como esté.
--
-- Cálculo
--   comisión de la subcontrata = comision_aplicable(obra, empresa) sobre el importe bruto de ese pago (0 si no hay).
--   neto a transferir = bruto − comisión.
--   La comisión al contratante NO se aplica: quien paga es OH Casas, que no se cobra a sí misma.
--   La suma de pagos NO anulados de una obra nunca puede superar la oferta aceptada.
--
-- Seguridad: solo administración (admin / superadmin); se escribe únicamente con las funciones de abajo.
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

create table if not exists pagos_manuales (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras (id) on delete restrict,
  postulacion_id uuid not null references postulaciones (id) on delete restrict,
  empresa_id uuid not null references empresas_subcontratistas (id) on delete restrict,
  concepto text not null check (length(btrim(concepto)) between 3 and 120),
  importe_bruto_cents bigint not null check (importe_bruto_cents > 0),
  comision_pct numeric(5,2) check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 50)),
  comision_cents bigint not null default 0 check (comision_cents >= 0),
  neto_cents bigint not null check (neto_cents >= 0),
  moneda text not null default 'eur',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'anulado')),
  fecha_prevista date,
  fecha_pago date,
  metodo text check (metodo is null or metodo in ('transferencia', 'tarjeta_empresa', 'efectivo', 'otro')),
  referencia text check (referencia is null or length(referencia) <= 80),
  notas text check (notas is null or length(notas) <= 500),
  registrado_por uuid references profiles (id),
  pagado_por uuid references profiles (id),
  pagado_at timestamptz,
  anulado_por uuid references profiles (id),
  anulado_at timestamptz,
  anulado_motivo text check (anulado_motivo is null or length(anulado_motivo) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pagos_manuales_cuadre check (neto_cents + comision_cents = importe_bruto_cents),
  constraint pagos_manuales_pagado check (estado <> 'pagado' or (fecha_pago is not null and metodo is not null and pagado_at is not null)),
  constraint pagos_manuales_anulado check (estado <> 'anulado' or (anulado_at is not null and anulado_motivo is not null))
);
create index if not exists idx_pagos_manuales_obra on pagos_manuales (obra_id, created_at);
create index if not exists idx_pagos_manuales_empresa on pagos_manuales (empresa_id);
create index if not exists idx_pagos_manuales_estado on pagos_manuales (estado);

-- Un pago ya pagado no cambia de importe ni de obra: solo se puede anular
create or replace function trg_pagos_manuales_proteger()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and old.estado <> 'pendiente' then
    if new.importe_bruto_cents is distinct from old.importe_bruto_cents
       or new.comision_cents is distinct from old.comision_cents
       or new.neto_cents is distinct from old.neto_cents
       or new.obra_id is distinct from old.obra_id
       or new.empresa_id is distinct from old.empresa_id then
      raise exception 'Un pago ya registrado no se puede modificar: anúlalo y crea otro.';
    end if;
    if old.estado = 'anulado' and new.estado <> 'anulado' then
      raise exception 'Un pago anulado no se puede reactivar: crea otro.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pagos_manuales_proteger on pagos_manuales;
create trigger trg_pagos_manuales_proteger before update on pagos_manuales
  for each row execute function trg_pagos_manuales_proteger();

-- Historial de cambios (reutiliza el de la 0070: quién cambió qué y cuándo)
drop trigger if exists trg_hist_pagos_manuales on pagos_manuales;
create trigger trg_hist_pagos_manuales after insert or update or delete on pagos_manuales
  for each row execute function trg_config_precios_historial();

-- Permisos: solo administración lee; nadie escribe directamente (solo las funciones de abajo)
alter table pagos_manuales enable row level security;
drop policy if exists pagos_manuales_admin on pagos_manuales;
create policy pagos_manuales_admin on pagos_manuales for select to authenticated
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));
revoke all on table pagos_manuales from anon, authenticated;
grant select on table pagos_manuales to authenticated;

-- ---------------------------------------------------------------------------
-- Comprobación de texto: sin números de tarjeta
-- ---------------------------------------------------------------------------
create or replace function pm_texto_limpio(p_texto text, p_campo text)
returns text
language plpgsql
immutable
as $$
begin
  if p_texto is null then return null; end if;
  if regexp_replace(p_texto, '[\s\-\.]', '', 'g') ~ '\d{13,19}' then
    raise exception 'El campo «%» parece contener un número de tarjeta o de cuenta. No lo escribas aquí: anota solo la referencia de la operación.', p_campo;
  end if;
  return nullif(btrim(p_texto), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Obras con oferta aceptada y su situación de pagos
-- ---------------------------------------------------------------------------
create or replace function panel_pm_obras()
returns table (
  obra_id uuid, referencia text, titulo text, empresa_id uuid, empresa text, postulacion_id uuid,
  oferta_cents bigint, comision_pct numeric, pagado_bruto_cents bigint, pendiente_bruto_cents bigint,
  por_registrar_cents bigint, pago_stripe boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  return query
  select o.id, o.referencia, o.titulo, e.id, e.nombre, p.id,
         round(p.oferta_economica * 100)::bigint,
         comision_aplicable(o.id, e.id),
         coalesce((select sum(m.importe_bruto_cents) from pagos_manuales m where m.obra_id = o.id and m.estado = 'pagado'), 0)::bigint,
         coalesce((select sum(m.importe_bruto_cents) from pagos_manuales m where m.obra_id = o.id and m.estado = 'pendiente'), 0)::bigint,
         (round(p.oferta_economica * 100)::bigint
            - coalesce((select sum(m.importe_bruto_cents) from pagos_manuales m where m.obra_id = o.id and m.estado in ('pagado', 'pendiente')), 0))::bigint,
         exists (select 1 from pagos x where x.obra_id = o.id and x.estado not in ('fallido', 'cancelado', 'reembolsado'))
    from obras o
    join postulaciones p on p.obra_id = o.id and p.estado = 'aceptada'
    join empresas_subcontratistas e on e.id = p.empresa_id
   where o.estado in ('adjudicada', 'en_curso', 'cerrada')
   order by o.created_at desc;
end;
$$;
revoke all on function panel_pm_obras() from public, anon;
grant execute on function panel_pm_obras() to authenticated;

-- ---------------------------------------------------------------------------
-- Crear un pago (queda «pendiente»: aún no se ha pagado nada)
-- ---------------------------------------------------------------------------
create or replace function panel_pm_crear(
  p_obra_id uuid,
  p_concepto text,
  p_importe_bruto_cents bigint,
  p_fecha_prevista date default null,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post postulaciones%rowtype;
  v_oferta bigint; v_ya bigint;
  v_pct numeric; v_com bigint; v_id uuid;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_importe_bruto_cents is null or p_importe_bruto_cents <= 0 then
    raise exception 'El importe debe ser mayor que cero.';
  end if;

  select * into v_post from postulaciones where obra_id = p_obra_id and estado = 'aceptada'
   order by updated_at desc limit 1;
  if not found then raise exception 'Esta obra no tiene una oferta aceptada.'; end if;

  if exists (select 1 from pagos where obra_id = p_obra_id and estado not in ('fallido', 'cancelado', 'reembolsado')) then
    raise exception 'Esta obra ya tiene un pago por Stripe en marcha: no se mezclan los dos sistemas.';
  end if;

  -- Se bloquea la fila de la obra para que dos personas no registren a la vez y se pase de la oferta
  perform 1 from obras where id = p_obra_id for update;
  v_oferta := round(v_post.oferta_economica * 100)::bigint;
  select coalesce(sum(importe_bruto_cents), 0) into v_ya
    from pagos_manuales where obra_id = p_obra_id and estado in ('pendiente', 'pagado');
  if v_ya + p_importe_bruto_cents > v_oferta then
    raise exception 'Te pasas de la oferta aceptada: oferta %, ya registrado %, este pago %. Máximo disponible: %.',
      round(v_oferta / 100.0, 2), round(v_ya / 100.0, 2), round(p_importe_bruto_cents / 100.0, 2), round((v_oferta - v_ya) / 100.0, 2);
  end if;

  v_pct := comision_aplicable(p_obra_id, v_post.empresa_id);
  v_com := calcular_comision_cents(p_importe_bruto_cents, v_pct);

  insert into pagos_manuales (obra_id, postulacion_id, empresa_id, concepto, importe_bruto_cents, comision_pct,
                              comision_cents, neto_cents, fecha_prevista, notas, registrado_por)
  values (p_obra_id, v_post.id, v_post.empresa_id, btrim(p_concepto), p_importe_bruto_cents, v_pct,
          v_com, p_importe_bruto_cents - v_com, p_fecha_prevista, pm_texto_limpio(p_notas, 'notas'), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function panel_pm_crear(uuid, text, bigint, date, text) from public, anon;
grant execute on function panel_pm_crear(uuid, text, bigint, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar un pago como pagado (tú ya has hecho la transferencia o el cargo en el banco)
-- ---------------------------------------------------------------------------
create or replace function panel_pm_marcar_pagado(
  p_id uuid,
  p_fecha_pago date,
  p_metodo text,
  p_referencia text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v pagos_manuales%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_fecha_pago is null or p_fecha_pago > current_date then
    raise exception 'La fecha de pago es obligatoria y no puede ser futura.';
  end if;
  if p_metodo not in ('transferencia', 'tarjeta_empresa', 'efectivo', 'otro') then
    raise exception 'Método de pago no válido.';
  end if;
  select * into v from pagos_manuales where id = p_id for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if v.estado <> 'pendiente' then raise exception 'Solo se puede marcar como pagado un pago pendiente (estado actual: %).', v.estado; end if;
  if exists (select 1 from pagos where obra_id = v.obra_id and estado not in ('fallido', 'cancelado', 'reembolsado')) then
    raise exception 'Esta obra ya tiene un pago por Stripe en marcha: no se mezclan los dos sistemas.';
  end if;

  update pagos_manuales
     set estado = 'pagado', fecha_pago = p_fecha_pago, metodo = p_metodo,
         referencia = pm_texto_limpio(p_referencia, 'referencia'),
         pagado_por = auth.uid(), pagado_at = now()
   where id = p_id;
end;
$$;
revoke all on function panel_pm_marcar_pagado(uuid, date, text, text) from public, anon;
grant execute on function panel_pm_marcar_pagado(uuid, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Anular (no se borra nada: queda en el historial con el motivo)
-- ---------------------------------------------------------------------------
create or replace function panel_pm_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v pagos_manuales%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indica el motivo de la anulación.'; end if;
  select * into v from pagos_manuales where id = p_id for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if v.estado = 'anulado' then raise exception 'El pago ya está anulado.'; end if;
  update pagos_manuales
     set estado = 'anulado', anulado_por = auth.uid(), anulado_at = now(), anulado_motivo = left(btrim(p_motivo), 300)
   where id = p_id;
end;
$$;
revoke all on function panel_pm_anular(uuid, text) from public, anon;
grant execute on function panel_pm_anular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Resumen para el panel (importes en céntimos)
-- ---------------------------------------------------------------------------
create or replace function panel_pm_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  return (
    select jsonb_build_object(
      'pagado_bruto_cents',     coalesce(sum(importe_bruto_cents) filter (where estado = 'pagado'), 0),
      'pagado_neto_cents',      coalesce(sum(neto_cents) filter (where estado = 'pagado'), 0),
      'comision_3b_cents',      coalesce(sum(comision_cents) filter (where estado = 'pagado'), 0),
      'pendiente_bruto_cents',  coalesce(sum(importe_bruto_cents) filter (where estado = 'pendiente'), 0),
      'pendiente_neto_cents',   coalesce(sum(neto_cents) filter (where estado = 'pendiente'), 0),
      'pagos_registrados',      count(*) filter (where estado = 'pagado'),
      'pagos_pendientes',       count(*) filter (where estado = 'pendiente'))
      from pagos_manuales);
end;
$$;
revoke all on function panel_pm_resumen() from public, anon;
grant execute on function panel_pm_resumen() to authenticated;

-- ---------------------------------------------------------------------------
-- Comprobación (solo lectura). Esperado: tabla vacía y 0 pagos.
--   select count(*) from pagos_manuales;
-- ROLLBACK (solo si no hay pagos reales registrados; perderías el registro):
--   drop function if exists panel_pm_obras(), panel_pm_crear(uuid, text, bigint, date, text),
--     panel_pm_marcar_pagado(uuid, date, text, text), panel_pm_anular(uuid, text), panel_pm_resumen(),
--     pm_texto_limpio(text, text), trg_pagos_manuales_proteger();
--   drop table if exists pagos_manuales;
-- ---------------------------------------------------------------------------