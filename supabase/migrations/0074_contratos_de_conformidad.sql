-- ============================================================================
-- 0074 · Contratos con firma del cliente: ENCARGO (al contratar) y CONFORMIDAD (al terminar)
-- ============================================================================
-- REQUISITO: haber ejecutado antes 0056, 0057 y 0060 (pagos, correos y tramos).
--
-- Qué hace
--   1) ENCARGO: cuando se crea el pago de una obra (el cliente empieza a pagar), se genera
--      automáticamente el documento "Encargo y condiciones" y se avisa al cliente. La Edge Function
--      stripe-crear-pago no entrega el cobro a Stripe hasta que el cliente lo firma.
--   2) CONFORMIDAD: cuando el oficio marca la obra (o un tramo) como terminada, se genera el documento
--      "Conformidad con la obra" y se avisa al cliente. Sin firmarlo no se puede confirmar la obra.
--      Firmar la conformidad confirma la obra (o el tramo) en el mismo paso.
--   3) Si el cliente no responde y pasa el plazo (ajustes_pagos.dias_confirmacion), sigue funcionando la
--      confirmación automática de siempre y la conformidad queda registrada como "tácita".
--   4) Cada contrato guarda una COPIA del texto tal como se mostró, su huella (sha-256), quién firmó, el nombre
--      que escribió, la fecha y hora (del servidor) y los datos de conexión. No se puede editar después.
--
-- Qué NO hace
--   - No envía correos reales: los avisos salen por la app, y por correo solo si el envío está activado en el
--     panel (ajustes_correo.activo, hoy apagado).
--   - No toca el panel de administración ni activa los pagos (pagos_activos sigue como esté).
--   - No automatiza ninguna decisión de contratación (esto es del módulo de pagos, no del de selección).
--   - Los textos de las plantillas son un BORRADOR: hay que revisarlos con asesoría jurídica antes de usarlos con
--     clientes reales. Para cambiarlos se añade una versión nueva (ver panel_contratos_plantilla_nueva).
--
-- Se puede ejecutar más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- 1) Plantillas (versionadas: la versión activa más alta es la que se usa)
-- ---------------------------------------------------------------------------
create table if not exists contratos_plantillas (
  tipo text not null check (tipo in ('encargo', 'conformidad')),
  version integer not null check (version >= 1),
  titulo text not null,
  cuerpo text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tipo, version)
);
alter table contratos_plantillas enable row level security;
drop policy if exists contratos_plantillas_admin on contratos_plantillas;
create policy contratos_plantillas_admin on contratos_plantillas
  for select using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));
