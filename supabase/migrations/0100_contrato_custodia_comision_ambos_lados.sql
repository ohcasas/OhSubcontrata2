-- ===========================================================================
-- 0100 · Contrato y plazos: custodia por 3B y comision a ambos lados
-- ESTADO: BORRADOR. NO ejecutar en Supabase sin autorizacion expresa.
-- Se ejecuta DESPUES de la 0099 (ya ejecutada). Convierte las tablas al modelo nuevo:
--   * la contrata paga a 3B: precio + comision (se SUMA);
--   * 3B paga a la subcontrata: precio - comision (se RESTA);
--   * 3B solo paga a la subcontrata despues de cobrar ese plazo.
-- Si ya hay cobros, pagos o comisiones registrados con el modelo anterior, se detiene sin tocar nada.
-- Solo registro: no mueve dinero, sin Stripe, sin correos, sin borrados automaticos.
-- Importes SIN IVA. Los contratos y plazos pendientes se convierten con la misma comision a ambos lados.
-- ===========================================================================

do $$
begin
  if exists (select 1 from obra_plazos where pago_estado <> 'pendiente' or comision_estado <> 'pendiente') then
    raise exception 'Hay pagos o comisiones ya registrados con el modelo anterior. No se convierte nada: revisalo antes.';
  end if;
end $$;

-- Contrato: comision que se suma a la contrata
alter table obra_contratos add column if not exists comision_contrata_pct numeric(5,2)
  check (comision_contrata_pct is null or (comision_contrata_pct >= 0 and comision_contrata_pct <= 50));
update obra_contratos set comision_contrata_pct = comision_pct where comision_contrata_pct is null;

-- Plazos: columnas nuevas
alter table obra_plazos drop constraint if exists obra_plazos_cuadre;
alter table obra_plazos drop constraint if exists obra_plazos_pago;
alter table obra_plazos drop constraint if exists obra_plazos_factura;
alter table obra_plazos drop constraint if exists obra_plazos_cobro;

alter table obra_plazos add column if not exists comision_contrata_cents bigint;
alter table obra_plazos add column if not exists comision_sub_cents bigint;
alter table obra_plazos add column if not exists total_cents bigint;
alter table obra_plazos add column if not exists neto_sub_cents bigint;
alter table obra_plazos add column if not exists cobro_estado text not null default 'pendiente';
alter table obra_plazos add column if not exists cobro_fecha date;
alter table obra_plazos add column if not exists cobro_referencia text;

-- Los plazos existentes (todos pendientes) pasan al modelo nuevo
update obra_plazos
   set comision_contrata_cents = comision_cents,
       comision_sub_cents = comision_cents,
       total_cents = importe_cents + comision_cents,
       neto_sub_cents = importe_cents - comision_cents
 where total_cents is null;

alter table obra_plazos alter column comision_contrata_cents set not null;
alter table obra_plazos alter column comision_contrata_cents set default 0;
alter table obra_plazos alter column comision_sub_cents set not null;
alter table obra_plazos alter column comision_sub_cents set default 0;
alter table obra_plazos alter column total_cents set not null;
alter table obra_plazos alter column neto_sub_cents set not null;

alter table obra_plazos drop column if exists comision_cents;
alter table obra_plazos drop column if exists neto_cents;
alter table obra_plazos drop column if exists comision_estado;
alter table obra_plazos drop column if exists comision_cobro_fecha;

alter table obra_plazos add constraint obra_plazos_cobro_estado_ck check (cobro_estado in ('pendiente', 'cobrado'));
alter table obra_plazos add constraint obra_plazos_cobro_ref_ck check (cobro_referencia is null or length(cobro_referencia) <= 80);
alter table obra_plazos add constraint obra_plazos_comisiones_ck check (comision_contrata_cents >= 0 and comision_sub_cents >= 0);
alter table obra_plazos add constraint obra_plazos_total_ck check (total_cents > 0 and neto_sub_cents >= 0);
alter table obra_plazos add constraint obra_plazos_cuadre check (importe_cents + comision_contrata_cents = total_cents and importe_cents - comision_sub_cents = neto_sub_cents);
alter table obra_plazos add constraint obra_plazos_cobro check (cobro_estado <> 'cobrado' or cobro_fecha is not null);
alter table obra_plazos add constraint obra_plazos_pago check (pago_estado <> 'pagado' or (pago_fecha is not null and cobro_estado = 'cobrado'));
alter table obra_plazos add constraint obra_plazos_factura check ((factura_numero is null) = (factura_fecha is null));

