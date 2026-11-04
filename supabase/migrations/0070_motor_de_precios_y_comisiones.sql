-- ============================================================================
-- 0070 · Motor de precios, comisiones dinámicas y simulador de costes de Stripe
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0056 (pagos) y 0062 (ajustes_pagos).
--
-- Qué añade
--   1) Referencias de precios de construcción (con fuente, enlace, fecha y ámbito). NO trae precios inventados:
--      las tablas nacen vacías y se llenan desde el panel (o importando un CSV).
--   2) Calculadora: dado el lugar, la especialidad y las partidas con sus mediciones, busca referencias comparables,
--      normaliza unidades, calcula precio bajo / de referencia / alto y marca «revisión manual» si no hay datos.
--   3) Comisiones dinámicas: reglas por municipio / provincia / comunidad / nacional / excepción, con vigencia,
--      rangos de importe y justificación automática. Con reglas vacías todo sigue como hasta ahora.
--   4) Tarifas de Stripe configurables + simulador (comprador / profesional / compartida). Solo simula: no cobra nada.
--   5) Cálculos guardados por obra con aprobación explícita. Nada se publica solo.
-- Todo es solo para el personal de administración y queda en un historial de cambios.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Normaliza un texto para comparar (sin tildes, minúsculas, espacios simples)
create or replace function norm_txt(p text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select nullif(btrim(regexp_replace(lower(unaccent(coalesce(p, ''))), '\s+', ' ', 'g')), '');
$$;

-- Unidades equivalentes → unidad canónica. Solo se comparan precios de la MISMA unidad canónica
-- (no se convierte m² en m³ ni nada parecido).
create or replace function normalizar_unidad(p text)
returns text
language sql
immutable
as $$
  select case regexp_replace(lower(btrim(coalesce(p, ''))), '[\s\.]', '', 'g')
    when 'm2' then 'm2' when 'm²' then 'm2' when 'metrocuadrado' then 'm2' when 'metroscuadrados' then 'm2'
    when 'm3' then 'm3' when 'm³' then 'm3' when 'metrocubico' then 'm3' when 'metroscubicos' then 'm3'
    when 'm' then 'ml' when 'ml' then 'ml' when 'metrolineal' then 'ml' when 'metroslineales' then 'ml'
    when 'ud' then 'ud' when 'u' then 'ud' when 'uds' then 'ud' when 'unidad' then 'ud' when 'unidades' then 'ud'
    when 'kg' then 'kg' when 'kilo' then 'kg' when 'kilos' then 'kg'
    when 't' then 't' when 'tn' then 't' when 'tonelada' then 't' when 'toneladas' then 't'
    when 'h' then 'h' when 'hora' then 'h' when 'horas' then 'h'
    when 'pa' then 'pa' when 'partidaalzada' then 'pa' when 'global' then 'pa' when 'gl' then 'pa'
    else nullif(regexp_replace(lower(btrim(coalesce(p, ''))), '[\s\.]', '', 'g'), '')
  end;
$$;

-- ---------------------------------------------------------------------------
-- Historial de cambios de la configuración (quién cambió qué y cuándo)
-- ---------------------------------------------------------------------------
create table if not exists config_precios_historial (
  id bigserial primary key,
  tabla text not null,
  registro_id text,
  accion text not null check (accion in ('crear', 'modificar', 'borrar')),
  antes jsonb,
  despues jsonb,
  quien uuid,
  cuando timestamptz not null default now()
);
create index if not exists idx_config_precios_historial_tabla on config_precios_historial (tabla, cuando desc);
alter table config_precios_historial enable row level security;
drop policy if exists config_precios_historial_admin on config_precios_historial;
create policy config_precios_historial_admin on config_precios_historial
  for select using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

create or replace function trg_config_precios_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_id text;
begin
  if tg_op = 'DELETE' then
    v_id := (to_jsonb(old) ->> 'id');
    insert into config_precios_historial (tabla, registro_id, accion, antes, quien) values (tg_table_name, v_id, 'borrar', to_jsonb(old), auth.uid());
    return old;
  elsif tg_op = 'UPDATE' then
    v_id := (to_jsonb(new) ->> 'id');
    insert into config_precios_historial (tabla, registro_id, accion, antes, despues, quien) values (tg_table_name, v_id, 'modificar', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    v_id := (to_jsonb(new) ->> 'id');
    insert into config_precios_historial (tabla, registro_id, accion, despues, quien) values (tg_table_name, v_id, 'crear', to_jsonb(new), auth.uid());
    return new;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Fuentes y referencias de precios
-- ---------------------------------------------------------------------------
create table if not exists precios_fuentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('cype', 'bedec', 'autonomica', 'provincial', 'profesional', 'comercial', 'propia')),
  url text,
  licencia text,
  notas text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists precios_referencia (
  id uuid primary key default gen_random_uuid(),
  fuente_id uuid not null references precios_fuentes (id) on delete restrict,
  partida_codigo text,
  partida text not null check (btrim(partida) <> ''),
  especialidad text,
  unidad text not null check (btrim(unidad) <> ''),
  unidad_norm text,
  precio_unitario numeric(14,4) not null check (precio_unitario > 0),
  precio_materiales numeric(14,4) check (precio_materiales is null or precio_materiales >= 0),
  precio_mano_obra numeric(14,4) check (precio_mano_obra is null or precio_mano_obra >= 0),
  ambito_tipo text not null default 'nacional' check (ambito_tipo in ('nacional', 'comunidad', 'provincia', 'municipio')),
  ambito_valor text,
  alcance text,
  incluye_materiales boolean not null default true,
  incluye_mano_obra boolean not null default true,
  observaciones text,
  enlace text,
  fecha_consulta date not null,
  fecha_precio date not null,
  vigente boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint precios_ref_ambito_valor check (ambito_tipo = 'nacional' or btrim(coalesce(ambito_valor, '')) <> ''),
  constraint precios_ref_componentes check (coalesce(precio_materiales, 0) + coalesce(precio_mano_obra, 0) <= precio_unitario * 1.0001)
);
create index if not exists idx_precios_ref_unidad on precios_referencia (unidad_norm, vigente);
create index if not exists idx_precios_ref_fuente on precios_referencia (fuente_id);

create or replace function trg_precios_ref_antes()
returns trigger
language plpgsql
as $$
begin
  new.unidad_norm := normalizar_unidad(new.unidad);
  if new.ambito_tipo = 'nacional' then new.ambito_valor := null; end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;
drop trigger if exists trg_precios_ref_antes on precios_referencia;
create trigger trg_precios_ref_antes before insert or update on precios_referencia
  for each row execute function trg_precios_ref_antes();

drop trigger if exists trg_hist_precios_referencia on precios_referencia;
create trigger trg_hist_precios_referencia after insert or update or delete on precios_referencia
  for each row execute function trg_config_precios_historial();

-- ---------------------------------------------------------------------------
-- 2) Ajustes del motor de precios (una sola fila)
-- ---------------------------------------------------------------------------
create table if not exists ajustes_precios (
  id boolean primary key default true check (id),
  vigencia_meses integer not null default 24 check (vigencia_meses between 1 and 120),
  umbral_similitud numeric(3,2) not null default 0.45 check (umbral_similitud between 0.1 and 1),
  -- Peso de cada ámbito al ponderar (más cerca del lugar de la obra = más peso)
  peso_municipio numeric(3,2) not null default 1.00,
  peso_provincia numeric(3,2) not null default 0.85,
  peso_comunidad numeric(3,2) not null default 0.70,
  peso_nacional numeric(3,2) not null default 0.50,
  -- Factor por complejidad: 1,00 = sin ajuste. Neutro hasta que lo definas tú.
  factor_complejidad_baja numeric(5,3) not null default 1.000,
  factor_complejidad_media numeric(5,3) not null default 1.000,
  factor_complejidad_alta numeric(5,3) not null default 1.000,
  -- Costes adicionales como % del total de partidas (0 = no se añaden)
  pct_gastos_generales numeric(5,2) not null default 0 check (pct_gastos_generales >= 0 and pct_gastos_generales <= 100),
  pct_beneficio_industrial numeric(5,2) not null default 0 check (pct_beneficio_industrial >= 0 and pct_beneficio_industrial <= 100),
  updated_at timestamptz not null default now()
);
insert into ajustes_precios (id) values (true) on conflict (id) do nothing;
drop trigger if exists trg_hist_ajustes_precios on ajustes_precios;
create trigger trg_hist_ajustes_precios after update on ajustes_precios
  for each row execute function trg_config_precios_historial();

