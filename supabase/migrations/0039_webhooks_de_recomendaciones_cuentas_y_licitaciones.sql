-- ============================================================================
-- Webhooks de lo que se ha construido después: recomendaciones, comisiones, cuentas, licitaciones
-- ============================================================================
-- Hasta ahora disparaban webhook (hacia n8n/Odoo, según webhooks_config) las obras, los canjes,
-- las postulaciones, los avances, las empresas nuevas y las cuentas pendientes. NO disparaban nada
-- las recomendaciones de clientes (que son, en el fondo, contactos comerciales para Odoo), las
-- comisiones, la verificación de cuentas, la documentación ni las licitaciones de terceros.
--
-- Esta migración añade 11 eventos. NO cambia lo que hace la app: solo envía un mensaje a las URLs que
-- haya en webhooks_config para cada evento; mientras no haya ninguna, no ocurre nada. Si el envío
-- falla, nunca tumba la operación real (disparar_webhook se traga sus propios errores).
--
--   recomendacion.creada   una persona recomienda a un cliente (con sus datos de contacto)
--   recomendacion.estado   la recomendación avanza o se descarta (de qué estado a cuál)
--   comision.generada      al llegar a "venta" se genera la comisión (porcentaje, base, importe)
--   comision.aceptada      la persona acepta su comisión
--   comision.pagada        el admin la marca como pagada
--   cuenta.verificada      se verifica una cuenta (también al reactivarla)
--   cuenta.suspendida      se rechaza o suspende una cuenta (con el motivo)
--   cuenta.en_revision     una cuenta vuelve a revisión
--   documentacion.completa una cuenta pendiente ha subido todos sus documentos obligatorios
--   licitacion.creada      una promotora o constructora publica una licitación
--   licitacion.estado      una licitación cambia de estado
--
-- OJO con los datos personales: recomendacion.creada lleva el nombre, teléfono y correo del cliente
-- recomendado, y cuenta.* lleva el nombre y el correo de la persona. Son datos que ya trata OH, pero
-- viajan a n8n/Odoo: usa solo destinos de la empresa.
--
-- Cada función se redefine con su texto actual más el aviso (misma firma, mismos permisos).
-- Se puede ejecutar más de una vez sin problema.

create or replace function crear_referencia_comercial(
  p_nombre_cliente text,
  p_telefono_cliente text,
  p_email_cliente text,
  p_consentimiento boolean
)
returns referencias_comerciales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referencia referencias_comerciales;
  v_perfil record;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  if trim(coalesce(p_nombre_cliente, '')) = '' then
    raise exception 'Indica el nombre de la persona que quiere construir';
  end if;
  if p_consentimiento is distinct from true then
    raise exception 'Hace falta confirmar que la persona referida ha dado su consentimiento para ser contactada';
  end if;

  insert into referencias_comerciales (referidor_id, nombre_cliente, telefono_cliente, email_cliente, consentimiento_obtenido)
  values (v_uid, trim(p_nombre_cliente), nullif(trim(coalesce(p_telefono_cliente, '')), ''), nullif(trim(coalesce(p_email_cliente, '')), ''), true)
  returning * into v_referencia;

  -- Aviso a n8n/Odoo: una recomendación nueva es un posible cliente
  select p.nombre_completo, p.email, p.telefono, p.role into v_perfil from profiles p where p.id = v_uid;
  perform disparar_webhook('recomendacion.creada', jsonb_build_object(
    'referencia_id', v_referencia.id,
    'cliente_nombre', v_referencia.nombre_cliente, 'cliente_telefono', v_referencia.telefono_cliente, 'cliente_email', v_referencia.email_cliente,
    'consentimiento', true,
    'referidor_id', v_uid, 'referidor_nombre', v_perfil.nombre_completo, 'referidor_email', v_perfil.email,
    'referidor_telefono', v_perfil.telefono, 'referidor_rol', v_perfil.role
  ));

  return v_referencia;
end;
$$;

