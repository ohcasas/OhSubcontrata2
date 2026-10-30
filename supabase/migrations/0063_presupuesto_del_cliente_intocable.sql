-- 0063 · El presupuesto de una obra de un particular lo indica el cliente y nadie más lo cambia.
-- 3B solo transcribe el que le dicen (en las obras que publica a mano) y lo muestra tal cual.
-- Las obras que llegan por «petición de un particular» (origen = 'particular') quedan protegidas:
-- ni el panel ni otro proceso pueden modificar su presupuesto una vez creadas.

create or replace function obras_presupuesto_particular_fijo()
returns trigger
language plpgsql
as $$
begin
  if old.origen = 'particular'
     and new.presupuesto is distinct from old.presupuesto
     and coalesce(current_setting('app.permitir_cambio_presupuesto', true), '') <> 'on' then
    raise exception 'El presupuesto de esta obra lo indicó el cliente y no se puede cambiar.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_obras_presupuesto_particular_fijo on obras;
create trigger trg_obras_presupuesto_particular_fijo
  before update of presupuesto on obras
  for each row execute function obras_presupuesto_particular_fijo();
  