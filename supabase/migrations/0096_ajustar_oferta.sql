-- ============================================================================
-- 0096 · Ajustar la oferta de una postulación desde el panel (BORRADOR, no aplicar sin autorización)
-- ============================================================================
-- Para qué sirve
--   Tras una contraoferta (p. ej. la empresa pidió 20 €/m² y se cierra a 19 €/m²), administración puede dejar
--   la oferta final en la postulación. Siempre queda: la oferta ORIGINAL, quién la cambió, cuándo y el motivo.
--
-- Qué hace y qué NO hace
--   · Cambia solo postulaciones.oferta_economica. No cambia el presupuesto de la obra (se edita aparte) ni el estado.
--   · No acepta ni rechaza a nadie: la decisión de contratar sigue siendo manual.
--   · No envía correos ni avisos, no crea tareas programadas y no borra nada.
--   · Solo administración (admin / superadmin) y solo en obras publicadas por empresa (no en peticiones de particulares,
--     donde el cliente ve el precio y lo decide 3B en Peticiones).
--   · Se puede ajustar mientras la postulación esté en «enviada», «en_revision» o «aceptada» y la obra no esté
--     cerrada ni cancelada. Si ya hay un pago de Stripe en marcha, o un pago manual pendiente o pagado, se bloquea:
--     antes habría que anular ese pago.
--   · Si la oferta tiene plan de pagos por tramos, son porcentajes: se reparten solos sobre el nuevo total.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table postulaciones add column if not exists oferta_original numeric(12,2);
alter table postulaciones add column if not exists oferta_ajustada_por uuid references profiles (id) on delete set null;
alter table postulaciones add column if not exists oferta_ajustada_en timestamptz;
alter table postulaciones add column if not exists oferta_ajuste_motivo text;

create table if not exists postulaciones_ofertas_historial (
  id uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones (id) on delete cascade,
  oferta_antes numeric(12,2) not null,
  oferta_despues numeric(12,2) not null,
  motivo text not null check (length(btrim(motivo)) between 5 and 300),
  quien uuid references profiles (id) on delete set null,
  cuando timestamptz not null default now()
);
create index if not exists idx_post_ofertas_hist on postulaciones_ofertas_historial (postulacion_id, cuando desc);

alter table postulaciones_ofertas_historial enable row level security;
drop policy if exists post_ofertas_hist_admin on postulaciones_ofertas_historial;
create policy post_ofertas_hist_admin on postulaciones_ofertas_historial for select to authenticated
  using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));
revoke all on table postulaciones_ofertas_historial from anon, authenticated;
grant select on table postulaciones_ofertas_historial to authenticated;

create or replace function panel_ajustar_oferta(
  p_postulacion_id uuid,
  p_nueva_oferta numeric,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p postulaciones%rowtype;
  v_o obras%rowtype;
  v_nueva numeric(12,2);
  v_bloqueo boolean := false;
begin
  if coalesce(auth_role()::text, '') not in ('admin', 'superadmin') then
    raise exception 'Solo el personal de administración.';
  end if;
  if p_nueva_oferta is null or p_nueva_oferta <= 0 or p_nueva_oferta >= 100000000 then
    raise exception 'La oferta debe ser mayor que cero.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Indica el motivo del ajuste (mínimo 5 letras).';
  end if;
  v_nueva := round(p_nueva_oferta, 2);

  select * into v_p from postulaciones where id = p_postulacion_id for update;
  if not found then raise exception 'La postulación no existe.'; end if;
  select * into v_o from obras where id = v_p.obra_id;

  if v_o.origen = 'particular' then
    raise exception 'Es la petición de un particular: se decide en Peticiones, no aquí.';
  end if;
  if v_o.estado in ('cerrada', 'cancelada') then
    raise exception 'La obra está % : no se puede ajustar la oferta.', v_o.estado;
  end if;
  if v_p.estado not in ('enviada', 'en_revision', 'aceptada') then
    raise exception 'Solo se puede ajustar una oferta enviada, en revisión o aceptada (estado actual: %).', v_p.estado;
  end if;
  if v_nueva = v_p.oferta_economica then
    raise exception 'La oferta ya es de %.', v_nueva;
  end if;

  -- Con dinero ya en marcha no se toca: antes hay que anular el pago
  if exists (select 1 from pagos where obra_id = v_p.obra_id and estado not in ('fallido', 'cancelado', 'reembolsado')) then
    v_bloqueo := true;
  end if;
  if not v_bloqueo and to_regclass('public.pagos_manuales') is not null then
    execute 'select exists (select 1 from pagos_manuales where obra_id = $1 and estado in (''pendiente'', ''pagado''))'
      into v_bloqueo using v_p.obra_id;
  end if;
  if v_bloqueo then
    raise exception 'Esta obra ya tiene un pago en marcha o registrado. Anúlalo antes de cambiar la oferta.';
  end if;

  insert into postulaciones_ofertas_historial (postulacion_id, oferta_antes, oferta_despues, motivo, quien)
  values (v_p.id, v_p.oferta_economica, v_nueva, btrim(p_motivo), auth.uid());

  update postulaciones
     set oferta_original = coalesce(oferta_original, oferta_economica),
         oferta_economica = v_nueva,
         oferta_ajustada_por = auth.uid(),
         oferta_ajustada_en = now(),
         oferta_ajuste_motivo = left(btrim(p_motivo), 300)
   where id = v_p.id;

  return jsonb_build_object(
    'antes', v_p.oferta_economica, 'despues', v_nueva, 'm2', v_o.m2,
    'precio_m2', case when coalesce(v_o.m2, 0) > 0 then round(v_nueva / v_o.m2, 2) end);
end;
$$;
revoke all on function panel_ajustar_oferta(uuid, numeric, text) from public, anon;
grant execute on function panel_ajustar_oferta(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Comprobación (solo lectura):  select count(*) from postulaciones_ofertas_historial;   -- 0 al principio
-- ROLLBACK (perderías el historial de ajustes; las ofertas ya cambiadas se quedan como están):
--   drop function if exists panel_ajustar_oferta(uuid, numeric, text);
--   drop table if exists postulaciones_ofertas_historial;
--   alter table postulaciones drop column if exists oferta_original, drop column if exists oferta_ajustada_por,
--     drop column if exists oferta_ajustada_en, drop column if exists oferta_ajuste_motivo;
-- ---------------------------------------------------------------------------