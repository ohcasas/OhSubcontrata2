-- 0068 · El buscador del chat ("Escribir a alguien")
-- · Las cuentas marcadas como de prueba no aparecen para nadie salvo el equipo de 3B.
-- · Los particulares, los técnicos y los referidores no aparecen en el buscador: son personas o equipo interno,
--   no empresas de la red. Siguen pudiendo escribir a las empresas, y el equipo de 3B puede abrir un chat con cualquiera.

alter table profiles add column if not exists cuenta_de_prueba boolean not null default false;
comment on column profiles.cuenta_de_prueba is 'true = cuenta de pruebas: no sale en el buscador del chat para los usuarios.';

create or replace function chat_usuarios(p_buscar text default null, p_limite integer default 50)
returns table (id uuid, nombre text, rol text, estado_cuenta text)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_equipo boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_equipo := chat_es_equipo(v_uid);
  if not v_equipo and not cuenta_verificada(v_uid) then raise exception 'Tu cuenta aún no está verificada.'; end if;
  return query
    select p.id, chat_nombre(p.id), p.role::text, p.estado_cuenta
      from profiles p
     where p.id <> v_uid
       and not chat_es_equipo(p.id)
       and (v_equipo or (p.estado_cuenta = 'verificada'
                         and not p.cuenta_de_prueba
                         and p.role::text not in ('particular', 'tecnico', 'referidor')))
       and not chat_bloqueo_entre(v_uid, p.id)
       and (p_buscar is null or btrim(p_buscar) = '' or chat_nombre(p.id) ilike '%' || btrim(p_buscar) || '%')
     order by chat_nombre(p.id)
     limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$$;
revoke all on function chat_usuarios(text, integer) from public, anon;
grant execute on function chat_usuarios(text, integer) to authenticated;