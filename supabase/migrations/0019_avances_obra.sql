-- ============================================================================
-- Avances de obra (progreso semanal)
-- ============================================================================
-- La empresa adjudicataria de una obra en curso puede registrar, semana a
-- semana, lo que ha hecho. Tanto ella como el admin pueden ver el
-- historial completo. Cada registro dispara el webhook 'avance.registrado'
-- (ver 0018_webhooks_n8n.sql) para poder automatizarlo con n8n más adelante.

create table if not exists avances_obra (
  id uuid primary key default uuid_generate_v4(),
  obra_id uuid not null references obras (id) on delete cascade,
  empresa_id uuid not null references empresas_subcontratistas (id) on delete cascade,
  usuario_id uuid references profiles (id),
  descripcion text not null,
  porcentaje_avance integer,
  created_at timestamptz not null default now(),
  constraint avances_obra_porcentaje_valido check (
    porcentaje_avance is null or (porcentaje_avance >= 0 and porcentaje_avance <= 100)
  )
);

comment on table avances_obra is
  'Registro semanal de progreso de una obra en curso, hecho por la empresa adjudicataria. Admin y la propia empresa lo ven; cada alta dispara el webhook avance.registrado.';

create index if not exists idx_avances_obra_obra on avances_obra (obra_id, created_at desc);

alter table avances_obra enable row level security;

-- Solo lectura por política: empresa adjudicataria (la suya) o admin. El
-- alta se hace siempre a través de registrar_avance_obra(), que valida las
-- reglas de negocio (obra en curso, empresa adjudicataria) — no hay
-- política de insert, igual que con canjes.
drop policy if exists avances_obra_select on avances_obra;
create policy avances_obra_select on avances_obra
  for select using (empresa_id = auth_empresa_id() or auth_role() in ('admin', 'superadmin'));

create or replace function registrar_avance_obra(
  p_obra_id uuid,
  p_descripcion text,
  p_porcentaje_avance integer default null
)
returns avances_obra
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_estado estado_obra;
  v_titulo text;
  v_avance avances_obra;
begin
  v_empresa_id := auth_empresa_id();
  if v_empresa_id is null then
    raise exception 'El usuario no está vinculado a ninguna empresa';
  end if;

  select estado, titulo into v_estado, v_titulo from obras where id = p_obra_id;
  if v_estado is null then
    raise exception 'Obra no encontrada';
  end if;
  if v_estado <> 'en_curso' then
    raise exception 'Solo se puede registrar progreso en una obra que esté en curso';
  end if;

  if not exists (
    select 1 from postulaciones
    where obra_id = p_obra_id and empresa_id = v_empresa_id and estado = 'aceptada'
  ) then
    raise exception 'Tu empresa no es la adjudicataria de esta obra';
  end if;

  if trim(coalesce(p_descripcion, '')) = '' then
    raise exception 'Describe brevemente lo que se ha hecho';
  end if;
  if p_porcentaje_avance is not null and (p_porcentaje_avance < 0 or p_porcentaje_avance > 100) then
    raise exception 'El porcentaje debe estar entre 0 y 100';
  end if;

  insert into avances_obra (obra_id, empresa_id, usuario_id, descripcion, porcentaje_avance)
  values (p_obra_id, v_empresa_id, auth.uid(), trim(p_descripcion), p_porcentaje_avance)
  returning * into v_avance;

  perform disparar_webhook('avance.registrado', jsonb_build_object(
    'avance_id', v_avance.id,
    'obra_id', p_obra_id,
    'obra_titulo', v_titulo,
    'empresa_id', v_empresa_id,
    'descripcion', v_avance.descripcion,
    'porcentaje_avance', p_porcentaje_avance,
    'fecha', v_avance.created_at
  ));

  return v_avance;
end;
$$;

grant execute on function registrar_avance_obra(uuid, text, integer) to authenticated;