-- ---------------------------------------------------------------------------
-- 3) Reglas de comisión
-- ---------------------------------------------------------------------------
create table if not exists reglas_comision (
  id uuid primary key default gen_random_uuid(),
  ambito text not null check (ambito in ('excepcion', 'municipio', 'provincia', 'comunidad', 'nacional')),
  comunidad text,
  provincia text,
  municipio text,
  especialidad text,
  tipo_obra text,
  importe_min numeric(14,2) check (importe_min is null or importe_min >= 0),
  importe_max numeric(14,2),
  obra_id uuid references obras (id) on delete cascade,
  pct numeric(5,2) not null check (pct >= 0 and pct <= 50),
  pct_min numeric(5,2) check (pct_min is null or (pct_min >= 0 and pct_min <= 50)),
  pct_max numeric(5,2) check (pct_max is null or (pct_max >= 0 and pct_max <= 50)),
  motivo text not null check (btrim(motivo) <> ''),
  activa boolean not null default true,
  vigente_desde date,
  vigente_hasta date,
  aprobada_por uuid,
  aprobada_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reglas_comision_importes check (importe_max is null or importe_max >= coalesce(importe_min, 0)),
  constraint reglas_comision_pct_rango check ((pct_min is null or pct >= pct_min) and (pct_max is null or pct <= pct_max)),
  constraint reglas_comision_fechas check (vigente_hasta is null or vigente_desde is null or vigente_hasta >= vigente_desde),
  constraint reglas_comision_ambito_datos check (
    (ambito = 'excepcion' and obra_id is not null)
    or (ambito = 'municipio' and municipio is not null)
    or (ambito = 'provincia' and provincia is not null)
    or (ambito = 'comunidad' and comunidad is not null)
    or (ambito = 'nacional')
  )
);
create index if not exists idx_reglas_comision_activa on reglas_comision (activa, ambito);

