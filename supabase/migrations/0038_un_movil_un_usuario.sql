-- ============================================================================
-- Un móvil, un usuario: los avisos dejan de llegar a quien ya no es el dueño del móvil
-- ============================================================================
-- Problema: push_tokens guardaba una fila por (usuario, móvil) y nada la quitaba nunca. Al
-- iniciar sesión con otra cuenta en el mismo móvil, la anterior seguía con su token. Efectos:
--   - los avisos de CUALQUIER cuenta con la que se hubiera entrado alguna vez en ese móvil
--     seguían llegándole, aunque hubiera otra sesión abierta (o ninguna)
--   - si dos cuentas de la misma empresa compartían móvil, un solo evento sonaba varias veces
--   - en un móvil compartido o prestado, la siguiente persona veía los avisos de la anterior
--
-- Ahora un token pertenece SIEMPRE a un único usuario: al guardarse (o cambiar) un token, se
-- borra de cualquier otro usuario. Funciona también con versiones antiguas de la app, porque
-- lo impone la base de datos y no la app. Esta migración, además, limpia los duplicados que ya
-- hay: cada token se queda solo con quien lo registró la última vez.
--
-- La app, por su parte, ahora también borra el token del usuario al cerrar sesión (si no, el
-- móvil seguiría recibiendo sus avisos sin sesión iniciada).
--
-- Se puede ejecutar más de una vez sin problema.

-- Limpieza de lo que ya hay: de cada token, solo la fila más reciente
delete from push_tokens a
using push_tokens b
where a.token = b.token
  and a.id <> b.id
  and (a.updated_at, a.created_at, a.id) < (b.updated_at, b.created_at, b.id);

create or replace function push_token_unico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from push_tokens where token = new.token and user_id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_push_token_unico on push_tokens;
create trigger trg_push_token_unico
  before insert or update of token, user_id on push_tokens
  for each row execute function push_token_unico();

-- ----------------------------------------------------------------------------
-- PARA DIAGNOSTICAR (no cambian nada):
--
-- ¿Hay móviles repetidos entre cuentas? (antes de esta migración, casi seguro)
--   select right(t.token, 8) as token_termina_en, count(*) as cuentas,
--          string_agg(p.email, ', ') as cuentas_con_este_movil
--   from push_tokens t join profiles p on p.id = t.user_id
--   group by t.token having count(*) > 1;
--
-- ¿Cuántos móviles tiene registrados cada cuenta? (más de uno puede ser normal: móvil y tablet,
-- o una reinstalación que dejó un token viejo)
--   select p.email, count(*) as moviles, max(t.updated_at) as ultimo_uso
--   from push_tokens t join profiles p on p.id = t.user_id
--   group by p.email order by moviles desc;
-- ----------------------------------------------------------------------------