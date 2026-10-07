-- ============================================================================
-- Avisar al admin de cuentas nuevas + cerrar el último hueco de la suspensión
-- ============================================================================
-- Sigue a 0034 (verificación de cuentas). Dos cosas:
--
-- 1) AVISO AL ADMIN. Cuando se registra una cuenta pendiente, todos los admin
--    reciben una notificación y un push ("Nueva cuenta por verificar"). Sin nada
--    externo que configurar. Como máximo UNO cada 15 minutos por admin: si alguien
--    registra cuentas falsas en masa, no se llena el móvil (el aviso de la
--    siguiente tanda dice cuántas hay pendientes en total). Si el aviso falla,
--    el registro NO se bloquea. El webhook hacia n8n/Odoo se mantiene.
--
-- 2) CIERRE DEL LÍMITE DE 1 HORA. Una cuenta suspendida conservaba su sesión hasta
--    que caducaba el token (como mucho 1 h) y en ese tiempo podía todavía registrar
--    avances de obra y solicitar canjes, porque esas funciones no comprobaban el
--    estado de la cuenta. En vez de reescribir esas funciones, se bloquea en las
--    TABLAS donde escriben (avances_obra y canjes) con un disparador: así cubre
--    cualquier ruta, la función de hoy y las de mañana. Las operaciones sin sesión
--    de usuario (backend, n8n, SQL Editor) no se ven afectadas.
--
-- Se puede ejecutar más de una vez sin problema.

-- 2) Bloqueo en las tablas
create or replace function bloquear_si_cuenta_no_activa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    perform exigir_cuenta_activa();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_exigir_cuenta_avances on avances_obra;
create trigger trg_exigir_cuenta_avances
  before insert on avances_obra
  for each row execute function bloquear_si_cuenta_no_activa();

drop trigger if exists trg_exigir_cuenta_canjes on canjes;
create trigger trg_exigir_cuenta_canjes
  before insert on canjes
  for each row execute function bloquear_si_cuenta_no_activa();

-- 1) Aviso a los admin (misma función que en 0034 + el aviso)
create or replace function avisar_cuenta_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_pendientes integer;
  v_titulo text;
  v_cuerpo text;
  v_perfil text;
begin
  if new.estado_cuenta = 'pendiente' and new.role not in ('admin', 'superadmin') then
    begin
      perform disparar_webhook('cuenta.pendiente', jsonb_build_object(
        'profile_id', new.id, 'rol', new.role, 'nombre', new.nombre_completo, 'email', new.email
      ));
    exception when others then
      null;
    end;

    begin
      select count(*) into v_pendientes
        from profiles where estado_cuenta = 'pendiente' and role not in ('admin', 'superadmin');
      v_perfil := case new.role
        when 'subcontratista' then 'Oficios'
        when 'referidor' then 'Recomendador'
        when 'promotor' then 'Promotor'
        when 'constructora' then 'Constructora'
        when 'arquitecto' then 'Arquitecto'
        when 'proveedor' then 'Proveedor'
        when 'profesional' then 'Profesional'
        when 'administrador' then 'Inmobiliaria / Administrador'
        else new.role::text
      end;
      v_titulo := case when v_pendientes <= 1 then 'Nueva cuenta por verificar' else v_pendientes || ' cuentas por verificar' end;
      v_cuerpo := coalesce(nullif(trim(new.nombre_completo), ''), 'Alguien') || ' se ha registrado como ' || v_perfil
        || '. Entra en Conecta → Cuentas para verificarla.';

      for v_admin in select id from profiles where role in ('admin', 'superadmin') loop
        if not exists (
          select 1 from notificaciones
          where user_id = v_admin.id and tipo = 'cuenta_pendiente' and created_at > now() - interval '15 minutes'
        ) then
          insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
          values (v_admin.id, 'cuenta_pendiente', v_titulo, v_cuerpo, jsonb_build_object('profile_id', new.id));
          begin
            perform enviar_push(v_admin.id, v_titulo, v_cuerpo, jsonb_build_object('tipo', 'cuenta_pendiente'));
          exception when others then
            null;
          end;
        end if;
      end loop;
    exception when others then
      null;  -- el aviso es un extra: nunca debe impedir un registro
    end;
  end if;
  return new;
end;
$$;