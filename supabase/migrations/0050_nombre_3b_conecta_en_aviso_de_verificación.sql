-- 0050 — El aviso de "Cuenta verificada" dice "3B Conecta" (antes decía "OH Conecta").
-- Sin cambios de app: es solo texto de la base de datos, no hace falta compilar ni pasar revisión de Play.
-- Ejecutar entero en el SQL Editor de Supabase.

-- 1) Función cambiar_estado_cuenta: igual que la de 0039, solo cambia el texto de bienvenida.
create or replace function cambiar_estado_cuenta(
  p_profile_id uuid, p_nuevo_estado text, p_motivo text default null, p_forzar boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_estado_ant text;
  v_role user_role;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_titulo text;
  v_cuerpo text;
  v_faltan text[];
  v_motivo_historial text;
begin
  if v_admin is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  if p_nuevo_estado is null or p_nuevo_estado not in ('pendiente', 'verificada', 'suspendida') then
    raise exception 'Estado no válido';
  end if;
  if p_profile_id = v_admin then
    raise exception 'No puedes cambiar el estado de tu propia cuenta.';
  end if;

  select estado_cuenta, role into v_estado_ant, v_role from profiles where id = p_profile_id for update;
  if v_role is null then
    raise exception 'Cuenta no encontrada';
  end if;
  if v_role in ('admin', 'superadmin') then
    raise exception 'No se puede cambiar el estado de una cuenta de administración.';
  end if;
  if v_estado_ant = p_nuevo_estado then
    return;
  end if;
  if p_nuevo_estado = 'suspendida' and (v_motivo is null or length(v_motivo) < 3) then
    raise exception 'Escribe el motivo de la suspensión.';
  end if;

  -- Verificar una cuenta nueva exige tener APROBADA la documentación obligatoria de su perfil.
  -- Se puede saltar a mano (p_forzar) dejando escrito el motivo. Reactivar una cuenta que ya
  -- estuvo verificada (suspendida -> verificada) no vuelve a pedirla.
  if p_nuevo_estado = 'verificada' and v_estado_ant = 'pendiente' then
    select coalesce(array_agg(r.etiqueta order by r.orden), '{}') into v_faltan
      from documentos_requeridos r
      where r.role = v_role and r.obligatorio
        and not exists (
          select 1 from documentos_cuenta d
          where d.profile_id = p_profile_id and d.tipo = r.tipo and d.estado = 'aprobado'
        );
    if cardinality(v_faltan) > 0 then
      if p_forzar is not true then
        raise exception 'Faltan documentos obligatorios por aprobar: %.', array_to_string(v_faltan, ', ');
      elsif v_motivo is null or length(v_motivo) < 3 then
        raise exception 'Para verificar sin la documentación completa, escribe el motivo.';
      else
        v_motivo_historial := 'Verificada sin la documentación completa (' || array_to_string(v_faltan, ', ') || '): ' || v_motivo;
      end if;
    end if;
  end if;

  update profiles
    set estado_cuenta = p_nuevo_estado,
        estado_cuenta_motivo = case when p_nuevo_estado = 'suspendida' then left(v_motivo, 500) else null end,
        estado_cuenta_actualizado_en = now(),
        estado_cuenta_actualizado_por = v_admin
    where id = p_profile_id;

  insert into cuenta_historial (profile_id, estado_anterior, estado_nuevo, motivo, hecho_por)
  values (p_profile_id, v_estado_ant, p_nuevo_estado, left(coalesce(v_motivo_historial, v_motivo), 500), v_admin);

  -- Aviso a n8n/Odoo (por ejemplo, para mandar un correo de bienvenida o dar de alta el contacto)
  perform disparar_webhook(
    case p_nuevo_estado when 'verificada' then 'cuenta.verificada' when 'suspendida' then 'cuenta.suspendida' else 'cuenta.en_revision' end,
    jsonb_build_object(
      'profile_id', p_profile_id, 'rol', v_role,
      'nombre', (select p.nombre_completo from profiles p where p.id = p_profile_id),
      'email', (select p.email from profiles p where p.id = p_profile_id),
      'estado_anterior', v_estado_ant, 'estado_nuevo', p_nuevo_estado,
      'motivo', case when p_nuevo_estado = 'suspendida' then v_motivo else null end,
      'verificada_sin_documentacion_completa', v_motivo_historial is not null
    )
  );

  if p_nuevo_estado = 'suspendida' then
    -- No puede volver a entrar, y se cierran las sesiones que tenga abiertas.
    update auth.users set banned_until = 'infinity' where id = p_profile_id;
    delete from auth.sessions where user_id = p_profile_id;
  else
    update auth.users set banned_until = null where id = p_profile_id;
  end if;

  v_titulo := case p_nuevo_estado
    when 'verificada' then 'Cuenta verificada'
    when 'suspendida' then 'Cuenta suspendida'
    else 'Cuenta en revisión'
  end;
  v_cuerpo := case p_nuevo_estado
    when 'verificada' then 'Ya hemos verificado tu cuenta. ¡Bienvenido a 3B Conecta!'
    when 'suspendida' then 'Tu cuenta ha sido suspendida. Motivo: ' || v_motivo || '. Si crees que es un error, escríbenos a software@ohcasas.es.'
    else 'Hemos vuelto a poner tu cuenta en revisión. Te avisaremos cuando esté verificada.'
  end;
  insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
  values (p_profile_id, 'cuenta_estado', v_titulo, v_cuerpo, jsonb_build_object('estado', p_nuevo_estado));
  begin
    perform enviar_push(p_profile_id, v_titulo, v_cuerpo, jsonb_build_object('estado', p_nuevo_estado));
  exception when others then
    null;  -- el aviso por push es un extra: si falla, el cambio de estado se mantiene
  end;
end;
$$;

-- 2) Corregir los avisos ya enviados con el nombre antiguo.
update notificaciones
set cuerpo = replace(cuerpo, 'OH Conecta', '3B Conecta')
where tipo = 'cuenta_estado'
  and cuerpo like '%OH Conecta%';