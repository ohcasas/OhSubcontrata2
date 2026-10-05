-- ============================================================================
-- Precio fundador para promotoras y constructoras (octubre 2026)
-- ============================================================================
-- Acordado con Dirección:
--   - Precio estándar de promotor y constructora: 49,90 €/mes.
--   - "Precio fundador": las PRIMERAS promotoras y constructoras pagan 19,90 €
--     y se les mantiene 12 meses. Las que lleguen después, 49,90 €.
--   - Inmobiliarias (tipo 'administrador'), arquitectos, proveedores y
--     profesionales: precio único, sin programa fundador.
--
-- Decisiones de diseño:
--   1) Los 12 meses cuentan desde que EMPIECE EL COBRO, no desde el registro.
--      Si contaran desde el alta, el periodo gratuito del lanzamiento se comería
--      el precio fundador. (Esta migración no fija fechas; lo hará la lógica de
--      cobro al activar la suscripción: fin = inicio del cobro + `meses`.)
--   2) "Las primeras" se decide por ORDEN DE REGISTRO y se calcula cuando se
--      activa el cobro (precio_aplicable()), no al registrarse. Así no hay que
--      decidir hoy cuántas plazas hay, y las cuentas que ya se han registrado
--      cuentan igual que las futuras.
--   3) El número de plazas está VACÍO a propósito (programa inactivo). Mientras
--      sea NULL, precio_aplicable() devuelve el precio estándar para todos.
--      ANTES DE ACTIVAR EL COBRO hay que fijarlo:
--         update programa_fundador set plazas = 20;   -- el número que se decida
--   4) suscripciones.precio_mensual dejaba de ser fiable: se copiaba al
--      registrarse, y con un precio fundador ese dato podría ser el equivocado.
--      Ahora no se rellena al alta (la función de registro se redefine abajo).
--
-- Se puede ejecutar más de una vez sin problema.

alter table precios_suscripcion add column if not exists precio_fundador numeric(10,2);

update precios_suscripcion set precio_mensual = 49.90, precio_fundador = 19.90
  where role in ('promotor', 'constructora');

create table if not exists programa_fundador (
  id boolean primary key default true check (id),   -- una sola fila
  plazas integer check (plazas is null or plazas >= 0),
  meses integer not null default 12 check (meses > 0)
);
insert into programa_fundador (id) values (true) on conflict (id) do nothing;

comment on table programa_fundador is
  'Programa de precio fundador. plazas = nº de cuentas (entre todos los perfiles con precio_fundador) que lo reciben, por orden de registro; NULL = programa inactivo. meses = cuánto se mantiene, contado desde el inicio del cobro.';

alter table programa_fundador enable row level security;
drop policy if exists programa_fundador_select on programa_fundador;
create policy programa_fundador_select on programa_fundador
  for select using (auth.uid() is not null);
drop policy if exists programa_fundador_admin_write on programa_fundador;
create policy programa_fundador_admin_write on programa_fundador
  for all using (auth_role() in ('admin', 'superadmin'));

-- Lo que ya hubiera copiado la versión anterior del registro: se borra, porque
-- nadie ha cobrado nada y ese precio podía ser el equivocado.
update suscripciones set precio_mensual = null where estado = 'pendiente_pago';
comment on column suscripciones.precio_mensual is
  'Se rellena al ACTIVAR el cobro con el resultado de precio_aplicable(). Mientras la cuenta está en pendiente_pago es NULL.';

-- ¿Cuánto le toca pagar a esta cuenta? Lo usará la lógica de cobro al activar.
create or replace function precio_aplicable(p_profile_id uuid)
returns table (precio numeric, es_fundador boolean, meses_fundador integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_creada timestamptz;
  v_estandar numeric(10,2);
  v_fundador numeric(10,2);
  v_plazas integer;
  v_meses integer;
  v_puesto integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  -- coalesce: si no hubiera perfil, auth_role() sería NULL y un "not in" con NULL
  -- no dispararía el error (ver 0022).
  if p_profile_id <> auth.uid() and coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;

  select role, created_at into v_role, v_creada from suscripciones where profile_id = p_profile_id;
  if v_role is null then
    raise exception 'Esta cuenta no tiene suscripción';
  end if;

  select precio_mensual, precio_fundador into v_estandar, v_fundador
    from precios_suscripcion where role = v_role;
  select plazas, meses into v_plazas, v_meses from programa_fundador;

  if v_fundador is not null and v_plazas is not null then
    -- Puesto de esta cuenta entre todas las que pueden tener precio fundador
    select count(*) into v_puesto
      from suscripciones s
      join precios_suscripcion p on p.role = s.role
      where p.precio_fundador is not null
        and (s.created_at, s.profile_id) <= (v_creada, p_profile_id);

    if v_puesto <= v_plazas then
      return query select v_fundador, true, v_meses;
      return;
    end if;
  end if;

  return query select v_estandar, false, null::integer;
end;
$$;

revoke execute on function precio_aplicable(uuid) from public, anon;
grant execute on function precio_aplicable(uuid) to authenticated;

-- El registro ya no copia el precio (ver punto 4 de arriba). Mismo cuerpo que en 0026.
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

  -- El precio NO se copia aquí: se calcula al activar el cobro (ver precio_aplicable()).
  insert into suscripciones (profile_id, role)
  values (new.id, v_rol::user_role);

  return new;
end;
$$;