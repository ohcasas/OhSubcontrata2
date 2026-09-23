-- Los subcontratistas NO pueden escribir directamente en
-- club_partner_movimientos ni en empresas_subcontratistas.puntos_disponibles
-- (por diseño: nadie debería poder adjudicarse puntos a sí mismo). Esta
-- función, con security definer, hace el canje de forma controlada:
-- valida que la empresa que llama tiene saldo suficiente, descuenta los
-- puntos, registra el movimiento en el ledger y crea el canje — todo en
-- una sola transacción atómica.

create or replace function solicitar_canje(p_recompensa_id uuid)
returns canjes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_puntos_disponibles integer;
  v_puntos_requeridos integer;
  v_activo boolean;
  v_nombre text;
  v_canje canjes;
begin
  v_empresa_id := auth_empresa_id();
  if v_empresa_id is null then
    raise exception 'El usuario no está vinculado a ninguna empresa';
  end if;

  select puntos_requeridos, activo, nombre
    into v_puntos_requeridos, v_activo, v_nombre
  from recompensas_catalogo
  where id = p_recompensa_id;

  if v_puntos_requeridos is null then
    raise exception 'Recompensa no encontrada';
  end if;
  if not v_activo then
    raise exception 'Esta recompensa ya no está disponible';
  end if;

  select puntos_disponibles into v_puntos_disponibles
  from empresas_subcontratistas
  where id = v_empresa_id
  for update;

  if v_puntos_disponibles < v_puntos_requeridos then
    raise exception 'No tienes suficientes puntos para este canje';
  end if;

  update empresas_subcontratistas
  set puntos_disponibles = puntos_disponibles - v_puntos_requeridos
  where id = v_empresa_id;

  insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto)
  values (v_empresa_id, 'canje', -v_puntos_requeridos, 'Canje: ' || v_nombre);

  insert into canjes (empresa_id, recompensa_id, puntos_gastados, estado)
  values (v_empresa_id, p_recompensa_id, v_puntos_requeridos, 'pendiente')
  returning * into v_canje;

  return v_canje;
end;
$$;

-- El rol "authenticated" es el que usan los usuarios logueados vía la API
-- de Supabase; sin este grant, nadie podría llamar a la función.
grant execute on function solicitar_canje(uuid) to authenticated;
