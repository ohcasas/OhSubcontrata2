-- ===========================================================================
-- 0099 · Contrato, plazos de pago y seguimiento de la comision (opcion B)
-- ESTADO: BORRADOR. NO ejecutar en Supabase sin autorizacion expresa.
--
-- Modelo (opcion B):
--   * La contrata paga al subcontratista DIRECTAMENTE, por plazos, fuera de la app.
--   * El subcontratista paga a 3B la comision (por defecto la que resulte de
--     comision_aplicable) contra una factura de 3B.
--   * 3B NO maneja los fondos. El panel solo REGISTRA lo que ocurre.
--   * Sin Stripe, sin correos, sin tareas automaticas, sin borrados.
--   * Ninguna decision de contratacion se automatiza ni se basa en puntuaciones.
-- Depende de: 0070 (comision_aplicable, calcular_comision_cents,
--   trg_config_precios_historial) y de auth_role().
-- Solo administracion (admin / superadmin) lee y escribe, y solo via funciones.
-- ===========================================================================

create table if not exists obra_contratos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null unique references obras (id) on delete restrict,
  postulacion_id uuid not null references postulaciones (id) on delete restrict,
  empresa_id uuid not null references empresas_subcontratistas (id) on delete restrict,
  importe_cents bigint not null check (importe_cents > 0),          -- sin IVA
  comision_pct numeric(5,2) check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 50)),
  forma_pago text check (forma_pago is null or length(forma_pago) <= 300),
  fecha_inicio date,
  fecha_fin date,
  estado text not null default 'borrador' check (estado in ('borrador', 'firmado', 'anulado')),
  fecha_firma date,
  doc_hacienda boolean not null default false,
  doc_seguridad_social boolean not null default false,
  doc_seguro_rc boolean not null default false,
  notas text check (notas is null or length(notas) <= 500),
  pdf_path text check (pdf_path is null or length(pdf_path) <= 200),
  pdf_nombre text check (pdf_nombre is null or length(pdf_nombre) <= 160),
  pdf_subido_at timestamptz,
  creado_por uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obra_contratos_fechas check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio),
  constraint obra_contratos_firma check (estado <> 'firmado' or fecha_firma is not null)
);

create table if not exists obra_plazos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references obra_contratos (id) on delete restrict,
  orden int not null check (orden between 1 and 12),
  concepto text not null check (length(btrim(concepto)) between 3 and 120),
  fecha_prevista date,
  importe_cents bigint not null check (importe_cents > 0),            -- lo que la contrata paga al sub (sin IVA)
  comision_cents bigint not null default 0 check (comision_cents >= 0), -- lo que el sub paga a 3B
  neto_cents bigint not null check (neto_cents >= 0),                  -- lo que se queda el sub
  pago_estado text not null default 'pendiente' check (pago_estado in ('pendiente', 'pagado')),
  pago_fecha date,
  pago_referencia text check (pago_referencia is null or length(pago_referencia) <= 80),
  comision_estado text not null default 'pendiente' check (comision_estado in ('pendiente', 'facturada', 'cobrada')),
  factura_numero text check (factura_numero is null or length(factura_numero) <= 40),
  factura_fecha date,
  comision_cobro_fecha date,
  updated_at timestamptz not null default now(),
  unique (contrato_id, orden),
  constraint obra_plazos_cuadre check (neto_cents + comision_cents = importe_cents),
  constraint obra_plazos_pago check (pago_estado <> 'pagado' or pago_fecha is not null),
  constraint obra_plazos_factura check (comision_estado = 'pendiente' or (factura_numero is not null and factura_fecha is not null)),
  constraint obra_plazos_cobro check (comision_estado <> 'cobrada' or comision_cobro_fecha is not null)
);
create index if not exists idx_obra_plazos_contrato on obra_plazos (contrato_id, orden);