-- Evita reglas contradictorias: dos reglas activas con el mismo alcance no pueden solaparse en fechas ni en importe.
create or replace function trg_reglas_comision_validar()
returns trigger
language plpgsql
as $$
declare v_otra uuid;
begin
  new.updated_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if new.ambito = 'excepcion' and new.aprobada_por is null then
    new.aprobada_por := auth.uid(); new.aprobada_at := now();   -- la crea el administrador: queda aprobada por quien la crea
  end if;
  if new.activa then
    select r.id into v_otra
      from reglas_comision r
     where r.activa and r.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and r.ambito = new.ambito
       and coalesce(norm_txt(r.comunidad), '') = coalesce(norm_txt(new.comunidad), '')
       and coalesce(norm_txt(r.provincia), '') = coalesce(norm_txt(new.provincia), '')
       and coalesce(norm_txt(r.municipio), '') = coalesce(norm_txt(new.municipio), '')
       and coalesce(norm_txt(r.especialidad), '') = coalesce(norm_txt(new.especialidad), '')
       and coalesce(norm_txt(r.tipo_obra), '') = coalesce(norm_txt(new.tipo_obra), '')
       and coalesce(r.obra_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(new.obra_id, '00000000-0000-0000-0000-000000000000'::uuid)
       and daterange(coalesce(r.vigente_desde, '-infinity'), coalesce(r.vigente_hasta, 'infinity'), '[]')
           && daterange(coalesce(new.vigente_desde, '-infinity'), coalesce(new.vigente_hasta, 'infinity'), '[]')
       and numrange(coalesce(r.importe_min, 0), coalesce(r.importe_max, 'Infinity'::numeric), '[]')
           && numrange(coalesce(new.importe_min, 0), coalesce(new.importe_max, 'Infinity'::numeric), '[]')
     limit 1;
    if v_otra is not null then
      raise exception 'Ya existe una regla activa con el mismo alcance que se solapa en fechas e importes. Desactívala o cambia las fechas.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reglas_comision_validar on reglas_comision;
create trigger trg_reglas_comision_validar before insert or update on reglas_comision
  for each row execute function trg_reglas_comision_validar();
drop trigger if exists trg_hist_reglas_comision on reglas_comision;
create trigger trg_hist_reglas_comision after insert or update or delete on reglas_comision
  for each row execute function trg_config_precios_historial();

-- Ajuste opcional por mercado (demanda alta / pocos profesionales). Desactivado hasta que lo definas.
create table if not exists ajustes_comision_mercado (
  id boolean primary key default true check (id),
  activo boolean not null default false,
  ventana_dias integer not null default 90 check (ventana_dias between 7 and 730),
  obras_minimas_demanda_alta integer check (obras_minimas_demanda_alta is null or obras_minimas_demanda_alta >= 1),
  puntos_demanda_alta numeric(4,2) not null default 0 check (puntos_demanda_alta >= 0 and puntos_demanda_alta <= 10),
  empresas_maximas_escasez integer check (empresas_maximas_escasez is null or empresas_maximas_escasez >= 0),
  puntos_escasez numeric(4,2) not null default 0 check (puntos_escasez >= 0 and puntos_escasez <= 10),
  updated_at timestamptz not null default now()
);
insert into ajustes_comision_mercado (id) values (true) on conflict (id) do nothing;
drop trigger if exists trg_hist_ajustes_comision_mercado on ajustes_comision_mercado;
create trigger trg_hist_ajustes_comision_mercado after update on ajustes_comision_mercado
  for each row execute function trg_config_precios_historial();

-- ---------------------------------------------------------------------------
-- 4) Tarifas de Stripe (editables). Las tarifas de abajo son las de la página oficial de Stripe España a fecha de
--    la consulta, pero quedan SIN VERIFICAR: confirma las de tu cuenta en el panel de Stripe y márcalas como verificadas.
-- ---------------------------------------------------------------------------
create table if not exists tarifas_stripe (
  id uuid primary key default gen_random_uuid(),
  concepto text not null default 'procesamiento' check (concepto in ('procesamiento', 'connect', 'otros')),
  nombre text not null,
  region_tarjeta text check (region_tarjeta is null or region_tarjeta in ('eee', 'uk', 'internacional')),
  tipo_tarjeta text check (tipo_tarjeta is null or tipo_tarjeta in ('estandar', 'premium')),
  pct numeric(6,4) not null default 0 check (pct >= 0 and pct <= 20),
  fijo_cents integer not null default 0 check (fijo_cents >= 0),
  moneda text not null default 'EUR',
  fuente_url text,
  fecha_consulta date,
  verificada boolean not null default false,
  notas text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
drop trigger if exists trg_hist_tarifas_stripe on tarifas_stripe;
create trigger trg_hist_tarifas_stripe after insert or update or delete on tarifas_stripe
  for each row execute function trg_config_precios_historial();

insert into tarifas_stripe (concepto, nombre, region_tarjeta, tipo_tarjeta, pct, fijo_cents, fuente_url, fecha_consulta, verificada, notas)
select * from (values
  ('procesamiento', 'Tarjeta estándar del EEE', 'eee', 'estandar', 1.5000, 25, 'https://stripe.com/es/pricing', date '2026-11-04', false,
   'Página oficial de Stripe España. Sin verificar con la cuenta de 3B: pueden existir tarifas personalizadas.'),
  ('procesamiento', 'Tarjeta premium del EEE', 'eee', 'premium', 2.8000, 25, 'https://stripe.com/es/pricing', date '2026-11-04', false,
   'Sin verificar. Otra fuente secundaria da 1,9 %: confirma el dato en tu panel de Stripe.'),
  ('procesamiento', 'Tarjeta del Reino Unido', 'uk', null, 2.5000, 25, 'https://stripe.com/es/pricing', date '2026-11-04', false,
   'Sin verificar. Otra fuente secundaria da 2,25 %: confirma el dato en tu panel de Stripe.'),
  ('procesamiento', 'Tarjeta internacional', 'internacional', null, 3.1500, 25, 'https://stripe.com/es/pricing', date '2026-11-04', false,
   'Sin verificar. Otra fuente secundaria da 3,25 %: confirma el dato en tu panel de Stripe.')
) v(concepto, nombre, region_tarjeta, tipo_tarjeta, pct, fijo_cents, fuente_url, fecha_consulta, verificada, notas)
where not exists (select 1 from tarifas_stripe);

-- Datos reales de Stripe por operación (para sustituir la estimación cuando exista información real).
-- Lo rellenará el webhook cuando se actualice; mientras tanto queda vacío y se usa la estimación.
alter table pagos add column if not exists stripe_fee_cents bigint check (stripe_fee_cents is null or stripe_fee_cents >= 0);

-- Fuentes (solo se registran, SIN precios: los precios los cargas tú con su enlace y fecha)
insert into precios_fuentes (nombre, tipo, url, licencia, notas)
select * from (values
  ('Generador de precios CYPE', 'cype', 'https://generadordeprecios.info/', 'Base propietaria. Consulta manual de partidas concretas; no se copia en bloque.', 'Referencia de consulta. Anota la fecha de cada consulta.'),
  ('BEDEC / ITeC', 'bedec', 'https://itec.es/', 'Base propietaria de pago. Carga solo lo que tengas licenciado.', null),
  ('Comunidad de Madrid · Base de precios de la construcción', 'autonomica', 'https://www.comunidad.madrid/node/59476', 'Base pública. Comprueba las condiciones de reutilización antes de cargar partidas.', 'Información de uso: https://comunidad.madrid/sites/default/files/doc/vivienda/bd_constr_informacion_de_uso.pdf'),
  ('Junta de Andalucía · Base de Costes de la Construcción (BCCA)', 'autonomica', 'https://www.juntadeandalucia.es/temas/sectores/construccion/guias.html', 'Base pública. Comprueba las condiciones de reutilización antes de cargar partidas.', null),
  ('Generalitat Valenciana · Base de precios', 'autonomica', null, 'Pendiente de localizar y confirmar el enlace oficial y la licencia.', null),
  ('Presupuesto o factura real', 'profesional', null, 'Dato propio de 3B: presupuestos y facturas reales de obras ejecutadas.', 'Anota en cada referencia de qué obra procede.'),
  ('Tarifa de proveedor', 'comercial', null, 'Tarifa o presupuesto de un proveedor.', null)
) v(nombre, tipo, url, licencia, notas)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- 5) Datos de la obra para calcular, y cálculos guardados
-- ---------------------------------------------------------------------------
alter table obras add column if not exists comunidad_autonoma text;
alter table obras add column if not exists provincia text;
alter table obras add column if not exists municipio text;
alter table obras add column if not exists tipo_obra text;
alter table obras add column if not exists complejidad text check (complejidad is null or complejidad in ('baja', 'media', 'alta'));

create table if not exists calculos_precio (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras (id) on delete cascade,
  version integer not null default 1,
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'sustituido', 'descartado')),
  entrada jsonb not null,
  resultado jsonb not null,
  precio_bajo numeric(14,2),
  precio_referencia numeric(14,2),
  precio_alto numeric(14,2),
  precio_recomendado numeric(14,2),
  precio_final numeric(14,2),
  motivo_modificacion text,
  confianza text,
  revision_manual boolean not null default false,
  comision_pct numeric(5,2),
  regla_comision_id uuid,
  creado_por uuid,
  aprobado_por uuid,
  aprobado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_calculos_precio_obra on calculos_precio (obra_id, created_at desc);

alter table obras add column if not exists calculo_precio_id uuid references calculos_precio (id) on delete set null;

