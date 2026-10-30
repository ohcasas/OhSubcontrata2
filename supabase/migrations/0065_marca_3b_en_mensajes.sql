-- Quita los restos de la marca antigua "OH" en los textos que genera la base de datos
-- (notificaciones de puntos, suspensión, borrado de cuenta...). Reescribe el cuerpo de
-- las funciones que los contienen. Es idempotente: si ya no queda nada, no hace nada.
do $$
declare
  f record;
  def text;
  nuevo text;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (p.prosrc like '%software@ohcasas.es%'
        or p.prosrc like '%Club OH%'
        or p.prosrc like '%OH Conecta%')
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := replace(def, 'software@ohcasas.es', 'soporte@3bconecta.com');
    nuevo := replace(nuevo, 'Club OH Partner', 'Club 3B Partner');
    nuevo := replace(nuevo, 'Club OH', 'Club 3B');
    nuevo := replace(nuevo, 'OH Conecta', '3B Conecta');
    if nuevo <> def then
      execute nuevo;
    end if;
  end loop;
end $$;