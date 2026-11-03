-- 0069 · Eliminar obras y cuentas desde el panel (con pagos de por medio)
--
-- · Incluye panel_eliminar_obra (era la 0061, que no estaba aplicada: por eso el panel decía "Could not find the function").
-- · panel_eliminar_cuenta ya no falla con "violates foreign key constraint pagos_empresa_id_fkey": si la cuenta tiene pagos
--   que movieron dinero, explica que hay que suspenderla; los pagos que nunca movieron dinero se borran con la cuenta.

create or replace function panel_eliminar_obra(p_obra_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
  v_estado text;
begin
  perform panel_exigir_admin();
  select titulo into v_titulo from obras where id = p_obra_id;
  if not found then
    raise exception 'La obra no existe.';
  end if;

  select estado into v_estado from pagos
   where obra_id = p_obra_id and estado not in ('pendiente', 'fallido', 'cancelado')
   order by created_at desc limit 1;
  if found then
    raise exception 'Esta obra tiene un pago registrado (estado: %). Los pagos no se borran para conservar el historial. Resuelve el pago desde Pagos y, en vez de eliminar la obra, márcala como cancelada o finalizada.', v_estado;
  end if;

  delete from pagos where obra_id = p_obra_id;      -- solo quedan pagos que nunca movieron dinero
  delete from obras where id = p_obra_id;
end;
$$;

revoke all on function panel_eliminar_obra(uuid) from public, anon;
grant execute on function panel_eliminar_obra(uuid) to authenticated;

create or replace function panel_eliminar_cuenta(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_role user_role;
  v_nombre text;
  v_email text;
  v_empresa uuid;
begin
  if v_admin is null or auth_role() not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración puede eliminar cuentas.';
  end if;

  if p_profile_id = v_admin then
    raise exception 'No puedes eliminar tu propia cuenta desde el panel.';
  end if;

  select role, nombre_completo, email, empresa_id
    into v_role, v_nombre, v_email, v_empresa
  from profiles where id = p_profile_id;

  if v_role is null then
    raise exception 'No se encuentra esta cuenta.';
  end if;

  if v_role in ('admin', 'superadmin') then
    raise exception 'Las cuentas de administración de OH no se eliminan desde el panel. Si hace falta, se dan de baja a mano en Supabase.';
  end if;

  if exists (
    select 1 from recompensas_referido
    where referidor_id = p_profile_id and estado in ('pendiente', 'aceptada')
  ) then
    raise exception 'Esta persona tiene comisiones pendientes de cobro. Págalas o resuélvelas antes de eliminar la cuenta.';
  end if;

  if v_empresa is not null and exists (
    select 1
    from postulaciones p
    join obras o on o.id = p.obra_id
    where p.empresa_id = v_empresa
      and p.estado = 'aceptada'
      and o.estado in ('adjudicada', 'en_curso')
  ) then
    raise exception 'Esta empresa tiene una obra adjudicada o en curso. Cierra la obra antes de eliminar la cuenta.';
  end if;

  if exists (select 1 from visitas_tecnicas where tecnico_id = p_profile_id) then
    raise exception 'Este técnico tiene visitas técnicas asignadas. Suspéndelo en lugar de eliminarlo.';
  end if;

  -- Pagos: los que movieron dinero se conservan (es el historial) y bloquean el borrado; los que nunca lo movieron se quitan
  if exists (
    select 1 from pagos
     where (empresa_id = v_empresa or cliente_id = p_profile_id)
       and estado not in ('pendiente', 'fallido', 'cancelado')
  ) then
    raise exception 'Esta cuenta tiene pagos registrados. Los pagos no se borran para conservar el historial; suspende la cuenta en vez de eliminarla.';
  end if;

  -- Dejar constancia antes de borrar
  insert into registro_actividad (quien, accion, origen, tipo, detalle)
  values (v_admin, 'cuenta.eliminada', 'panel', v_role::text,
          jsonb_build_object('nombre', v_nombre, 'correo', v_email, 'perfil', v_role::text));

  delete from pagos where (empresa_id = v_empresa or cliente_id = p_profile_id) and estado in ('pendiente', 'fallido', 'cancelado');
  delete from notificaciones where user_id = p_profile_id;
  delete from push_tokens where user_id = p_profile_id;

  -- Borrar auth.users arrastra el perfil y todo lo que cuelga de él en cascada
  delete from auth.users where id = p_profile_id;

  -- La ficha de empresa solo se quita si nadie más la usa
  if v_empresa is not null
     and not exists (select 1 from profiles where empresa_id = v_empresa) then
    delete from empresas_subcontratistas where id = v_empresa;
  end if;
end;
$$;

revoke execute on function panel_eliminar_cuenta(uuid) from public, anon;
grant execute on function panel_eliminar_cuenta(uuid) to authenticated;