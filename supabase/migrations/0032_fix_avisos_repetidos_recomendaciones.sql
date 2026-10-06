-- ============================================================================
-- Arreglo: avisos de "Tu recomendación ha avanzado" repetidos
-- ============================================================================
-- actualizar_estado_referencia() (0024) avisaba a la persona en CADA llamada,
-- sin mirar si el estado había cambiado. En el panel de admin cada píldora es
-- pulsable, incluida la que ya está activa: pulsar varias veces la misma, o ir
-- probando estados, mandaba un aviso (con su push) por pulsación, y al repetir
-- "Venta" volvía a decir "se ha generado una comisión" aunque ya existiera.
--
-- Ahora:
--   - Solo se avisa si el estado cambia de verdad, o si en esa llamada se crea
--     una comisión nueva (por ejemplo, si se configura el porcentaje DESPUÉS de
--     marcar la venta y se vuelve a pulsar "Venta").
--   - El texto usa el nombre del estado ("Comisión disponible"), no la clave
--     interna ("comision_disponible"), y un descarte dice "se ha cerrado", no
--     "ha avanzado".
--   - Lo demás (comisión única por referencia, precio obligatorio en "Venta",
--     solo admin) queda exactamente igual.
--
-- Los avisos repetidos que ya se enviaron no se borran solos: ver la consulta
-- opcional del final.

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

revoke execute on function actualizar_estado_referencia(uuid, text, text, uuid, numeric) from public, anon;
grant execute on function actualizar_estado_referencia(uuid, text, text, uuid, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- OPCIONAL — limpiar los avisos repetidos que ya se enviaron (solo de pruebas).
-- No lo ejecutes si ya hay recomendaciones reales: borra TODOS los avisos de
-- este tipo. Primero mira cuántos hay (esta consulta no borra nada):
--   select date_trunc('minute', created_at) as minuto, count(*) as avisos
--   from notificaciones where tipo = 'referencia_actualizada'
--   group by 1 order by 1 desc limit 30;
-- y, si son todos de prueba:
--   delete from notificaciones where tipo = 'referencia_actualizada';
-- ----------------------------------------------------------------------------