-- RLS: todo el motor es solo del personal de administración
do $$
declare t text;
begin
  foreach t in array array['precios_fuentes', 'precios_referencia', 'ajustes_precios', 'reglas_comision', 'ajustes_comision_mercado', 'tarifas_stripe', 'calculos_precio']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format($p$create policy %I on %I for all using (coalesce(auth_role()::text, '') in ('admin', 'superadmin')) with check (coalesce(auth_role()::text, '') in ('admin', 'superadmin'))$p$, t || '_admin', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Comisión recomendada (con justificación)
-- ---------------------------------------------------------------------------
create or replace function comision_recomendada(p_ctx jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_com text := norm_txt(p_ctx ->> 'comunidad');
  v_prov text := norm_txt(p_ctx ->> 'provincia');
  v_mun text := norm_txt(p_ctx ->> 'municipio');
  v_esp text := norm_txt(p_ctx ->> 'especialidad');
  v_tipo text := norm_txt(p_ctx ->> 'tipo_obra');
  v_imp numeric := nullif(p_ctx ->> 'importe', '')::numeric;
  v_obra uuid := nullif(p_ctx ->> 'obra_id', '')::uuid;
  r reglas_comision;
  v_n_empatadas integer;
  v_pct numeric;
  v_motivos jsonb := '[]'::jsonb;
  v_provisional boolean := false;
  v_aviso text := null;
  v_m ajustes_comision_mercado;
  v_demanda integer; v_oferta integer;
  v_ajuste numeric := 0;
  v_general numeric;
begin
  -- Reglas candidatas: activas, vigentes hoy, con el importe dentro de su rango y que encajan con la obra
  select * into r
    from reglas_comision c
   where c.activa
     and (c.vigente_desde is null or c.vigente_desde <= current_date)
     and (c.vigente_hasta is null or c.vigente_hasta >= current_date)
     and (c.importe_min is null or (v_imp is not null and v_imp >= c.importe_min))
     and (c.importe_max is null or (v_imp is not null and v_imp <= c.importe_max))
     and (c.especialidad is null or norm_txt(c.especialidad) = v_esp)
     and (c.tipo_obra is null or norm_txt(c.tipo_obra) = v_tipo)
     and (
          (c.ambito = 'excepcion' and c.obra_id = v_obra and c.aprobada_por is not null)
       or (c.ambito = 'municipio' and norm_txt(c.municipio) = v_mun and (c.provincia is null or norm_txt(c.provincia) = v_prov))
       or (c.ambito = 'provincia' and norm_txt(c.provincia) = v_prov)
       or (c.ambito = 'comunidad' and norm_txt(c.comunidad) = v_com)
       or (c.ambito = 'nacional')
     )
   order by case c.ambito when 'excepcion' then 5 when 'municipio' then 4 when 'provincia' then 3 when 'comunidad' then 2 else 1 end desc,
            (case when c.especialidad is not null then 1 else 0 end + case when c.tipo_obra is not null then 1 else 0 end
             + case when c.importe_min is not null or c.importe_max is not null then 1 else 0 end) desc,
            c.created_at desc
   limit 1;

  if r.id is null then
    select comision_general_pct into v_general from ajustes_pagos where id;
    if v_general is null then
      return jsonb_build_object('pct', null, 'provisional', true, 'regla_id', null,
        'aviso', 'No hay ninguna regla de comisión aplicable ni comisión general definida. Crea una regla en Comisiones.',
        'motivos', '[]'::jsonb);
    end if;
    return jsonb_build_object('pct', v_general, 'provisional', true, 'regla_id', null,
      'aviso', 'Provisional: no hay reglas de comisión aplicables; se usa la comisión general de Pagos.',
      'motivos', jsonb_build_array('Comisión general de la plataforma (Pagos): ' || v_general || ' %.'));
  end if;

  v_pct := r.pct;
  v_motivos := v_motivos || to_jsonb('Regla aplicada: ' || case r.ambito when 'excepcion' then 'excepción aprobada para esta obra'
      when 'municipio' then 'municipio de ' || r.municipio when 'provincia' then 'provincia de ' || r.provincia
      when 'comunidad' then 'comunidad de ' || r.comunidad else 'regla general nacional' end || ' (' || r.pct || ' %).');
  v_motivos := v_motivos || to_jsonb('Motivo registrado en la regla: ' || r.motivo);
  if r.especialidad is not null then v_motivos := v_motivos || to_jsonb('La regla es específica de la especialidad «' || r.especialidad || '».'); end if;
  if r.tipo_obra is not null then v_motivos := v_motivos || to_jsonb('La regla es específica del tipo de obra «' || r.tipo_obra || '».'); end if;
  if r.importe_min is not null or r.importe_max is not null then
    v_motivos := v_motivos || to_jsonb('La regla se aplica a importes entre ' || coalesce(r.importe_min::text, '0') || ' y ' || coalesce(r.importe_max::text, 'sin límite') || ' €.');
  end if;

  -- Solo hay regla nacional pero la obra sí tiene zona: la recomendación es provisional
  if r.ambito = 'nacional' and (v_prov is not null or v_mun is not null) then
    v_provisional := true; v_aviso := 'Provisional: no hay una regla específica para esta zona; se aplica la general.';
  elsif r.ambito = 'comunidad' and (v_prov is not null or v_mun is not null) then
    v_provisional := true; v_aviso := 'Provisional: no hay regla provincial ni municipal; se aplica la de la comunidad.';
  end if;

  -- Datos reales de la zona (siempre se muestran; solo cambian el porcentaje si el ajuste de mercado está activo)
  select * into v_m from ajustes_comision_mercado where id;
  if v_prov is not null and v_esp is not null then
    select count(*) into v_demanda from obras o
     where norm_txt(o.provincia) = v_prov and norm_txt(o.especialidad_requerida) like '%' || v_esp || '%'
       and o.created_at >= now() - make_interval(days => v_m.ventana_dias);
    select count(*) into v_oferta from empresas_subcontratistas e
     where e.homologado and norm_txt(e.especialidad) like '%' || v_esp || '%';
    v_motivos := v_motivos || to_jsonb('Datos de la plataforma: ' || v_demanda || ' obras de esta especialidad publicadas en la provincia en los últimos ' || v_m.ventana_dias
      || ' días y ' || v_oferta || ' empresas homologadas de la especialidad (sin segmentar por zona).');
    if v_m.activo then
      if v_m.obras_minimas_demanda_alta is not null and v_demanda >= v_m.obras_minimas_demanda_alta and v_m.puntos_demanda_alta > 0 then
        v_ajuste := v_ajuste + v_m.puntos_demanda_alta;
        v_motivos := v_motivos || to_jsonb('Demanda elevada en la zona: +' || v_m.puntos_demanda_alta || ' puntos.');
      end if;
      if v_m.empresas_maximas_escasez is not null and v_oferta <= v_m.empresas_maximas_escasez and v_m.puntos_escasez > 0 then
        v_ajuste := v_ajuste + v_m.puntos_escasez;
        v_motivos := v_motivos || to_jsonb('Disponibilidad limitada de profesionales de la especialidad: +' || v_m.puntos_escasez || ' puntos.');
      end if;
    end if;
  elsif v_m.activo then
    v_provisional := true; v_aviso := coalesce(v_aviso, 'Provisional: faltan la provincia o la especialidad para evaluar demanda y disponibilidad.');
  end if;

  v_pct := v_pct + v_ajuste;
  if r.pct_max is not null and v_pct > r.pct_max then
    v_pct := r.pct_max; v_motivos := v_motivos || to_jsonb('Limitado al máximo de la regla (' || r.pct_max || ' %).');
  end if;
  if r.pct_min is not null and v_pct < r.pct_min then
    v_pct := r.pct_min; v_motivos := v_motivos || to_jsonb('Elevado al mínimo de la regla (' || r.pct_min || ' %).');
  end if;
  if v_pct > 50 then v_pct := 50; end if;

  select count(*) into v_n_empatadas from reglas_comision c
   where c.activa and c.id <> r.id and c.ambito = r.ambito
     and (c.vigente_desde is null or c.vigente_desde <= current_date) and (c.vigente_hasta is null or c.vigente_hasta >= current_date);
  return jsonb_build_object('pct', round(v_pct, 2), 'pct_regla', r.pct, 'provisional', v_provisional, 'regla_id', r.id, 'ambito', r.ambito,
                            'aviso', v_aviso, 'motivos', v_motivos);
end;
$$;
revoke all on function comision_recomendada(jsonb) from public, anon, authenticated;   -- solo se usa desde el panel (panel_*) y desde otras funciones del servidor

-- ---------------------------------------------------------------------------
-- 7) Coste de Stripe y simulador
-- ---------------------------------------------------------------------------
create or replace function estimar_coste_stripe(p_importe_cents bigint, p_region text default 'eee', p_tipo text default 'estandar')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare t tarifas_stripe; v_coste bigint;
begin
  select * into t from tarifas_stripe
   where activa and concepto = 'procesamiento' and region_tarjeta = coalesce(p_region, 'eee')
     and (tipo_tarjeta is null or tipo_tarjeta = coalesce(p_tipo, 'estandar'))
   order by (tipo_tarjeta is not null) desc, verificada desc, created_at desc
   limit 1;
  if t.id is null then
    return jsonb_build_object('coste_cents', null, 'aviso', 'No hay una tarifa de Stripe activa para esta combinación. Añádela en Comisiones → Tarifas de Stripe.');
  end if;
  v_coste := round(p_importe_cents * t.pct / 100.0)::bigint + t.fijo_cents;
  return jsonb_build_object('coste_cents', v_coste, 'tarifa_id', t.id, 'tarifa', t.nombre, 'pct', t.pct, 'fijo_cents', t.fijo_cents,
                            'verificada', t.verificada, 'tipo', 'estimado',
                            'aviso', case when t.verificada then null else 'Tarifa sin verificar con la cuenta de Stripe: el coste es una estimación.' end);
end;
$$;
revoke all on function estimar_coste_stripe(bigint, text, text) from public, anon, authenticated;   -- solo se usa desde el panel (panel_*) y desde otras funciones del servidor

-- Simula una operación. NO cobra ni mueve dinero.
--   p_modelo: 'comprador' (el cliente paga la comisión encima), 'profesional' (se descuenta al oficio) o 'compartida'.
--   Stripe lo asume 3B (cargos y transferencias separados), salvo que pongas otros costes.
create or replace function simular_operacion(
  p_importe_cents bigint,
  p_pct numeric,
  p_modelo text default 'profesional',
  p_region text default 'eee',
  p_tipo text default 'estandar',
  p_reparto_comprador_pct numeric default 50,
  p_otros_costes_cents bigint default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_com bigint := calcular_comision_cents(p_importe_cents, p_pct);
  v_com_comprador bigint;
  v_paga bigint; v_recibe bigint; v_stripe jsonb; v_stripe_cents bigint; v_neto bigint;
begin
  if p_importe_cents is null or p_importe_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if p_modelo not in ('comprador', 'profesional', 'compartida') then raise exception 'Modelo no válido.'; end if;
  v_com_comprador := case p_modelo when 'comprador' then v_com when 'profesional' then 0
                     else round(v_com * greatest(least(coalesce(p_reparto_comprador_pct, 50), 100), 0) / 100.0)::bigint end;
  v_paga := p_importe_cents + v_com_comprador;
  v_recibe := p_importe_cents - (v_com - v_com_comprador);
  v_stripe := estimar_coste_stripe(v_paga, p_region, p_tipo);
  v_stripe_cents := (v_stripe ->> 'coste_cents')::bigint;
  v_neto := case when v_stripe_cents is null then null else v_com - v_stripe_cents - coalesce(p_otros_costes_cents, 0) end;
  return jsonb_build_object(
    'modelo', p_modelo, 'importe_obra_cents', p_importe_cents, 'comision_pct', p_pct, 'comision_cents', v_com,
    'comision_a_cargo_comprador_cents', v_com_comprador, 'comision_a_cargo_profesional_cents', v_com - v_com_comprador,
    'cliente_paga_cents', v_paga, 'subcontrata_recibe_cents', v_recibe,
    'stripe', v_stripe, 'otros_costes_cents', coalesce(p_otros_costes_cents, 0),
    'ingreso_neto_3b_cents', v_neto, 'stripe_a_cargo', 'plataforma',
    'nota', 'Simulación. No se cobra nada. El IVA no forma parte de la base de comisión: la base es el importe que indiques.');
end;
$$;
revoke all on function simular_operacion(bigint, numeric, text, text, text, numeric, bigint) from public, anon, authenticated;   -- solo se usa desde el panel (panel_*) y desde otras funciones del servidor

-- ---------------------------------------------------------------------------
-- 8) Calculadora de precio de una obra
-- ---------------------------------------------------------------------------
create or replace function calcular_precio(p_entrada jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  a ajustes_precios;
  v_com text := norm_txt(p_entrada ->> 'comunidad');
  v_prov text := norm_txt(p_entrada ->> 'provincia');
  v_mun text := norm_txt(p_entrada ->> 'municipio');
  v_compl text := coalesce(nullif(p_entrada ->> 'complejidad', ''), 'media');
  v_factor_compl numeric;
  v_factor_aj numeric := 1;
  v_ajustes jsonb := coalesce(p_entrada -> 'ajustes', '[]'::jsonb);
  v_adic jsonb := coalesce(p_entrada -> 'costes_adicionales', '[]'::jsonb);
  v_aj jsonb;
  p jsonb;
  v_partidas jsonb := '[]'::jsonb;
  v_just jsonb := '[]'::jsonb;
  v_unidad text; v_med numeric; v_desc text; v_cod text;
  v_n integer; v_nf integer; v_ref_u numeric; v_bajo_u numeric; v_alto_u numeric;
  v_peso_total numeric; v_mat_ratio numeric; v_mo_ratio numeric; v_conf text;
  v_refs jsonb; v_excl jsonb; v_antiguas integer;
  v_tot_bajo numeric := 0; v_tot_ref numeric := 0; v_tot_alto numeric := 0; v_tot_mat numeric := 0; v_tot_mo numeric := 0; v_tot_sin_desglose numeric := 0;
  v_revision boolean := false; v_hay_datos boolean := false;
  v_conf_global text; v_min_rank integer := 3;
  v_gg numeric; v_bi numeric; v_adicionales numeric := 0; v_adic_det jsonb := '[]'::jsonb;
  v_base numeric; v_recomendado numeric;
  v_com_res jsonb; v_sim jsonb; v_cents bigint;
  v_pct numeric;
  x jsonb;
begin
  select * into a from ajustes_precios where id;
  v_factor_compl := case v_compl when 'baja' then a.factor_complejidad_baja when 'alta' then a.factor_complejidad_alta else a.factor_complejidad_media end;
  if v_factor_compl <> 1 then v_just := v_just || to_jsonb('Factor por complejidad ' || v_compl || ': ×' || v_factor_compl || ' (definido en Ajustes de precios).'); end if;

  -- Ajustes manuales: cada uno necesita un motivo escrito (ajustes «justificados»)
  for v_aj in select * from jsonb_array_elements(v_ajustes) loop
    if btrim(coalesce(v_aj ->> 'motivo', '')) = '' then raise exception 'Cada ajuste de precio necesita un motivo.'; end if;
    if abs(coalesce((v_aj ->> 'pct')::numeric, 0)) > 100 then raise exception 'Un ajuste no puede superar el 100 %%.'; end if;
    v_factor_aj := v_factor_aj * (1 + coalesce((v_aj ->> 'pct')::numeric, 0) / 100.0);
    v_just := v_just || to_jsonb('Ajuste ' || coalesce(v_aj ->> 'pct', '0') || ' %: ' || (v_aj ->> 'motivo'));
  end loop;

  if jsonb_array_length(coalesce(p_entrada -> 'partidas', '[]'::jsonb)) = 0 then
    raise exception 'Añade al menos una partida con su medición.';
  end if;

  for p in select * from jsonb_array_elements(p_entrada -> 'partidas') loop
    v_desc := btrim(coalesce(p ->> 'descripcion', ''));
    v_cod := nullif(btrim(coalesce(p ->> 'codigo', '')), '');
    v_unidad := normalizar_unidad(p ->> 'unidad');
    v_med := nullif(p ->> 'medicion', '')::numeric;
    if v_desc = '' or v_unidad is null or v_med is null or v_med <= 0 then
      raise exception 'Cada partida necesita descripción, unidad y una medición mayor que cero.';
    end if;

    -- Referencias comparables (misma unidad canónica, nombre parecido o mismo código, ámbito que cubre la obra, no antiguas)
    with cand as (
      select r.id, f.nombre as fuente, f.tipo as fuente_tipo, r.enlace, r.fecha_consulta, r.fecha_precio, r.partida, r.unidad, r.precio_unitario,
             r.precio_materiales, r.precio_mano_obra, r.ambito_tipo, r.ambito_valor, r.alcance, r.incluye_materiales, r.incluye_mano_obra,
             case when v_cod is not null and norm_txt(r.partida_codigo) = norm_txt(v_cod) then 1.0
                  else similarity(norm_txt(r.partida), norm_txt(v_desc)) end as sim,
             case r.ambito_tipo when 'municipio' then a.peso_municipio when 'provincia' then a.peso_provincia
                                when 'comunidad' then a.peso_comunidad else a.peso_nacional end as peso_ambito,
             (r.fecha_precio >= (current_date - make_interval(months => a.vigencia_meses))) as reciente,
             case r.ambito_tipo when 'municipio' then 4 when 'provincia' then 3 when 'comunidad' then 2 else 1 end as rank_ambito,
             ((r.ambito_tipo = 'nacional')
              or (r.ambito_tipo = 'comunidad' and norm_txt(r.ambito_valor) = v_com)
              or (r.ambito_tipo = 'provincia' and norm_txt(r.ambito_valor) = v_prov)
              or (r.ambito_tipo = 'municipio' and norm_txt(r.ambito_valor) = v_mun)) as cubre
        from precios_referencia r
        join precios_fuentes f on f.id = r.fuente_id and f.activa
       where r.vigente and r.unidad_norm = v_unidad
    ), buenas as (
      select * from cand where cubre and sim >= a.umbral_similitud
    )
    select
      (select count(*) from buenas where reciente),
      (select count(*) from buenas where not reciente),
      (select sum(precio_unitario * peso_ambito * sim) / nullif(sum(peso_ambito * sim), 0) from buenas where reciente),
      (select min(precio_unitario) from buenas where reciente),
      (select max(precio_unitario) from buenas where reciente),
      (select sum(peso_ambito * sim) from buenas where reciente),
      (select sum((precio_materiales / precio_unitario) * peso_ambito * sim) / nullif(sum(peso_ambito * sim) filter (where precio_materiales is not null), 0) from buenas where reciente and precio_materiales is not null),
      (select sum((precio_mano_obra / precio_unitario) * peso_ambito * sim) / nullif(sum(peso_ambito * sim) filter (where precio_mano_obra is not null), 0) from buenas where reciente and precio_mano_obra is not null),
      (select count(distinct fuente) from buenas where reciente),
      (select min(rank_ambito) from buenas where reciente),
      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'fuente', fuente, 'enlace', enlace, 'fecha_consulta', fecha_consulta, 'fecha_precio', fecha_precio,
                  'partida', partida, 'unidad', unidad, 'precio', precio_unitario, 'ambito', ambito_tipo || coalesce(': ' || ambito_valor, ''), 'alcance', alcance,
                  'incluye_materiales', incluye_materiales, 'incluye_mano_obra', incluye_mano_obra,
                  'similitud', round(sim::numeric, 2), 'peso', round((peso_ambito * sim)::numeric, 3)) order by peso_ambito * sim desc), '[]'::jsonb) from buenas where reciente)
    into v_n, v_antiguas, v_ref_u, v_bajo_u, v_alto_u, v_peso_total, v_mat_ratio, v_mo_ratio, v_nf, v_min_rank, v_refs;

    if v_n = 0 or v_ref_u is null then
      v_revision := true;
      v_partidas := v_partidas || jsonb_build_object(
        'descripcion', v_desc, 'unidad', p ->> 'unidad', 'medicion', v_med, 'estado', 'revision_manual', 'confianza', 'sin_datos',
        'motivo', case when v_antiguas > 0 then 'Solo hay referencias antiguas (más de ' || a.vigencia_meses || ' meses): no se usan como precio actual. Necesita revisión manual.'
                       else 'No hay referencias comparables en la base de precios para esta partida, unidad y zona. Necesita revisión manual.' end,
        'referencias', '[]'::jsonb);
      continue;
    end if;

    v_hay_datos := true;
    v_conf := case when v_n >= 3 and v_nf >= 2 then 'alta' when v_n >= 2 then 'media' else 'baja' end;
    v_min_rank := coalesce(v_min_rank, 1);
    v_partidas := v_partidas || jsonb_build_object(
      'descripcion', v_desc, 'unidad', p ->> 'unidad', 'medicion', v_med, 'estado', 'ok', 'confianza', v_conf,
      'precio_unitario_bajo', round(v_bajo_u * v_factor_compl * v_factor_aj, 4),
      'precio_unitario_referencia', round(v_ref_u * v_factor_compl * v_factor_aj, 4),
      'precio_unitario_alto', round(v_alto_u * v_factor_compl * v_factor_aj, 4),
      'importe_bajo', round(v_med * v_bajo_u * v_factor_compl * v_factor_aj, 2),
      'importe_referencia', round(v_med * v_ref_u * v_factor_compl * v_factor_aj, 2),
      'importe_alto', round(v_med * v_alto_u * v_factor_compl * v_factor_aj, 2),
      'num_referencias', v_n, 'num_fuentes', v_nf,
      'desglose_materiales_pct', case when v_mat_ratio is not null then round(v_mat_ratio * 100, 1) end,
      'desglose_mano_obra_pct', case when v_mo_ratio is not null then round(v_mo_ratio * 100, 1) end,
      'referencias', v_refs,
      'aviso', case when v_antiguas > 0 then v_antiguas || ' referencia(s) antigua(s) no se han usado.' end);
    v_tot_bajo := v_tot_bajo + v_med * v_bajo_u * v_factor_compl * v_factor_aj;
    v_tot_ref := v_tot_ref + v_med * v_ref_u * v_factor_compl * v_factor_aj;
    v_tot_alto := v_tot_alto + v_med * v_alto_u * v_factor_compl * v_factor_aj;
    if v_mat_ratio is not null and v_mo_ratio is not null then
      v_tot_mat := v_tot_mat + v_med * v_ref_u * v_factor_compl * v_factor_aj * v_mat_ratio;
      v_tot_mo := v_tot_mo + v_med * v_ref_u * v_factor_compl * v_factor_aj * v_mo_ratio;
      v_tot_sin_desglose := v_tot_sin_desglose + v_med * v_ref_u * v_factor_compl * v_factor_aj * greatest(1 - v_mat_ratio - v_mo_ratio, 0);
    else
      v_tot_sin_desglose := v_tot_sin_desglose + v_med * v_ref_u * v_factor_compl * v_factor_aj;
    end if;
    v_conf_global := case when v_conf_global is null then v_conf
                          when v_conf_global = 'baja' or v_conf = 'baja' then 'baja'
                          when v_conf_global = 'media' or v_conf = 'media' then 'media' else 'alta' end;
  end loop;

  -- Costes adicionales: los de configuración (% sobre las partidas) y los que se añadan a mano con su concepto
  v_gg := round(v_tot_ref * a.pct_gastos_generales / 100.0, 2);
  v_bi := round(v_tot_ref * a.pct_beneficio_industrial / 100.0, 2);
  if v_gg > 0 then v_adic_det := v_adic_det || jsonb_build_object('concepto', 'Gastos generales (' || a.pct_gastos_generales || ' %)', 'importe', v_gg); end if;
  if v_bi > 0 then v_adic_det := v_adic_det || jsonb_build_object('concepto', 'Beneficio industrial (' || a.pct_beneficio_industrial || ' %)', 'importe', v_bi); end if;
  v_adicionales := v_gg + v_bi;
  for x in select * from jsonb_array_elements(v_adic) loop
    if btrim(coalesce(x ->> 'concepto', '')) = '' or coalesce((x ->> 'importe')::numeric, 0) < 0 then raise exception 'Cada coste adicional necesita un concepto y un importe válido.'; end if;
    v_adicionales := v_adicionales + (x ->> 'importe')::numeric;
    v_adic_det := v_adic_det || jsonb_build_object('concepto', x ->> 'concepto', 'importe', (x ->> 'importe')::numeric);
  end loop;

  v_base := v_tot_ref + v_adicionales;
  v_recomendado := case when v_revision or not v_hay_datos then null else round(v_base, 2) end;

  v_just := v_just || to_jsonb('Las referencias se ponderan por cercanía al lugar de la obra (municipio ' || a.peso_municipio || ', provincia ' || a.peso_provincia
                               || ', comunidad ' || a.peso_comunidad || ', nacional ' || a.peso_nacional || ') y por parecido del nombre de la partida.');
  v_just := v_just || to_jsonb('Solo se usan referencias con precio de los últimos ' || a.vigencia_meses || ' meses y con la misma unidad. El precio recomendado es orientativo y no es una oferta vinculante de ninguna subcontrata.');
  if v_revision then v_just := v_just || to_jsonb('Hay partidas sin datos suficientes: el total es parcial y el precio recomendado no se calcula hasta revisarlas.'::text); end if;

  -- Comisión y costes sobre el importe recomendado (o, si hay revisión manual, sobre el parcial solo como orientación)
  v_com_res := comision_recomendada(jsonb_build_object('comunidad', p_entrada ->> 'comunidad', 'provincia', p_entrada ->> 'provincia', 'municipio', p_entrada ->> 'municipio',
                 'especialidad', p_entrada ->> 'especialidad', 'tipo_obra', p_entrada ->> 'tipo_obra', 'importe', coalesce(v_recomendado, v_base), 'obra_id', p_entrada ->> 'obra_id'));
  v_pct := nullif(v_com_res ->> 'pct', '')::numeric;
  if v_pct is not null and coalesce(v_recomendado, v_base) > 0 then
    v_cents := round(coalesce(v_recomendado, v_base) * 100)::bigint;
    v_sim := simular_operacion(v_cents, v_pct, coalesce(nullif(p_entrada ->> 'modelo_comision', ''), 'profesional'),
                               coalesce(nullif(p_entrada ->> 'region_tarjeta', ''), 'eee'), coalesce(nullif(p_entrada ->> 'tipo_tarjeta', ''), 'estandar'));
  end if;

  return jsonb_build_object(
    'fecha_calculo', now(),
    'partidas', v_partidas,
    'totales', jsonb_build_object(
      'precio_bajo', round(v_tot_bajo, 2), 'precio_referencia', round(v_tot_ref, 2), 'precio_alto', round(v_tot_alto, 2),
      'materiales', round(v_tot_mat, 2), 'mano_obra', round(v_tot_mo, 2), 'sin_desglose', round(v_tot_sin_desglose, 2),
      'costes_adicionales', round(v_adicionales, 2), 'costes_adicionales_detalle', v_adic_det,
      'precio_recomendado', v_recomendado, 'parcial', v_revision),
    'confianza', case when not v_hay_datos then 'sin_datos' else v_conf_global end,
    'revision_manual', v_revision,
    'comision', v_com_res,
    'simulacion', v_sim,
    'justificacion', v_just,
    'aviso_legal', 'Precio orientativo basado en referencias. No es una oferta vinculante de una subcontrata ni sustituye a un presupuesto.');
