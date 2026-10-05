-- ============================================================================
-- Eliminar cuenta: ahora para TODOS los perfiles que se registran solos
-- ============================================================================
-- Hasta ahora eliminar_mi_cuenta() (0021) solo dejaba a los 'subcontratista'.
-- Con OH Conecta hay 8 tipos de cuenta que se registran por su cuenta
-- (subcontratista, referidor, promotor, constructora, arquitecto, proveedor,
-- profesional, administrador) y Google Play exige que todos puedan borrarse.
-- Siguen sin poder 'admin' ni 'superadmin' (personal de OH): esas se dan de
-- baja a mano en Supabase, por el mismo motivo de siempre (no quedarse sin
-- acceso al panel por un toque accidental).
--
-- Dos cosas más que había que resolver para que el borrado no fallara:
--  1) referencias_comerciales y recompensas_referido apuntaban a
--     profiles(id) sin ON DELETE: quien hubiera recomendado a alguien NO
--     podía borrarse (error de clave foránea). Ahora, al borrarse la
--     persona, esos registros SE QUEDAN (son datos comerciales de OH) pero
--     dejan de señalar a quién los hizo.
--  2) Una comisión pendiente o aceptada pero aún sin cobrar es dinero que
--     OH le debe a esa persona; si se borrara la cuenta, nadie sabría a
--     quién pagarla. Por eso, mientras tenga alguna, el borrado se bloquea
--     con un mensaje claro y tiene que hablarlo con OH primero.

alter table referencias_comerciales alter column referidor_id drop not null;
alter table referencias_comerciales drop constraint if exists referencias_comerciales_referidor_id_fkey;
alter table referencias_comerciales add constraint referencias_comerciales_referidor_id_fkey
  foreign key (referidor_id) references profiles (id) on delete set null;

alter table recompensas_referido alter column referidor_id drop not null;
alter table recompensas_referido drop constraint if exists recompensas_referido_referidor_id_fkey;
alter table recompensas_referido add constraint recompensas_referido_referidor_id_fkey
  foreign key (referidor_id) references profiles (id) on delete set null;

create or replace function eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select role into v_role from profiles where id = v_uid;
  if v_role is null or v_role in ('admin', 'superadmin') then
    raise exception 'Esta función solo está disponible para cuentas de usuario. Para dar de baja una cuenta de administración de OH, hazlo directamente desde Supabase.';
  end if;

  if exists (
    select 1 from recompensas_referido
    where referidor_id = v_uid and estado in ('pendiente', 'aceptada')
  ) then
    raise exception 'Tienes comisiones pendientes de cobro. Escribe a software@ohcasas.es antes de eliminar tu cuenta.';
  end if;

  delete from notificaciones where user_id = v_uid;
  delete from push_tokens where user_id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function eliminar_mi_cuenta() from public, anon;
grant execute on function eliminar_mi_cuenta() to authenticated;