create or replace function actualizar_estado_referencia(
  p_referencia_id uuid,
  p_nuevo_estado text,
  p_motivo_descarte text default null,
  p_obra_id uuid default null,
  p_precio_venta numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referidor_id uuid;
  v_nombre_cliente text;
  v_estado_actual text;
  v_precio_venta numeric(12,2);
  v_rol_referidor user_role;
  v_porcentaje numeric(4,2);
  v_importe numeric(12,2);
  v_empresa_id uuid;
  v_cambio_estado boolean;
  v_recompensa_id uuid;
  v_etiqueta text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;
  if p_nuevo_estado not in ('enviado', 'contactado', 'visita', 'presupuesto', 'reserva', 'venta', 'comision_disponible', 'descartado') then
    raise exception 'Estado no válido: %', p_nuevo_estado;
  end if;

  select referidor_id, nombre_cliente, estado, coalesce(p_precio_venta, precio_venta)
    into v_referidor_id, v_nombre_cliente, v_estado_actual, v_precio_venta
    from referencias_comerciales
    where id = p_referencia_id
    for update;

  if v_referidor_id is null then
    raise exception 'Referencia no encontrada';
  end if;

  v_cambio_estado := v_estado_actual is distinct from p_nuevo_estado;

  -- Con una comisión ya generada, la recomendación no puede volver atrás ni descartarse: la venta y el
  -- pago quedarían incoherentes (ya pasó: comisión pagada con la recomendación en "Visita").
  if p_nuevo_estado not in ('venta', 'comision_disponible')
     and exists (select 1 from recompensas_referido where referencia_id = p_referencia_id) then
    raise exception 'Esta recomendación ya tiene una comisión generada, así que no puede volver a un estado anterior.';
  end if;

  if p_nuevo_estado = 'venta' and v_precio_venta is null then
    raise exception 'Para marcar esta referencia como venta hace falta indicar el precio de venta al cliente';
  end if;

  update referencias_comerciales
    set estado = p_nuevo_estado,
        motivo_descarte = case when p_nuevo_estado = 'descartado' then p_motivo_descarte else motivo_descarte end,
        obra_id = coalesce(p_obra_id, obra_id),
        precio_venta = coalesce(p_precio_venta, precio_venta),
        updated_at = now()
    where id = p_referencia_id;

  -- Queda anotado quién cambió el estado, de cuál a cuál y cuándo
  if v_cambio_estado then
    insert into referencias_historial (referencia_id, estado_anterior, estado_nuevo, cambiado_por)
    values (p_referencia_id, v_estado_actual, p_nuevo_estado, auth.uid());

    -- Aviso a n8n/Odoo: la recomendación avanza en el embudo
    perform disparar_webhook('recomendacion.estado', jsonb_build_object(
      'referencia_id', p_referencia_id, 'cliente_nombre', v_nombre_cliente, 'referidor_id', v_referidor_id,
      'estado_anterior', v_estado_actual, 'estado_nuevo', p_nuevo_estado, 'precio_venta', v_precio_venta
    ));
  end if;

  -- Comisión automática al llegar a 'venta' — % según el rol de quien
  -- refiere, sobre el precio de venta. Una sola vez por referencia (el
  -- unique de recompensas_referido la blinda de duplicados si la venta se
  -- marca, se revierte y se vuelve a marcar).
  if p_nuevo_estado = 'venta' then
    select role into v_rol_referidor from profiles where id = v_referidor_id;
    select porcentaje into v_porcentaje from reglas_recompensa_referido where role = v_rol_referidor;

    if v_porcentaje is not null then
      v_importe := round(v_precio_venta * v_porcentaje / 100, 2);

      insert into recompensas_referido (referencia_id, referidor_id, rol_referidor, porcentaje, base_imponible, importe)
      values (p_referencia_id, v_referidor_id, v_rol_referidor, v_porcentaje, v_precio_venta, v_importe)
      on conflict (referencia_id) do nothing
      returning id into v_recompensa_id;

      -- Aviso a n8n/Odoo: hay una comisión nueva por pagar
      if v_recompensa_id is not null then
        perform disparar_webhook('comision.generada', jsonb_build_object(
          'recompensa_id', v_recompensa_id, 'referencia_id', p_referencia_id, 'referidor_id', v_referidor_id,
          'rol', v_rol_referidor, 'porcentaje', v_porcentaje, 'base_imponible', v_precio_venta, 'importe', v_importe
        ));
      end if;
    end if;
  end if;

  -- Transparencia: quien refiere se entera del cambio sin tener que
  -- preguntar. Se reutiliza crear_notificacion(), que reparte el aviso a
  -- todos los profiles de esa empresa (lo normal es que solo haya uno).
  select empresa_id into v_empresa_id from profiles where id = v_referidor_id;
  -- Solo se avisa si el estado ha cambiado de verdad o si se acaba de crear una
  -- comisión. Antes se avisaba en CADA llamada, así que pulsar varias veces la
  -- misma píldora en el panel de admin llenaba el móvil de avisos idénticos.
  v_etiqueta := case p_nuevo_estado
    when 'enviado' then 'Enviado'
    when 'contactado' then 'Contactado'
    when 'visita' then 'Visita realizada'
    when 'presupuesto' then 'Presupuesto enviado'
    when 'reserva' then 'Reserva'
    when 'venta' then 'Venta'
    when 'comision_disponible' then 'Comisión disponible'
    when 'descartado' then 'Descartado'
  end;

  if v_empresa_id is not null and (v_cambio_estado or v_recompensa_id is not null) then
    perform crear_notificacion(
      v_empresa_id,
      'referencia_actualizada',
      case when p_nuevo_estado = 'descartado' then 'Tu recomendación se ha cerrado' else 'Tu recomendación ha avanzado' end,
      'La recomendación de «' || v_nombre_cliente || '» ha pasado a: ' || v_etiqueta || '.'
        || case when v_recompensa_id is not null
             then ' Se ha generado una comisión de ' || v_importe || ' € (' || v_porcentaje || '% sobre ' || v_precio_venta || ' €).'
             else '' end,
      jsonb_build_object('referencia_id', p_referencia_id, 'estado', p_nuevo_estado)
    );
  end if;
end;
$$;

create or replace function aceptar_recompensa_referido(p_recompensa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referidor_id uuid;
  v_estado text;
  v_importe numeric(12,2);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select referidor_id, estado, importe into v_referidor_id, v_estado, v_importe
    from recompensas_referido
    where id = p_recompensa_id
    for update;

  if v_referidor_id is null then
    raise exception 'Recompensa no encontrada';
  end if;
  if v_referidor_id <> v_uid then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta recompensa ya se ha resuelto';
  end if;

  update recompensas_referido set estado = 'aceptada', updated_at = now() where id = p_recompensa_id;

  perform disparar_webhook('comision.aceptada', jsonb_build_object(
    'recompensa_id', p_recompensa_id, 'referidor_id', v_referidor_id, 'importe', v_importe
  ));
end;
$$;

create or replace function marcar_recompensa_pagada(p_recompensa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referidor_id uuid;
  v_estado text;
  v_importe numeric(12,2);
  v_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if auth_role() not in ('admin', 'superadmin') then
    raise exception 'No autorizado';
  end if;

  select referidor_id, estado, importe
    into v_referidor_id, v_estado, v_importe
    from recompensas_referido
    where id = p_recompensa_id
    for update;

  if v_estado is null then
    raise exception 'Comisión no encontrada';
  end if;
  if v_estado <> 'aceptada' then
    raise exception 'Solo se puede marcar como pagada una comisión que la persona ya ha aceptado (estado actual: %)', v_estado;
  end if;

  update recompensas_referido set estado = 'pagada', updated_at = now() where id = p_recompensa_id;

  -- Aviso a n8n/Odoo: para cuadrar la contabilidad
  perform disparar_webhook('comision.pagada', jsonb_build_object(
    'recompensa_id', p_recompensa_id, 'referidor_id', v_referidor_id, 'importe', v_importe
  ));

  if v_referidor_id is not null then
    select empresa_id into v_empresa_id from profiles where id = v_referidor_id;
    if v_empresa_id is not null then
      perform crear_notificacion(
        v_empresa_id,
        'comision_pagada',
        'Comisión pagada',
        'Hemos marcado como pagada tu comisión de ' || v_importe || ' €.',
        jsonb_build_object('recompensa_id', p_recompensa_id)
      );
    end if;
  end if;
end;
$$;

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
    when 'verificada' then 'Ya hemos verificado tu cuenta. ¡Bienvenido a OH Conecta!'
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

create or replace function registrar_documento_cuenta(p_tipo text, p_nombre text, p_ruta text, p_mime text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_estado text;
  v_etiqueta text;
  v_obligatorio boolean;
  v_previo text;
  v_faltan integer;
  v_nombre text;
  v_admin record;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  select p.role, p.estado_cuenta into v_role, v_estado from profiles p where p.id = v_uid;
  if v_estado is distinct from 'pendiente' then
    raise exception 'Tu cuenta ya no está pendiente de verificación.';
  end if;

  select r.etiqueta, r.obligatorio into v_etiqueta, v_obligatorio
    from documentos_requeridos r where r.role = v_role and r.tipo = p_tipo;
  if v_etiqueta is null then
    raise exception 'Ese documento no se pide para tu tipo de cuenta.';
  end if;
  if p_ruta is null or left(p_ruta, length(v_uid::text) + 1) <> v_uid::text || '/' then
    raise exception 'Ruta de archivo no válida.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documentos-verificacion' and o.name = p_ruta) then
    raise exception 'No se encuentra el archivo subido.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta el nombre del archivo.';
  end if;

  select d.estado into v_previo from documentos_cuenta d where d.profile_id = v_uid and d.tipo = p_tipo;
  if v_previo = 'aprobado' then
    raise exception 'Ese documento ya está aprobado.';
  end if;

  insert into documentos_cuenta (profile_id, tipo, nombre_archivo, storage_path, tipo_mime)
  values (v_uid, p_tipo, left(btrim(p_nombre), 200), p_ruta, p_mime)
  on conflict (profile_id, tipo) do update
    set nombre_archivo = excluded.nombre_archivo, storage_path = excluded.storage_path,
        tipo_mime = excluded.tipo_mime, estado = 'pendiente', motivo_rechazo = null,
        revisado_por = null, revisado_en = null, updated_at = now();

  -- Cuando ya están subidos TODOS los obligatorios, se avisa a los admin (una vez)
  select count(*) into v_faltan
    from documentos_requeridos r
    where r.role = v_role and r.obligatorio
      and not exists (select 1 from documentos_cuenta d where d.profile_id = v_uid and d.tipo = r.tipo);
  if v_obligatorio and v_faltan = 0 and (v_previo is null or v_previo = 'rechazado') then
    begin
      select p.nombre_completo into v_nombre from profiles p where p.id = v_uid;
      for v_admin in select p.id from profiles p where p.role in ('admin', 'superadmin') loop
        insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
        values (v_admin.id, 'documentacion_completa', 'Documentación lista para revisar',
                coalesce(nullif(btrim(v_nombre), ''), 'Una cuenta') || ' ha subido toda su documentación. Revísala en Conecta → Cuentas.',
                jsonb_build_object('profile_id', v_uid));
        begin
          perform enviar_push(v_admin.id, 'Documentación lista para revisar',
                              coalesce(nullif(btrim(v_nombre), ''), 'Una cuenta') || ' ha subido toda su documentación.',
                              jsonb_build_object('tipo', 'documentacion_completa'));
        exception when others then
          null;
        end;
      end loop;

      -- Aviso a n8n/Odoo (por ejemplo, un correo o un mensaje al equipo que verifica)
      perform disparar_webhook('documentacion.completa', jsonb_build_object(
        'profile_id', v_uid, 'nombre', v_nombre, 'rol', v_role
      ));
    exception when others then
      null;
    end;
  end if;
end;
$$;

create or replace function crear_licitacion(
  p_titulo text,
  p_descripcion text,
  p_especialidad text,
  p_ubicacion text,
  p_presupuesto numeric,
  p_dias_abierta integer,
  p_requisitos text,
  p_duracion_dias integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_ref text;
  v_intentos integer := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();
  if coalesce(auth_role()::text, '') not in ('promotor', 'constructora') then
    raise exception 'No autorizado';
  end if;

  if p_titulo is null or length(trim(p_titulo)) < 3 then
    raise exception 'Escribe un título para la licitación.';
  end if;
  if length(trim(p_titulo)) > 200 then
    raise exception 'El título es demasiado largo (máximo 200 caracteres).';
  end if;
  if length(coalesce(p_descripcion, '')) > 4000 or length(coalesce(p_requisitos, '')) > 2000 then
    raise exception 'La descripción o los requisitos son demasiado largos.';
  end if;
  if p_presupuesto is null or p_presupuesto <= 0 or p_presupuesto > 999999999 then
    raise exception 'Indica un presupuesto válido (mayor que cero).';
  end if;
  if p_dias_abierta is null or p_dias_abierta < 1 or p_dias_abierta > 90 then
    raise exception 'La licitación debe estar abierta entre 1 y 90 días.';
  end if;
  if p_duracion_dias is not null and (p_duracion_dias <= 0 or p_duracion_dias > 3650) then
    raise exception 'La duración estimada no es válida.';
  end if;

  -- Freno contra abuso: no se pueden acumular licitaciones abiertas sin límite.
  if (select count(*) from obras where creado_por = v_uid and estado = 'abierta') >= 10 then
    raise exception 'Ya tienes 10 licitaciones abiertas. Cierra o cancela alguna antes de publicar otra.';
  end if;

  loop
    v_intentos := v_intentos + 1;
    v_ref := 'LIC-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into obras (
        referencia, titulo, descripcion, especialidad_requerida, ubicacion,
        presupuesto, moneda, puntos_bonus, duracion_dias, plazo_cierre,
        estado, requisitos, creado_por
      ) values (
        v_ref, trim(p_titulo),
        nullif(trim(coalesce(p_descripcion, '')), ''),
        nullif(trim(coalesce(p_especialidad, '')), ''),
        nullif(trim(coalesce(p_ubicacion, '')), ''),
        p_presupuesto, 'EUR', 0, p_duracion_dias,
        now() + make_interval(days => p_dias_abierta),
        'abierta',
        nullif(trim(coalesce(p_requisitos, '')), ''),
        v_uid
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_intentos >= 5 then
        raise;
      end if;
    end;
  end loop;

  -- Aviso a n8n/Odoo: una empresa ha publicado una licitación
  perform disparar_webhook('licitacion.creada', jsonb_build_object(
    'obra_id', v_id, 'referencia', v_ref, 'titulo', trim(p_titulo), 'especialidad', p_especialidad,
    'ubicacion', p_ubicacion, 'presupuesto', p_presupuesto, 'dias_abierta', p_dias_abierta, 'propietario_id', v_uid
  ));

  return v_id;
end;
$$;

create or replace function cambiar_estado_licitacion(p_obra_id uuid, p_nuevo_estado estado_obra)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creador uuid;
  v_actual estado_obra;
  v_titulo text;
  v_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  perform exigir_cuenta_activa();

  select o.creado_por, o.estado, o.titulo into v_creador, v_actual, v_titulo
    from obras o where o.id = p_obra_id for update;
  if v_actual is null then
    raise exception 'Licitación no encontrada';
  end if;
  if v_creador is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_actual = p_nuevo_estado then
    return;
  end if;

  -- Adjudicar se hace aceptando una postulación, no desde aquí.
  if not (
       (v_actual = 'abierta'    and p_nuevo_estado = 'cancelada')
    or (v_actual = 'adjudicada' and p_nuevo_estado in ('en_curso', 'cancelada'))
    or (v_actual = 'en_curso'   and p_nuevo_estado in ('cerrada', 'cancelada'))
  ) then
    raise exception 'No se puede pasar la licitación de % a %.', v_actual, p_nuevo_estado;
  end if;

  if p_nuevo_estado = 'cancelada' then
    -- A las empresas (incluida la adjudicada) les llega el aviso por el disparador.
    update postulaciones
      set estado = 'rechazada', motivo_rechazo = 'El propietario ha cancelado la licitación', updated_at = now()
      where obra_id = p_obra_id and estado in ('enviada', 'en_revision', 'aceptada');
  end if;

  update obras set estado = p_nuevo_estado, updated_at = now() where id = p_obra_id;

  perform disparar_webhook('licitacion.estado', jsonb_build_object(
    'obra_id', p_obra_id, 'titulo', v_titulo, 'estado_anterior', v_actual, 'estado_nuevo', p_nuevo_estado
  ));

  if p_nuevo_estado in ('en_curso', 'cerrada') then
    select p.empresa_id into v_empresa_id
      from postulaciones p where p.obra_id = p_obra_id and p.estado = 'aceptada' limit 1;
    if v_empresa_id is not null then
      perform crear_notificacion(
        v_empresa_id, 'obra_estado',
        case when p_nuevo_estado = 'en_curso' then 'Obra en curso' else 'Obra finalizada' end,
        'La obra «' || coalesce(v_titulo, 'la obra') || '» ha pasado a: '
          || case when p_nuevo_estado = 'en_curso' then 'En curso' else 'Finalizada' end || '.',
        jsonb_build_object('obra_id', p_obra_id)
      );
    end if;
  end if;
end;
