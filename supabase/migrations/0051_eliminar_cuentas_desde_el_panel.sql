-- ============================================================================
-- Eliminar cuentas desde el panel de administración
-- ============================================================================
-- Hasta ahora una cuenta solo se podía suspender; borrarla había que hacerlo
-- a mano en Supabase. Esta función deja que un admin la elimine desde el panel
-- con las mismas garantías que el "Eliminar mi cuenta" de la app, más algunas.
--
-- Protecciones (si no se cumplen, no borra nada y explica el motivo):
--  - Solo admin / superadmin pueden llamarla.
--  - No se puede borrar una cuenta de administración de OH ni la propia.
--  - Si la persona tiene comisiones pendientes o aceptadas sin cobrar, se
--    bloquea (es dinero que OH le debe).
--  - Si su empresa está adjudicada en una obra no cerrada, se bloquea.
--  - Si es un técnico con visitas asignadas, se bloquea (suspéndelo mejor).
--
-- Qué se borra: la cuenta, sus avisos, tokens del móvil y -si ninguna otra
-- cuenta la comparte- la ficha de su empresa con sus postulaciones, canjes,
-- documentos y puntos. Qué se conserva: obras que publicó (quedan sin dueño),
-- recomendaciones y comisiones ya cobradas (datos comerciales de OH) y el
-- registro de actividad, donde queda anotado quién la eliminó y cuándo.
--
-- Se puede ejecutar más de una vez sin problema.

-- El registro de auditoría apuntaba a profiles sin ON DELETE: quien hubiera
-- hecho alguna acción no podía borrarse. Ahora el registro se queda y deja de
-- señalar a la persona.
alter table logs_auditoria drop constraint if exists logs_auditoria_actor_id_fkey;
alter table logs_auditoria add constraint logs_auditoria_actor_id_fkey
  foreign key (actor_id) references profiles (id) on delete set null;

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

  -- Dejar constancia antes de borrar
  insert into registro_actividad (quien, accion, origen, tipo, detalle)
  values (v_admin, 'cuenta.eliminada', 'panel', v_role::text,
          jsonb_build_object('nombre', v_nombre, 'correo', v_email, 'perfil', v_role::text));

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