-- Historial (reutiliza el de la 0070: quien cambio que y cuando)
create or replace function trg_obra_contratos_toca()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_obra_contratos_toca on obra_contratos;
create trigger trg_obra_contratos_toca before update on obra_contratos
  for each row execute function trg_obra_contratos_toca();
drop trigger if exists trg_obra_plazos_toca on obra_plazos;
create trigger trg_obra_plazos_toca before update on obra_plazos
  for each row execute function trg_obra_contratos_toca();
drop trigger if exists trg_hist_obra_contratos on obra_contratos;
create trigger trg_hist_obra_contratos after insert or update or delete on obra_contratos
  for each row execute function trg_config_precios_historial();
drop trigger if exists trg_hist_obra_plazos on obra_plazos;
create trigger trg_hist_obra_plazos after insert or update or delete on obra_plazos
  for each row execute function trg_config_precios_historial();

-- Permisos: solo administracion lee; nadie escribe directamente
alter table obra_contratos enable row level security;
alter table obra_plazos enable row level security;
drop policy if exists obra_contratos_admin on obra_contratos;
create policy obra_contratos_admin on obra_contratos for select to authenticated
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));
drop policy if exists obra_plazos_admin on obra_plazos;
create policy obra_plazos_admin on obra_plazos for select to authenticated
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));
revoke all on table obra_contratos, obra_plazos from anon, authenticated;
grant select on table obra_contratos, obra_plazos to authenticated;

-- Texto sin numeros de tarjeta ni de cuenta
create or replace function ct_texto_limpio(p_texto text, p_campo text)
returns text language plpgsql immutable as $$
begin
  if p_texto is null then return null; end if;
  if regexp_replace(p_texto, '[\s\-\.]', '', 'g') ~ '\d{13,19}' then
    raise exception 'El campo «%» parece contener un numero de tarjeta o de cuenta. No lo escribas aqui.', p_campo;
  end if;
  return nullif(btrim(p_texto), '');
end; $$;