end;
$$;
revoke all on function calcular_precio(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Funciones para el panel (solo administración)
-- ---------------------------------------------------------------------------
create or replace function panel_calcular_precio(p_entrada jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return calcular_precio(p_entrada);
end;
$$;
revoke all on function panel_calcular_precio(jsonb) from public, anon;
grant execute on function panel_calcular_precio(jsonb) to authenticated;

create or replace function panel_simular_operacion(p_importe numeric, p_pct numeric, p_modelo text, p_region text default 'eee', p_tipo text default 'estandar',
                                                   p_reparto_comprador_pct numeric default 50, p_otros_costes numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return simular_operacion(round(p_importe * 100)::bigint, p_pct, p_modelo, p_region, p_tipo, p_reparto_comprador_pct, round(coalesce(p_otros_costes, 0) * 100)::bigint);
end;
$$;
revoke all on function panel_simular_operacion(numeric, numeric, text, text, text, numeric, numeric) from public, anon;
grant execute on function panel_simular_operacion(numeric, numeric, text, text, text, numeric, numeric) to authenticated;

-- Guarda un cálculo de una obra como BORRADOR. El servidor vuelve a calcular: no se fía de lo que mande el navegador.
create or replace function panel_guardar_calculo(p_obra_id uuid, p_entrada jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_res jsonb; v_id uuid; v_ver integer;
begin
  perform panel_exigir_admin();
  if not exists (select 1 from obras where id = p_obra_id) then raise exception 'La obra no existe.'; end if;
  v_res := calcular_precio(p_entrada || jsonb_build_object('obra_id', p_obra_id));
  update calculos_precio set estado = 'sustituido' where obra_id = p_obra_id and estado = 'borrador';
  select coalesce(max(version), 0) + 1 into v_ver from calculos_precio where obra_id = p_obra_id;
  insert into calculos_precio (obra_id, version, estado, entrada, resultado, precio_bajo, precio_referencia, precio_alto, precio_recomendado,
                               confianza, revision_manual, comision_pct, regla_comision_id, creado_por)
  values (p_obra_id, v_ver, 'borrador', p_entrada, v_res,
          (v_res #>> '{totales,precio_bajo}')::numeric, (v_res #>> '{totales,precio_referencia}')::numeric, (v_res #>> '{totales,precio_alto}')::numeric,
          nullif(v_res #>> '{totales,precio_recomendado}', '')::numeric, v_res ->> 'confianza', (v_res ->> 'revision_manual')::boolean,
          nullif(v_res #>> '{comision,pct}', '')::numeric, nullif(v_res #>> '{comision,regla_id}', '')::uuid, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function panel_guardar_calculo(uuid, jsonb) from public, anon;
grant execute on function panel_guardar_calculo(uuid, jsonb) to authenticated;

-- Aprueba un cálculo. Si cambias el precio respecto al recomendado, hace falta un motivo. Aprobar NO publica ni cobra nada.
create or replace function panel_aprobar_calculo(p_calculo_id uuid, p_precio_final numeric default null, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c calculos_precio; v_final numeric;
begin
  perform panel_exigir_admin();
  select * into c from calculos_precio where id = p_calculo_id for update;
  if not found then raise exception 'No existe ese cálculo.'; end if;
  if c.estado <> 'borrador' then raise exception 'Solo se puede aprobar un cálculo en borrador.'; end if;
  v_final := coalesce(p_precio_final, c.precio_recomendado);
  if v_final is null or v_final <= 0 then
    raise exception 'Este cálculo no tiene precio recomendado (hay partidas por revisar). Escribe el precio que apruebas a mano y el motivo.';
  end if;
  if (c.precio_recomendado is null or round(v_final, 2) <> round(c.precio_recomendado, 2)) and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Has cambiado el precio recomendado: escribe el motivo.';
  end if;
  update calculos_precio set estado = 'sustituido' where obra_id = c.obra_id and estado = 'aprobado' and id <> c.id;
  update calculos_precio set estado = 'aprobado', precio_final = round(v_final, 2), motivo_modificacion = nullif(btrim(coalesce(p_motivo, '')), ''),
         aprobado_por = auth.uid(), aprobado_at = now() where id = c.id;
  update obras set calculo_precio_id = c.id where id = c.obra_id;
end;
$$;
revoke all on function panel_aprobar_calculo(uuid, numeric, text) from public, anon;
grant execute on function panel_aprobar_calculo(uuid, numeric, text) to authenticated;

create or replace function panel_descartar_calculo(p_calculo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  update calculos_precio set estado = 'descartado' where id = p_calculo_id and estado = 'borrador';
end;
$$;
revoke all on function panel_descartar_calculo(uuid) from public, anon;
grant execute on function panel_descartar_calculo(uuid) to authenticated;

-- Comisión recomendada para consultarla desde el panel (con justificación)
create or replace function panel_comision_recomendada(p_ctx jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return comision_recomendada(p_ctx);
end;
$$;
revoke all on function panel_comision_recomendada(jsonb) from public, anon;
grant execute on function panel_comision_recomendada(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Comisión real de los pagos: la comisión de la regla sustituye a la «general» cuando existe
--     Prioridad: obra > empresa > reglas de comisión > general (Pagos). Sin reglas, funciona exactamente como antes.
-- ---------------------------------------------------------------------------
create or replace function comision_aplicable(p_obra_id uuid, p_empresa_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare v numeric; o record; r jsonb;
begin
  select comision_pct into v from obras where id = p_obra_id;
  if v is not null then return v; end if;
  select comision_pct into v from empresas_subcontratistas where id = p_empresa_id;
  if v is not null then return v; end if;
  select comunidad_autonoma, provincia, municipio, especialidad_requerida as especialidad, tipo_obra, presupuesto
    into o from obras where id = p_obra_id;
  if found and exists (select 1 from reglas_comision where activa) then
    r := comision_recomendada(jsonb_build_object('comunidad', o.comunidad_autonoma, 'provincia', o.provincia, 'municipio', o.municipio,
           'especialidad', o.especialidad, 'tipo_obra', o.tipo_obra, 'importe', o.presupuesto, 'obra_id', p_obra_id));
    if nullif(r ->> 'regla_id', '') is not null then return (r ->> 'pct')::numeric; end if;
  end if;
  return (select comision_general_pct from ajustes_pagos where id);
end;
$$;