revoke all on contratos_plantillas from anon, authenticated;
grant select on contratos_plantillas to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Contratos generados
-- ---------------------------------------------------------------------------
create table if not exists contratos (
  id uuid primary key default uuid_generate_v4(),
  pago_id uuid not null references pagos (id) on delete cascade,
  tramo_id uuid references pago_tramos (id) on delete set null,
  tipo text not null check (tipo in ('encargo', 'conformidad')),
  plantilla_version integer not null,
  titulo text not null,
  cuerpo text not null,                    -- copia exacta del texto mostrado
  hash text not null,                      -- sha-256 del cuerpo
  estado text not null default 'pendiente' check (estado in ('pendiente', 'firmado', 'tacito', 'anulado')),
  cliente_id uuid references profiles (id) on delete set null,
  empresa_id uuid references empresas_subcontratistas (id) on delete set null,
  variables jsonb,                         -- datos con los que se rellenó la plantilla (sin la fecha)
  firmante_nombre text,
  firmado_at timestamptz,
  firmado_ip text,
  firmado_agente text,
  nota text,
  created_at timestamptz not null default now()
);
alter table contratos add column if not exists variables jsonb;
create index if not exists idx_contratos_pago on contratos (pago_id);
create index if not exists idx_contratos_cliente on contratos (cliente_id, estado);
-- Solo un contrato "vivo" por pago, tipo y tramo
create unique index if not exists uq_contratos_vivo
  on contratos (pago_id, tipo, coalesce(tramo_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where estado <> 'anulado';

alter table contratos enable row level security;
drop policy if exists contratos_select on contratos;
create policy contratos_select on contratos
  for select using (
    cliente_id = auth.uid()
    or empresa_id = auth_empresa_id()
    or coalesce(auth_role()::text, '') in ('admin', 'superadmin')
  );
-- Nadie escribe directamente: solo las funciones de este archivo (security definer)
revoke all on contratos from anon, authenticated;
grant select on contratos to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Ayudas internas
-- ---------------------------------------------------------------------------
create or replace function contrato_euros(p_cents bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(to_char(p_cents / 100.0, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.') || ' €'
$$;

create or replace function contrato_render(p_texto text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v text;
  r text := p_texto;
begin
  for k, v in select key, value from jsonb_each_text(p_vars) loop
    r := replace(r, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return r;
end;
$$;

create or replace function contrato_hash(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p_texto, 'UTF8')), 'hex')
$$;

-- Datos con los que se rellena la plantilla (sin la fecha, para poder comparar si algo ha cambiado)
create or replace function contrato_variables(p_pago_id uuid, p_tramo_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_tramo pago_tramos%rowtype;
  v_obra obras%rowtype;
  v_emp empresas_subcontratistas%rowtype;
  v_cli profiles%rowtype;
  v_dias integer;
  v_plan text := 'Pago único.';
  r record;
begin
  select * into v_pago from pagos where id = p_pago_id;
  if not found then
    return null;
  end if;
  select * into v_obra from obras where id = v_pago.obra_id;
  select * into v_emp from empresas_subcontratistas where id = v_pago.empresa_id;
  select * into v_cli from profiles where id = v_pago.cliente_id;
  select dias_confirmacion into v_dias from ajustes_pagos where id;
  if p_tramo_id is not null then
    select * into v_tramo from pago_tramos where id = p_tramo_id;
  end if;

  if exists (select 1 from pago_tramos where pago_id = p_pago_id) then
    v_plan := '';
    for r in select orden, titulo, pct, importe_cents from pago_tramos where pago_id = p_pago_id order by orden loop
      v_plan := v_plan || r.orden || '. ' || r.titulo || ' — ' || replace(r.pct::text, '.', ',') || ' % — ' || contrato_euros(r.importe_cents) || E'\n';
    end loop;
    v_plan := rtrim(v_plan, E'\n');
  end if;

  return jsonb_build_object(
    'cliente_nombre', coalesce(nullif(trim(v_cli.nombre_completo), ''), v_cli.email, ''),
    'cliente_email', coalesce(v_cli.email, ''),
    'oficio_nombre', coalesce(v_emp.nombre, ''),
    'oficio_cif', coalesce(v_emp.cif, 'sin indicar'),
    'obra_titulo', coalesce(v_obra.titulo, ''),
    'obra_referencia', coalesce(v_obra.referencia, ''),
    'importe', contrato_euros(v_pago.importe_cents),
    'dias_confirmacion', coalesce(v_dias, 7)::text,
    'plan_tramos', v_plan,
    'alcance', case when p_tramo_id is null then 'la obra completa'
                    else 'el tramo ' || v_tramo.orden || ' («' || v_tramo.titulo || '», ' || replace(v_tramo.pct::text, '.', ',') || ' %)' end,
    'importe_alcance', case when p_tramo_id is null then contrato_euros(v_pago.importe_cents)
                            else contrato_euros(v_tramo.importe_cents) end
  );
end;
$$;

-- Genera el contrato (si hay plantilla activa y no existe ya uno vivo). Devuelve su id o null.
create or replace function contrato_generar(p_pago_id uuid, p_tipo text, p_tramo_id uuid default null, p_avisar boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl contratos_plantillas%rowtype;
  v_pago pagos%rowtype;
  v_vars jsonb;
  v_titulo_obra text;
  v_cuerpo text;
  v_id uuid;
begin
  select * into v_pl from contratos_plantillas
   where tipo = p_tipo and activa order by version desc limit 1;
  if not found then
    return null;                                   -- sin plantilla activa no se exige contrato
  end if;

  select id into v_id from contratos
   where pago_id = p_pago_id and tipo = p_tipo
     and coalesce(tramo_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_tramo_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and estado <> 'anulado';
  if found then
    return v_id;
  end if;

  select * into v_pago from pagos where id = p_pago_id;
  if not found then
    return null;
  end if;
  v_vars := contrato_variables(p_pago_id, p_tramo_id);
  v_cuerpo := contrato_render(v_pl.cuerpo, v_vars || jsonb_build_object('fecha', to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY')));

  insert into contratos (pago_id, tramo_id, tipo, plantilla_version, titulo, cuerpo, hash, variables, cliente_id, empresa_id)
  values (p_pago_id, p_tramo_id, p_tipo, v_pl.version, v_pl.titulo, v_cuerpo, contrato_hash(v_cuerpo), v_vars,
          v_pago.cliente_id, v_pago.empresa_id)
  returning id into v_id;

  if p_avisar then
    v_titulo_obra := coalesce(v_vars ->> 'obra_titulo', '');
    if p_tipo = 'encargo' then
      perform avisar_usuario(v_pago.cliente_id, 'contrato_encargo_pendiente',
        'Firma el encargo de tu obra',
        'Para poder pagar la obra "' || v_titulo_obra || '" tienes que leer y firmar el encargo y las condiciones del pago.',
        jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id, 'contrato_id', v_id));
    else
      perform avisar_usuario(v_pago.cliente_id, 'contrato_conformidad_pendiente',
        'Firma la conformidad de la obra',
        'El oficio ha terminado ' || (case when p_tramo_id is null then 'la obra' else 'un tramo de la obra' end)
          || ' "' || v_titulo_obra || '". Si está todo bien, firma la conformidad para confirmarlo.',
        jsonb_build_object('obra_id', v_pago.obra_id, 'pago_id', v_pago.id, 'tramo_id', p_tramo_id, 'contrato_id', v_id));
    end if;
  end if;
  return v_id;
end;
$$;

-- Mientras el pago está pendiente, mantiene el encargo al día: si cambian las condiciones (importe, oficio,
-- tramos, plazo o versión del texto), anula el anterior y crea uno nuevo. Si no ha cambiado nada, no hace nada.
-- Solo se vuelve a avisar al cliente si ya había firmado el anterior (tiene que firmar otra vez).
create or replace function contrato_sincronizar_encargo(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl contratos_plantillas%rowtype;
  v_c contratos%rowtype;
  v_vars jsonb;
begin
  select * into v_pl from contratos_plantillas where tipo = 'encargo' and activa order by version desc limit 1;
  if not found then
    return;
  end if;
  select * into v_c from contratos
   where pago_id = p_pago_id and tipo = 'encargo' and estado in ('pendiente', 'firmado');
  if not found then
    perform contrato_generar(p_pago_id, 'encargo');
    return;
  end if;
  v_vars := contrato_variables(p_pago_id, null);
  if v_c.variables is not distinct from v_vars and v_c.plantilla_version = v_pl.version then
    return;
  end if;
  update contratos
     set estado = 'anulado', nota = 'Anulado: cambiaron las condiciones antes de pagar.'
   where id = v_c.id;
  perform contrato_generar(p_pago_id, 'encargo', null, v_c.estado = 'firmado');
end;
$$;

revoke all on function contrato_variables(uuid, uuid) from public, anon, authenticated;
revoke all on function contrato_generar(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function contrato_sincronizar_encargo(uuid) from public, anon, authenticated;
revoke all on function contrato_euros(bigint) from public, anon;
revoke all on function contrato_render(text, jsonb) from public, anon;
revoke all on function contrato_hash(text) from public, anon;
grant execute on function contrato_euros(bigint), contrato_render(text, jsonb), contrato_hash(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Disparadores: cuándo se generan y cuándo se exigen
-- ---------------------------------------------------------------------------
-- 4a) Al crearse el pago: encargo
create or replace function trg_pagos_contrato_encargo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform contrato_generar(new.id, 'encargo');
  exception when others then
    raise warning 'No se pudo generar el encargo del pago %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_pagos_contrato_encargo on pagos;
create trigger trg_pagos_contrato_encargo
  after insert on pagos
  for each row execute function trg_pagos_contrato_encargo();

-- 4b) Si cambian las condiciones mientras el pago sigue pendiente (importe, oficio o tramos), se actualiza el encargo.
--     pago_iniciar rehace los tramos y termina con "update pagos set con_tramos", que es lo que dispara esto.
create or replace function trg_pagos_contrato_encargo_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform contrato_sincronizar_encargo(new.id);
  exception when others then
    raise warning 'No se pudo actualizar el encargo del pago %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_pagos_contrato_encargo_cambio on pagos;
create trigger trg_pagos_contrato_encargo_cambio
  after update of importe_cents, empresa_id, con_tramos on pagos
  for each row
  when (new.estado = 'pendiente')
  execute function trg_pagos_contrato_encargo_cambio();

-- 4c) Obra terminada por el oficio: conformidad
create or replace function trg_pagos_contrato_conformidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform contrato_generar(new.id, 'conformidad');
  exception when others then
    raise warning 'No se pudo generar la conformidad del pago %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_pagos_contrato_conformidad on pagos;
create trigger trg_pagos_contrato_conformidad
  after update of estado on pagos
  for each row
  when (new.estado = 'terminada_oficio' and old.estado is distinct from new.estado)
  execute function trg_pagos_contrato_conformidad();

-- 4d) Tramo terminado por el oficio: conformidad del tramo
create or replace function trg_tramos_contrato_conformidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform contrato_generar(new.pago_id, 'conformidad', new.id);
  exception when others then
    raise warning 'No se pudo generar la conformidad del tramo %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_tramos_contrato_conformidad on pago_tramos;
create trigger trg_tramos_contrato_conformidad
  after update of estado on pago_tramos
  for each row
  when (new.estado = 'terminado_oficio' and old.estado is distinct from new.estado)
  execute function trg_tramos_contrato_conformidad();

-- 4e) Sin conformidad firmada no se confirma la obra (salvo la confirmación automática por silencio, o el equipo de 3B)
create or replace function trg_exigir_conformidad_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmada_automaticamente then
    return new;
  end if;
  if coalesce(auth_role()::text, '') in ('admin', 'superadmin') then
    return new;
  end if;
  if exists (select 1 from contratos_plantillas where tipo = 'conformidad' and activa)
     and not exists (select 1 from contratos
                      where pago_id = new.id and tipo = 'conformidad' and tramo_id is null and estado = 'firmado') then
    raise exception 'Antes de confirmar la obra tienes que firmar el contrato de conformidad.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_exigir_conformidad_pago on pagos;
create trigger trg_exigir_conformidad_pago
  before update of estado on pagos
  for each row
  when (old.estado = 'terminada_oficio' and new.estado = 'confirmada_cliente')
  execute function trg_exigir_conformidad_pago();

create or replace function trg_exigir_conformidad_tramo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmado_automaticamente then
    return new;
  end if;
  if coalesce(auth_role()::text, '') in ('admin', 'superadmin') then
    return new;
  end if;
  if exists (select 1 from contratos_plantillas where tipo = 'conformidad' and activa)
     and not exists (select 1 from contratos
                      where pago_id = new.pago_id and tipo = 'conformidad' and tramo_id = new.id and estado = 'firmado') then
    raise exception 'Antes de confirmar este tramo tienes que firmar el contrato de conformidad.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_exigir_conformidad_tramo on pago_tramos;
create trigger trg_exigir_conformidad_tramo
  before update of estado on pago_tramos
  for each row
  when (old.estado = 'terminado_oficio' and new.estado = 'confirmado_cliente')
  execute function trg_exigir_conformidad_tramo();

-- 4f) Confirmación automática por silencio: la conformidad queda registrada como tácita
create or replace function trg_conformidad_tacita_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update contratos
     set estado = 'tacito', firmado_at = now(),
         nota = 'Sin firma del cliente: pasó el plazo de confirmación y la obra se dio por confirmada automáticamente.'
   where pago_id = new.id and tipo = 'conformidad' and tramo_id is null and estado = 'pendiente';
  return new;
end;
$$;
drop trigger if exists trg_conformidad_tacita_pago on pagos;
create trigger trg_conformidad_tacita_pago
  after update of confirmada_automaticamente on pagos
  for each row
  when (new.confirmada_automaticamente and not old.confirmada_automaticamente)
  execute function trg_conformidad_tacita_pago();

create or replace function trg_conformidad_tacita_tramo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update contratos
     set estado = 'tacito', firmado_at = now(),
         nota = 'Sin firma del cliente: pasó el plazo de confirmación y el tramo se dio por confirmado automáticamente.'
   where pago_id = new.pago_id and tipo = 'conformidad' and tramo_id = new.id and estado = 'pendiente';
  return new;
end;
$$;
drop trigger if exists trg_conformidad_tacita_tramo on pago_tramos;
create trigger trg_conformidad_tacita_tramo
  after update of confirmado_automaticamente on pago_tramos
  for each row
  when (new.confirmado_automaticamente and not old.confirmado_automaticamente)
  execute function trg_conformidad_tacita_tramo();

-- 4g) Pago cancelado o fallido: los contratos pendientes se anulan
create or replace function trg_pagos_anular_contratos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update contratos
     set estado = 'anulado', nota = 'Anulado: el pago se canceló o falló.'
   where pago_id = new.id and estado = 'pendiente';
  return new;
end;
$$;
drop trigger if exists trg_pagos_anular_contratos on pagos;
create trigger trg_pagos_anular_contratos
  after update of estado on pagos
  for each row
  when (new.estado in ('cancelado', 'fallido') and old.estado is distinct from new.estado)
  execute function trg_pagos_anular_contratos();

-- Un contrato firmado no se puede modificar ni borrar a mano (solo pasar a anulado desde las funciones)
create or replace function trg_contratos_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.estado in ('firmado', 'tacito') and pg_trigger_depth() = 1 then
      raise exception 'Un contrato firmado no se puede borrar.';
    end if;
    return old;
  end if;
  if old.estado in ('firmado', 'tacito') and (
       new.cuerpo is distinct from old.cuerpo or new.hash is distinct from old.hash
       or new.firmante_nombre is distinct from old.firmante_nombre or new.firmado_at is distinct from old.firmado_at
       or new.cliente_id is distinct from old.cliente_id or new.variables is distinct from old.variables) then
    raise exception 'Un contrato firmado no se puede modificar.';
  end if;
  if new.cuerpo is distinct from old.cuerpo or new.hash is distinct from old.hash then
    raise exception 'El texto de un contrato no se puede modificar: genera uno nuevo.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_contratos_inmutable on contratos;
create trigger trg_contratos_inmutable
  before update or delete on contratos
  for each row execute function trg_contratos_inmutable();

-- ---------------------------------------------------------------------------
-- 5) Lo que usa la app y la Edge Function
-- ---------------------------------------------------------------------------
-- Devuelve el contrato vivo del pago (lo genera si faltaba). null = no hay plantilla activa, no se exige.
create or replace function contrato_obtener(p_pago_id uuid, p_tipo text, p_tramo_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos%rowtype;
  v_c contratos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_tipo not in ('encargo', 'conformidad') then
    raise exception 'Tipo de contrato no válido.';
  end if;
  select * into v_pago from pagos where id = p_pago_id;
  if not found or v_pago.cliente_id is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;

  select * into v_c from contratos
   where pago_id = p_pago_id and tipo = p_tipo
     and coalesce(tramo_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_tramo_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and estado <> 'anulado';
  if not found then
    -- Solo se genera en el momento que corresponde
    if p_tipo = 'encargo' and v_pago.estado = 'pendiente' then
      perform contrato_generar(p_pago_id, 'encargo');
    elsif p_tipo = 'conformidad' and p_tramo_id is null and v_pago.estado = 'terminada_oficio' then
      perform contrato_generar(p_pago_id, 'conformidad');
    elsif p_tipo = 'conformidad' and p_tramo_id is not null
          and exists (select 1 from pago_tramos where id = p_tramo_id and pago_id = p_pago_id and estado = 'terminado_oficio') then
      perform contrato_generar(p_pago_id, 'conformidad', p_tramo_id);
    end if;
    select * into v_c from contratos
     where pago_id = p_pago_id and tipo = p_tipo
       and coalesce(tramo_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_tramo_id, '00000000-0000-0000-0000-000000000000'::uuid)
       and estado <> 'anulado';
    if not found then
      return null;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_c.id, 'tipo', v_c.tipo, 'estado', v_c.estado, 'titulo', v_c.titulo, 'cuerpo', v_c.cuerpo,
    'hash', v_c.hash, 'firmado_at', v_c.firmado_at, 'firmante_nombre', v_c.firmante_nombre, 'tramo_id', v_c.tramo_id);
end;
$$;

-- El cliente firma. Si es la conformidad, la firma también confirma la obra (o el tramo).
create or replace function firmar_contrato(p_contrato_id uuid, p_nombre text, p_acepto boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c contratos%rowtype;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_cab jsonb;
  v_ip text;
  v_agente text;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  select * into v_c from contratos where id = p_contrato_id for update;
  if not found or v_c.cliente_id is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_c.estado <> 'pendiente' then
    raise exception 'Este contrato ya no está pendiente de firma.';
  end if;
  if p_acepto is not true then
    raise exception 'Tienes que marcar que has leído y aceptas el documento.';
  end if;
  if char_length(v_nombre) < 3 then
    raise exception 'Escribe tu nombre completo para firmar.';
  end if;
  if contrato_hash(v_c.cuerpo) <> v_c.hash then
    raise exception 'El documento ha cambiado. Vuelve a abrirlo antes de firmar.';
  end if;

  begin
    v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip := nullif(trim(split_part(coalesce(v_cab ->> 'x-forwarded-for', ''), ',', 1)), '');
    v_agente := left(coalesce(v_cab ->> 'user-agent', ''), 300);
  exception when others then
    v_ip := null;
    v_agente := null;
  end;

  update contratos
     set estado = 'firmado', firmante_nombre = left(v_nombre, 200), firmado_at = now(),
         firmado_ip = v_ip, firmado_agente = nullif(v_agente, '')
   where id = v_c.id;

  select titulo into v_titulo from obras where id = (select obra_id from pagos where id = v_c.pago_id);

  if v_c.tipo = 'encargo' then
    perform crear_notificacion(v_c.empresa_id, 'contrato_encargo_firmado',
      'El cliente ha firmado el encargo',
      'El cliente ha firmado el encargo de la obra "' || coalesce(v_titulo, '') || '". Ya puede pagar.',
      jsonb_build_object('pago_id', v_c.pago_id, 'contrato_id', v_c.id));
  elsif v_c.tramo_id is null then
    perform pago_cliente_confirma(v_c.pago_id);
  else
    perform tramo_cliente_confirma(v_c.tramo_id);
  end if;
end;
$$;

revoke all on function contrato_obtener(uuid, text, uuid) from public, anon;
revoke all on function firmar_contrato(uuid, text, boolean) from public, anon;
grant execute on function contrato_obtener(uuid, text, uuid) to authenticated;
grant execute on function firmar_contrato(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Para el equipo de 3B (sin tocar la pantalla del panel actual)
-- ---------------------------------------------------------------------------
create or replace function panel_contratos(p_estado text default null)
returns table (
  id uuid, tipo text, estado text, obra_titulo text, tramo_titulo text, cliente_email text,
  empresa_nombre text, firmante_nombre text, firmado_at timestamptz, created_at timestamptz, nota text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform panel_exigir_admin();
  return query
    select c.id, c.tipo, c.estado, o.titulo, t.titulo, pr.email, e.nombre, c.firmante_nombre, c.firmado_at, c.created_at, c.nota
      from contratos c
      join pagos p on p.id = c.pago_id
      left join obras o on o.id = p.obra_id
      left join pago_tramos t on t.id = c.tramo_id
      left join profiles pr on pr.id = c.cliente_id
      left join empresas_subcontratistas e on e.id = c.empresa_id
     where p_estado is null or c.estado = p_estado
     order by c.created_at desc
     limit 500;
end;
$$;

-- Publica una versión nueva de una plantilla (la anterior deja de usarse; los contratos ya generados no cambian)
create or replace function panel_contratos_plantilla_nueva(p_tipo text, p_titulo text, p_cuerpo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ver integer;
begin
  perform panel_exigir_admin();
  if p_tipo not in ('encargo', 'conformidad') then
    raise exception 'Tipo no válido.';
  end if;
  if char_length(trim(coalesce(p_titulo, ''))) < 3 or char_length(trim(coalesce(p_cuerpo, ''))) < 50 then
    raise exception 'Escribe un título y un texto completos.';
  end if;
  select coalesce(max(version), 0) + 1 into v_ver from contratos_plantillas where tipo = p_tipo;
  insert into contratos_plantillas (tipo, version, titulo, cuerpo) values (p_tipo, v_ver, trim(p_titulo), p_cuerpo);
  return v_ver;
end;
$$;

revoke all on function panel_contratos(text) from public, anon;
revoke all on function panel_contratos_plantilla_nueva(text, text, text) from public, anon;
grant execute on function panel_contratos(text) to authenticated;
grant execute on function panel_contratos_plantilla_nueva(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Plantillas de correo de los avisos (solo se envían si el correo está activado en el panel)
-- ---------------------------------------------------------------------------
insert into plantillas_correo (clave, nombre, asunto, cuerpo, boton_texto, activa) values
  ('contrato_encargo_pendiente', 'Firma del encargo', 'Firma el encargo de tu obra',
   E'Hola {{nombre}},\n\n{{cuerpo}}\n\nEs un paso rápido: lees el documento y lo firmas desde la app.', 'Abrir la app', true),
  ('contrato_conformidad_pendiente', 'Firma de la conformidad', 'Firma la conformidad de tu obra',
   E'Hola {{nombre}},\n\n{{cuerpo}}\n\nSi hay algún problema, puedes avisarnos desde la app antes de firmar.', 'Abrir la app', true)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- 8) Textos de las plantillas — BORRADOR pendiente de revisión jurídica
-- ---------------------------------------------------------------------------
insert into contratos_plantillas (tipo, version, titulo, cuerpo) values
('encargo', 1, 'Encargo y condiciones del pago con retención',
$t$[BORRADOR — pendiente de revisión jurídica antes de su uso con clientes reales]

ENCARGO Y CONDICIONES DEL PAGO CON RETENCIÓN
Fecha: {{fecha}}

PARTES
- Plataforma: 3B GROUP ARQUITECTURA, S.L.U. (NIF B02601367), C/ Cervantes 39, 02250 Albacete, titular de 3B Conecta.
- Cliente: {{cliente_nombre}} ({{cliente_email}}).
- Oficio contratado: {{oficio_nombre}} (CIF {{oficio_cif}}).

OBRA
{{obra_titulo}} (ref. {{obra_referencia}}).
Importe de la oferta aceptada: {{importe}}.

CONDICIONES
1. Pago con retención. El cliente paga a través de 3B Conecta. El importe queda retenido y no se entrega al oficio hasta que se cumplan las condiciones de liberación.
2. Plan de pagos:
{{plan_tramos}}
3. Liberación. Cuando el oficio marca la obra (o cada tramo) como terminada, el cliente la revisa y firma su conformidad. 3B hace una comprobación final y libera el pago al oficio.
4. Silencio del cliente. Si el cliente no responde en {{dias_confirmacion}} días desde que el oficio marca la obra (o el tramo) como terminada, se da por confirmada y el proceso sigue con la comprobación de 3B.
5. Incidencias. Antes de firmar la conformidad, el cliente puede comunicar un problema desde la app. En ese caso el pago queda detenido hasta que se resuelva.
6. Reembolsos. Si procede devolver el pago, se hace por el mismo medio de pago utilizado.
7. Datos personales. El tratamiento de datos se explica en la política de privacidad: https://3bconecta.com/privacidad.html
8. Firma electrónica. Al marcar la casilla y escribir su nombre, el cliente firma este documento. Se registran la fecha y la hora, el nombre escrito y datos técnicos de la conexión, junto con una huella del texto firmado.
$t$),
('conformidad', 1, 'Conformidad con la obra',
$t$[BORRADOR — pendiente de revisión jurídica antes de su uso con clientes reales]

CONFORMIDAD CON LA OBRA
Fecha: {{fecha}}

- Cliente: {{cliente_nombre}} ({{cliente_email}}).
- Oficio: {{oficio_nombre}} (CIF {{oficio_cif}}).
- Obra: {{obra_titulo}} (ref. {{obra_referencia}}).
- Alcance de esta conformidad: {{alcance}}.
- Importe asociado: {{importe_alcance}}.

DECLARACIÓN
El cliente declara que ha revisado {{alcance}} y que está conforme con el trabajo realizado.

EFECTOS
1. La firma de este documento confirma la obra (o el tramo) y permite a 3B hacer la comprobación final y liberar el pago al oficio.
2. Si el cliente no firma ni comunica ningún problema en {{dias_confirmacion}} días desde que el oficio la marcó como terminada, se da por confirmada automáticamente y se registra como conformidad tácita.
3. Si hay un problema, el cliente debe comunicarlo desde la app antes de firmar. El pago queda detenido hasta resolverlo.
4. Firma electrónica: al marcar la casilla y escribir su nombre, el cliente firma este documento. Se registran la fecha y la hora, el nombre escrito y datos técnicos de la conexión, junto con una huella del texto firmado.
$t$)
on conflict (tipo, version) do nothing;