-- ---------------------------------------------------------------------------
-- Obras adjudicadas con su contrato (si existe) y su situacion
-- ---------------------------------------------------------------------------
create or replace function panel_ct_obras()
returns table (
  obra_id uuid, referencia text, titulo text, empresa_id uuid, empresa text,
  oferta_cents bigint, comision_pct numeric, contrato_id uuid, contrato_estado text,
  importe_cents bigint, pagado_cents bigint, comision_total_cents bigint, comision_cobrada_cents bigint
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
         coalesce((select sum(l.importe_cents) from obra_plazos l where l.contrato_id = c.id and l.pago_estado = 'pagado'), 0)::bigint,
         coalesce((select sum(l.comision_cents) from obra_plazos l where l.contrato_id = c.id), 0)::bigint,
         coalesce((select sum(l.comision_cents) from obra_plazos l where l.contrato_id = c.id and l.comision_estado = 'cobrada'), 0)::bigint
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
-- Guardar contrato + plazos. Los plazos se reescriben SOLO si ninguno tiene
-- un pago o una factura registrados (nada se borra con dinero ya anotado).
-- p_plazos: [{concepto, fecha_prevista, importe_cents}, ...]; la suma debe
-- ser igual al importe del contrato.
-- ---------------------------------------------------------------------------
create or replace function panel_ct_guardar(
  p_obra_id uuid,
  p_importe_cents bigint,
  p_forma_pago text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_notas text,
  p_plazos jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_post postulaciones%rowtype; v_c obra_contratos%rowtype; v_id uuid;
  v_pct numeric; v_suma bigint := 0; v_n int; v_i int := 0; r jsonb; v_imp bigint; v_com bigint;
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
    if exists (select 1 from obra_plazos where contrato_id = v_c.id and (pago_estado <> 'pendiente' or comision_estado <> 'pendiente')) then
      raise exception 'Ya hay pagos o facturas registrados en este contrato: no se pueden rehacer los plazos.';
    end if;
    update obra_contratos set importe_cents = p_importe_cents, comision_pct = v_pct,
           forma_pago = ct_texto_limpio(p_forma_pago, 'forma de pago'), fecha_inicio = p_fecha_inicio,
           fecha_fin = p_fecha_fin, notas = ct_texto_limpio(p_notas, 'notas')
     where id = v_c.id;
    delete from obra_plazos where contrato_id = v_c.id;   -- solo plazos sin dinero registrado
    v_id := v_c.id;
  else
    insert into obra_contratos (obra_id, postulacion_id, empresa_id, importe_cents, comision_pct, forma_pago,
                                fecha_inicio, fecha_fin, notas, creado_por)
    values (p_obra_id, v_post.id, v_post.empresa_id, p_importe_cents, v_pct,
            ct_texto_limpio(p_forma_pago, 'forma de pago'), p_fecha_inicio, p_fecha_fin,
            ct_texto_limpio(p_notas, 'notas'), auth.uid())
    returning id into v_id;
  end if;

  for r in select * from jsonb_array_elements(p_plazos) loop
    v_i := v_i + 1;
    v_imp := (r->>'importe_cents')::bigint;
    if v_imp is null or v_imp <= 0 then raise exception 'Cada plazo necesita un importe mayor que cero.'; end if;
    v_com := calcular_comision_cents(v_imp, v_pct);
    insert into obra_plazos (contrato_id, orden, concepto, fecha_prevista, importe_cents, comision_cents, neto_cents)
    values (v_id, v_i, btrim(coalesce(r->>'concepto', '')), nullif(r->>'fecha_prevista', '')::date, v_imp, v_com, v_imp - v_com);
  end loop;
  return v_id;
end; $$;
revoke all on function panel_ct_guardar(uuid, bigint, text, date, date, text, jsonb) from public, anon;
grant execute on function panel_ct_guardar(uuid, bigint, text, date, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar el contrato como firmado + checklist de documentacion
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
  if p_estado = 'anulado' and exists (select 1 from obra_plazos where contrato_id = v.id and (pago_estado <> 'pendiente' or comision_estado <> 'pendiente')) then
    raise exception 'No se puede anular: ya hay pagos o facturas registrados.';
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
-- Registrar que la contrata ha pagado un plazo (pago hecho fuera de la app)
-- ---------------------------------------------------------------------------
create or replace function panel_ct_plazo_pagado(p_plazo_id uuid, p_fecha date, p_referencia text default null)
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
  if c.estado <> 'firmado' then raise exception 'El contrato debe estar firmado antes de registrar pagos.'; end if;
  if v.pago_estado = 'pagado' then raise exception 'Este plazo ya está marcado como pagado.'; end if;
  update obra_plazos set pago_estado = 'pagado', pago_fecha = p_fecha,
         pago_referencia = ct_texto_limpio(p_referencia, 'referencia')
   where id = p_plazo_id;
end; $$;
revoke all on function panel_ct_plazo_pagado(uuid, date, text) from public, anon;
grant execute on function panel_ct_plazo_pagado(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Comision de 3B: factura emitida / cobrada (solo tras el pago del plazo)
-- ---------------------------------------------------------------------------
create or replace function panel_ct_plazo_comision(
  p_plazo_id uuid, p_estado text, p_factura_numero text, p_factura_fecha date, p_cobro_fecha date
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v obra_plazos%rowtype;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_estado not in ('facturada', 'cobrada') then raise exception 'Estado de comisión no válido.'; end if;
  select * into v from obra_plazos where id = p_plazo_id for update;
  if not found then raise exception 'El plazo no existe.'; end if;
  if v.pago_estado <> 'pagado' then raise exception 'La comisión se factura cuando la contrata ha pagado el plazo.'; end if;
  if v.comision_estado = 'cobrada' then raise exception 'Esta comisión ya está cobrada.'; end if;
  if length(btrim(coalesce(p_factura_numero, ''))) < 1 or p_factura_fecha is null or p_factura_fecha > current_date then
    raise exception 'Indica el número y la fecha de la factura (no futura).';
  end if;
  if p_estado = 'cobrada' and (p_cobro_fecha is null or p_cobro_fecha > current_date or p_cobro_fecha < p_factura_fecha) then
    raise exception 'La fecha de cobro es obligatoria, no puede ser futura ni anterior a la factura.';
  end if;
  update obra_plazos
     set comision_estado = p_estado, factura_numero = left(btrim(p_factura_numero), 40),
         factura_fecha = p_factura_fecha, comision_cobro_fecha = case when p_estado = 'cobrada' then p_cobro_fecha else null end
   where id = p_plazo_id;
end; $$;
revoke all on function panel_ct_plazo_comision(uuid, text, text, date, date) from public, anon;
grant execute on function panel_ct_plazo_comision(uuid, text, text, date, date) to authenticated;

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
    'contratado_cents',       coalesce(sum(l.importe_cents), 0),
    'pagado_cents',           coalesce(sum(l.importe_cents) filter (where l.pago_estado = 'pagado'), 0),
    'comision_total_cents',   coalesce(sum(l.comision_cents), 0),
    'comision_por_facturar',  coalesce(sum(l.comision_cents) filter (where l.pago_estado = 'pagado' and l.comision_estado = 'pendiente'), 0),
    'comision_facturada',     coalesce(sum(l.comision_cents) filter (where l.comision_estado = 'facturada'), 0),
    'comision_cobrada_cents', coalesce(sum(l.comision_cents) filter (where l.comision_estado = 'cobrada'), 0))
    from obra_plazos l join obra_contratos c on c.id = l.contrato_id where c.estado <> 'anulado');
end; $$;
revoke all on function panel_ct_resumen() from public, anon;
grant execute on function panel_ct_resumen() to authenticated;

-- ---------------------------------------------------------------------------
-- PDF del contrato firmado: bucket PRIVADO, solo administracion lee y sube.
-- No hay politica de borrado: un contrato subido no se elimina (si hay una
-- version nueva se sube otra y se actualiza la ruta; la anterior se conserva).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratos-obra', 'contratos-obra', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "contratos_obra_admin_select" on storage.objects;
create policy "contratos_obra_admin_select" on storage.objects for select to authenticated
  using (bucket_id = 'contratos-obra' and public.auth_role()::text in ('admin', 'superadmin'));
drop policy if exists "contratos_obra_admin_insert" on storage.objects;
create policy "contratos_obra_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos-obra' and public.auth_role()::text in ('admin', 'superadmin'));

create or replace function panel_ct_pdf(p_contrato_id uuid, p_path text, p_nombre text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_path is null or p_path !~ ('^' || p_contrato_id::text || '/[A-Za-z0-9._-]+\.pdf$') then
    raise exception 'Ruta de archivo no válida.';
  end if;
  update obra_contratos set pdf_path = p_path, pdf_nombre = left(btrim(coalesce(p_nombre, 'contrato.pdf')), 160), pdf_subido_at = now()
   where id = p_contrato_id and estado <> 'anulado';
  if not found then raise exception 'El contrato no existe o está anulado.'; end if;
end; $$;
revoke all on function panel_ct_pdf(uuid, text, text) from public, anon;
grant execute on function panel_ct_pdf(uuid, text, text) to authenticated;

-- Comprobacion (solo lectura). Esperado: 0 filas.
--   select count(*) from obra_contratos;
-- ROLLBACK (solo si no hay datos reales; perderias el registro):
--   drop function if exists panel_ct_obras(), panel_ct_guardar(uuid,bigint,text,date,date,text,jsonb),
--     panel_ct_estado(uuid,text,date,boolean,boolean,boolean), panel_ct_plazo_pagado(uuid,date,text),
--     panel_ct_plazo_comision(uuid,text,text,date,date), panel_ct_resumen(), panel_ct_pdf(uuid,text,text), ct_texto_limpio(text,text),
--     trg_obra_contratos_toca();
--   drop table if exists obra_plazos; drop table if exists obra_contratos;