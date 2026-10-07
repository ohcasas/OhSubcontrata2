-- ============================================================================
-- Recomendaciones: historial de cambios de estado y comisión que no se puede deshacer
-- ============================================================================
-- Contexto: llegaron avisos de "Tu recomendación ha avanzado" que parecían ocurrir solos
-- (Enviado -> Contactado -> Presupuesto enviado -> Contactado, en el mismo minuto). El
-- único camino que cambia un estado es actualizar_estado_referencia(), que exige sesión
-- de admin y que solo lanza la pantalla de Recomendaciones del panel al tocar una
-- píldora; no hay tareas programadas ni automatismos. Pero hasta ahora:
--   - un solo toque en una píldora cambiaba el estado y avisaba al cliente, sin confirmar
--   - no quedaba constancia de quién lo había cambiado ni cuándo
--   - se podía volver atrás con la comisión ya generada y pagada (se vio una
--     recomendación en "Visita" con su comisión pagada)
--
-- Esta migración:
--   1) guarda cada cambio de estado en referencias_historial (de cuál a cuál, quién, cuándo);
--      solo lo pueden leer los admin
--   2) impide mover una recomendación a un estado anterior (o descartarla) cuando ya
--      tiene comisión: solo 'venta' o 'comision_disponible'
-- La confirmación antes de cambiar y la línea "Último cambio" son de la app.
--
-- Se puede ejecutar más de una vez sin problema.

create table if not exists referencias_historial (
  id uuid primary key default uuid_generate_v4(),
  referencia_id uuid not null references referencias_comerciales (id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  cambiado_por uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_referencias_historial on referencias_historial (referencia_id, created_at desc);
alter table referencias_historial enable row level security;
drop policy if exists referencias_historial_select on referencias_historial;
create policy referencias_historial_select on referencias_historial
  for select using (auth_role() in ('admin', 'superadmin'));
-- Sin políticas de insertar ni editar: solo escribe actualizar_estado_referencia()

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
-- PARA DIAGNOSTICAR (no cambian nada). Las horas de Supabase salen en UTC: en octubre,
-- las 13:02 de Madrid son las 11:02 UTC.
--
-- ¿Cuándo se crearon de verdad los avisos? (si es mucho antes de la hora a la que
-- sonaron en el móvil, el móvil los recibió tarde):
--   select created_at, titulo, cuerpo from notificaciones
--   where tipo = 'referencia_actualizada' order by created_at desc limit 20;
--
-- ¿Quién cambió cada estado y cuándo? (solo hay datos desde que se ejecuta esta migración):
--   select h.created_at, r.nombre_cliente, h.estado_anterior, h.estado_nuevo, p.nombre_completo, p.email
--   from referencias_historial h
--   join referencias_comerciales r on r.id = h.referencia_id
--   left join profiles p on p.id = h.cambiado_por
--   order by h.created_at desc limit 30;
-- ----------------------------------------------------------------------------