-- Funciones: se sustituyen por las del modelo nuevo
drop function if exists panel_ct_obras();
drop function if exists panel_ct_plazo_comision(uuid, text, text, date, date);

-- ---------------------------------------------------------------------------
-- Obras adjudicadas con su contrato (si existe) y su situacion
-- ---------------------------------------------------------------------------
create or replace function panel_ct_obras()
returns table (
  obra_id uuid, referencia text, titulo text, empresa_id uuid, empresa text,
  oferta_cents bigint, comision_pct numeric, contrato_id uuid, contrato_estado text,
  importe_cents bigint, total_cents bigint, neto_sub_cents bigint, cobrado_cents bigint, pagado_sub_cents bigint, custodia_cents bigint, comision_total_cents bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  return query
  select o.id, o.referencia, o.titulo, e.id, e.nombre,
         round(p.oferta_economica * 100)::bigint,
         comision_aplicable(o.id, e.id),
         c.id, c.estado, c.importe_cents,
         coalesce((select sum(l.total_cents) from obra_plazos l where l.contrato_id = c.id), 0)::bigint,
         coalesce((select sum(l.neto_sub_cents) from obra_plazos l where l.contrato_id = c.id), 0)::bigint,
         coalesce((select sum(l.total_cents) from obra_plazos l where l.contrato_id = c.id and l.cobro_estado = 'cobrado'), 0)::bigint,
         coalesce((select sum(l.neto_sub_cents) from obra_plazos l where l.contrato_id = c.id and l.pago_estado = 'pagado'), 0)::bigint,
         coalesce((select sum(l.neto_sub_cents) from obra_plazos l where l.contrato_id = c.id and l.cobro_estado = 'cobrado' and l.pago_estado = 'pendiente'), 0)::bigint,
         coalesce((select sum(l.comision_contrata_cents + l.comision_sub_cents) from obra_plazos l where l.contrato_id = c.id), 0)::bigint
    from obras o
    join postulaciones p on p.obra_id = o.id and p.estado = 'aceptada'
    join empresas_subcontratistas e on e.id = p.empresa_id
    left join obra_contratos c on c.obra_id = o.id and c.estado <> 'anulado'
   where o.estado in ('adjudicada', 'en_curso', 'cerrada')
   order by o.created_at desc;
end; $$;
revoke all on function panel_ct_obras() from public, anon;
grant execute on function panel_ct_obras() to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar contrato + plazos. p_importe_cents es el PRECIO de la obra.
-- La comision se suma a la contrata (total = precio + comision) y se resta a la subcontrata (neto = precio - comision).
-- Los plazos se reescriben SOLO si ninguno tiene cobro, pago o factura registrados.
-- p_plazos: [{concepto, fecha_prevista, importe_cents}, ...]; la suma debe ser el importe del contrato.
-- ---------------------------------------------------------------------------
create or replace function panel_ct_guardar(
  p_obra_id uuid, p_importe_cents bigint, p_forma_pago text,
  p_fecha_inicio date, p_fecha_fin date, p_notas text, p_plazos jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_post postulaciones%rowtype; v_c obra_contratos%rowtype; v_id uuid;
  v_pct numeric; v_suma bigint := 0; v_i int := 0; r jsonb; v_imp bigint; v_com bigint;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_importe_cents is null or p_importe_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if p_plazos is null or jsonb_typeof(p_plazos) <> 'array' or jsonb_array_length(p_plazos) not between 1 and 12 then
    raise exception 'Indica entre 1 y 12 plazos.';
  end if;
  select * into v_post from postulaciones where obra_id = p_obra_id and estado = 'aceptada' order by updated_at desc limit 1;
  if not found then raise exception 'Esta obra no tiene una oferta aceptada.'; end if;

  perform 1 from obras where id = p_obra_id for update;
  select coalesce(sum((x->>'importe_cents')::bigint), 0) into v_suma from jsonb_array_elements(p_plazos) x;
  if v_suma <> p_importe_cents then
    raise exception 'Los plazos suman % € y el contrato es de % €. Deben coincidir.', round(v_suma / 100.0, 2), round(p_importe_cents / 100.0, 2);
  end if;

  v_pct := comision_aplicable(p_obra_id, v_post.empresa_id);
  select * into v_c from obra_contratos where obra_id = p_obra_id for update;
  if found then
    if v_c.estado = 'anulado' then raise exception 'El contrato está anulado.'; end if;
    if exists (select 1 from obra_plazos where contrato_id = v_c.id
               and (cobro_estado <> 'pendiente' or pago_estado <> 'pendiente' or factura_numero is not null)) then
      raise exception 'Ya hay cobros, pagos o facturas registrados en este contrato: no se pueden rehacer los plazos.';
    end if;
    update obra_contratos set importe_cents = p_importe_cents, comision_pct = v_pct, comision_contrata_pct = v_pct,
           forma_pago = ct_texto_limpio(p_forma_pago, 'forma de pago'), fecha_inicio = p_fecha_inicio,
           fecha_fin = p_fecha_fin, notas = ct_texto_limpio(p_notas, 'notas')
     where id = v_c.id;
    delete from obra_plazos where contrato_id = v_c.id;   -- solo plazos sin dinero registrado
    v_id := v_c.id;
  else
    insert into obra_contratos (obra_id, postulacion_id, empresa_id, importe_cents, comision_pct, comision_contrata_pct, forma_pago,
                                fecha_inicio, fecha_fin, notas, creado_por)
    values (p_obra_id, v_post.id, v_post.empresa_id, p_importe_cents, v_pct, v_pct,
            ct_texto_limpio(p_forma_pago, 'forma de pago'), p_fecha_inicio, p_fecha_fin,
            ct_texto_limpio(p_notas, 'notas'), auth.uid())
    returning id into v_id;
  end if;

  for r in select * from jsonb_array_elements(p_plazos) loop
    v_i := v_i + 1;
    v_imp := (r->>'importe_cents')::bigint;
    if v_imp is null or v_imp <= 0 then raise exception 'Cada plazo necesita un importe mayor que cero.'; end if;
    v_com := calcular_comision_cents(v_imp, v_pct);
    insert into obra_plazos (contrato_id, orden, concepto, fecha_prevista, importe_cents, comision_contrata_cents, comision_sub_cents, total_cents, neto_sub_cents)
    values (v_id, v_i, btrim(coalesce(r->>'concepto', '')), nullif(r->>'fecha_prevista', '')::date, v_imp, v_com, v_com, v_imp + v_com, v_imp - v_com);
  end loop;
  return v_id;
end; $$;
revoke all on function panel_ct_guardar(uuid, bigint, text, date, date, text, jsonb) from public, anon;
grant execute on function panel_ct_guardar(uuid, bigint, text, date, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Firma del contrato + checklist de documentacion
-- ---------------------------------------------------------------------------
create or replace function panel_ct_estado(
  p_contrato_id uuid, p_estado text, p_fecha_firma date,
  p_hacienda boolean, p_seg_social boolean, p_seguro_rc boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v obra_contratos%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_estado not in ('borrador', 'firmado', 'anulado') then raise exception 'Estado no válido.'; end if;
  select * into v from obra_contratos where id = p_contrato_id for update;
  if not found then raise exception 'El contrato no existe.'; end if;
  if v.estado = 'anulado' then raise exception 'El contrato está anulado.'; end if;
  if p_estado <> 'firmado' and v.estado = 'firmado' and exists (
       select 1 from obra_plazos where contrato_id = v.id and (cobro_estado <> 'pendiente' or pago_estado <> 'pendiente')) then
    raise exception 'Ya hay cobros o pagos registrados: el contrato no puede volver a borrador ni anularse.';
  end if;
  if p_estado = 'anulado' and exists (
       select 1 from obra_plazos where contrato_id = v.id and (cobro_estado <> 'pendiente' or pago_estado <> 'pendiente' or factura_numero is not null)) then
    raise exception 'No se puede anular: ya hay cobros, pagos o facturas registrados.';
  end if;
  if p_estado = 'firmado' and (p_fecha_firma is null or p_fecha_firma > current_date) then
    raise exception 'Indica la fecha de firma (no puede ser futura).';
  end if;
  update obra_contratos
     set estado = p_estado, fecha_firma = case when p_estado = 'firmado' then p_fecha_firma else null end,
         doc_hacienda = coalesce(p_hacienda, false), doc_seguridad_social = coalesce(p_seg_social, false),
         doc_seguro_rc = coalesce(p_seguro_rc, false)
   where id = p_contrato_id;
end; $$;
revoke all on function panel_ct_estado(uuid, text, date, boolean, boolean, boolean) from public, anon;
grant execute on function panel_ct_estado(uuid, text, date, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- PASO 1: la contrata ha pagado a 3B este plazo (anotas lo que ya llego a la cuenta)
-- ---------------------------------------------------------------------------
create or replace function panel_ct_plazo_cobrado(p_plazo_id uuid, p_fecha date, p_referencia text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v obra_plazos%rowtype; c obra_contratos%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_fecha is null or p_fecha > current_date then raise exception 'La fecha es obligatoria y no puede ser futura.'; end if;
  select * into v from obra_plazos where id = p_plazo_id for update;
  if not found then raise exception 'El plazo no existe.'; end if;
  select * into c from obra_contratos where id = v.contrato_id;
  if c.estado <> 'firmado' then raise exception 'El contrato debe estar firmado antes de registrar cobros.'; end if;
  if v.cobro_estado = 'cobrado' then raise exception 'Este plazo ya está marcado como cobrado.'; end if;
  update obra_plazos set cobro_estado = 'cobrado', cobro_fecha = p_fecha,
         cobro_referencia = ct_texto_limpio(p_referencia, 'referencia')
   where id = p_plazo_id;
end; $$;
revoke all on function panel_ct_plazo_cobrado(uuid, date, text) from public, anon;
grant execute on function panel_ct_plazo_cobrado(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- PASO 2: 3B ha pagado a la subcontrata (solo si ya cobro ese plazo)
-- ---------------------------------------------------------------------------
create or replace function panel_ct_plazo_pagado(p_plazo_id uuid, p_fecha date, p_referencia text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v obra_plazos%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_fecha is null or p_fecha > current_date then raise exception 'La fecha es obligatoria y no puede ser futura.'; end if;
  select * into v from obra_plazos where id = p_plazo_id for update;
  if not found then raise exception 'El plazo no existe.'; end if;
  if v.cobro_estado <> 'cobrado' then raise exception 'Primero hay que registrar el cobro de la contrata: 3B no paga a la subcontrata antes de cobrar.'; end if;
  if v.pago_estado = 'pagado' then raise exception 'Este plazo ya está marcado como pagado a la subcontrata.'; end if;
  if p_fecha < v.cobro_fecha then raise exception 'El pago a la subcontrata no puede ser anterior al cobro de la contrata.'; end if;
  update obra_plazos set pago_estado = 'pagado', pago_fecha = p_fecha,
         pago_referencia = ct_texto_limpio(p_referencia, 'referencia')
   where id = p_plazo_id;
end; $$;
revoke all on function panel_ct_plazo_pagado(uuid, date, text) from public, anon;
grant execute on function panel_ct_plazo_pagado(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Factura de 3B de este plazo (solo se anota numero y fecha; el panel no emite facturas)
-- ---------------------------------------------------------------------------
create or replace function panel_ct_plazo_factura(p_plazo_id uuid, p_numero text, p_fecha date)
returns void
language plpgsql security definer set search_path = public
as $$
declare v obra_plazos%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if length(btrim(coalesce(p_numero, ''))) < 1 or p_fecha is null or p_fecha > current_date then
    raise exception 'Indica el número y la fecha de la factura (no futura).';
  end if;
  select * into v from obra_plazos where id = p_plazo_id for update;
  if not found then raise exception 'El plazo no existe.'; end if;
  update obra_plazos set factura_numero = left(btrim(p_numero), 40), factura_fecha = p_fecha where id = p_plazo_id;
end; $$;
revoke all on function panel_ct_plazo_factura(uuid, text, date) from public, anon;
grant execute on function panel_ct_plazo_factura(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Resumen global (centimos)
-- ---------------------------------------------------------------------------
create or replace function panel_ct_resumen()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  return (select jsonb_build_object(
    'a_cobrar_cents',        coalesce(sum(l.total_cents) filter (where l.cobro_estado = 'pendiente'), 0),
    'cobrado_cents',         coalesce(sum(l.total_cents) filter (where l.cobro_estado = 'cobrado'), 0),
    'custodia_cents',        coalesce(sum(l.neto_sub_cents) filter (where l.cobro_estado = 'cobrado' and l.pago_estado = 'pendiente'), 0),
    'pagado_sub_cents',      coalesce(sum(l.neto_sub_cents) filter (where l.pago_estado = 'pagado'), 0),
    'comision_cobrada_cents', coalesce(sum(l.comision_contrata_cents + l.comision_sub_cents) filter (where l.cobro_estado = 'cobrado'), 0),
    'comision_total_cents',  coalesce(sum(l.comision_contrata_cents + l.comision_sub_cents), 0))
    from obra_plazos l join obra_contratos c on c.id = l.contrato_id where c.estado <> 'anulado');
end; $$;
revoke all on function panel_ct_resumen() from public, anon;
grant execute on function panel_ct_resumen() to authenticated;


-- Comprobacion (solo lectura). El cuadre debe ser 0 filas:
--   select * from obra_plazos where importe_cents + comision_contrata_cents <> total_cents
--                                or importe_cents - comision_sub_cents <> neto_sub_cents;
-- ROLLBACK: no hay vuelta atras automatica; si hiciera falta, pideme el script antes de tocar datos reales.