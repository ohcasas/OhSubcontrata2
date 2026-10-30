-- 0066 · Chat de mensajes privados (texto, fotos y audios)
-- · Cualquier cuenta VERIFICADA puede escribir a cualquier otra cuenta verificada (1 a 1).
-- · Cada usuario tiene un chat con "Administración 3B Conecta" (soporte): lo atiende todo el equipo.
--   El equipo puede abrir ese chat con CUALQUIER usuario registrado, aunque su cuenta aún esté pendiente.
-- · Los chats privados entre usuarios NO los lee el equipo; solo ve el mensaje que un usuario denuncia.
-- · Respeta los bloqueos de 0064 y las denuncias (nuevo tipo: 'mensaje').
-- · Las fotos y los audios van a un almacén privado (chat-archivos); la app los pide con enlaces temporales.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists chat_conversaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('privado', 'soporte')),
  usuario_a uuid not null references profiles (id) on delete cascade,   -- en 'soporte': el usuario
  usuario_b uuid references profiles (id) on delete cascade,            -- en 'soporte': null (lo atiende el equipo)
  ultimo_texto text,
  ultimo_at timestamptz not null default now(),
  equipo_leido_hasta timestamptz,                                      -- solo 'soporte': hasta cuándo ha leído el equipo
  created_at timestamptz not null default now(),
  check ((tipo = 'privado' and usuario_b is not null and usuario_a <> usuario_b) or (tipo = 'soporte' and usuario_b is null))
);
create unique index if not exists uq_chat_privado on chat_conversaciones (least(usuario_a, usuario_b), greatest(usuario_a, usuario_b)) where tipo = 'privado';
create unique index if not exists uq_chat_soporte on chat_conversaciones (usuario_a) where tipo = 'soporte';
create index if not exists idx_chat_conv_a on chat_conversaciones (usuario_a, ultimo_at desc);
create index if not exists idx_chat_conv_b on chat_conversaciones (usuario_b, ultimo_at desc);

create table if not exists chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references chat_conversaciones (id) on delete cascade,
  emisor_id uuid references profiles (id) on delete set null,          -- null = mensaje automático de Administración
  tipo text not null check (tipo in ('texto', 'imagen', 'audio')),
  texto text check (texto is null or char_length(texto) <= 4000),
  archivo_path text,
  duracion_seg integer check (duracion_seg is null or duracion_seg between 1 and 300),
  created_at timestamptz not null default now(),
  check ((tipo = 'texto' and texto is not null and btrim(texto) <> '') or (tipo <> 'texto' and archivo_path is not null))
);
create index if not exists idx_chat_msg_conv on chat_mensajes (conversacion_id, created_at desc);

create table if not exists chat_lecturas (
  conversacion_id uuid not null references chat_conversaciones (id) on delete cascade,
  usuario_id uuid not null references profiles (id) on delete cascade,
  leido_hasta timestamptz not null default now(),
  primary key (conversacion_id, usuario_id)
);

alter table chat_conversaciones enable row level security;
alter table chat_mensajes enable row level security;
alter table chat_lecturas enable row level security;
revoke all on chat_conversaciones, chat_mensajes, chat_lecturas from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------
create or replace function chat_es_equipo(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_id is not null and exists (select 1 from profiles where id = p_id and role::text in ('admin', 'superadmin'));
$$;

create or replace function chat_bloqueo_entre(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bloqueos_usuario
     where (bloqueador_id = p_a and bloqueado_id = p_b) or (bloqueador_id = p_b and bloqueado_id = p_a)
  );
$$;

create or replace function chat_participa(p_conv uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null and exists (
    select 1 from chat_conversaciones c
     where c.id = p_conv
       and (c.usuario_a = p_uid or c.usuario_b = p_uid or (c.tipo = 'soporte' and chat_es_equipo(p_uid)))
  );
$$;

create or replace function chat_participa_ruta(p_ruta text, p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text := split_part(p_ruta, '/', 1);
begin
  if v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return chat_participa(v::uuid, p_uid);
end;
$$;

create or replace function chat_nombre(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(e.nombre, ''), nullif(p.nombre_completo, ''), 'Usuario')
    from profiles p left join empresas_subcontratistas e on e.id = p.empresa_id
   where p.id = p_id;
$$;

-- Lectura (solo de lo propio): lo necesitan los avisos en tiempo real de la app.
drop policy if exists chat_conv_leer on chat_conversaciones;
create policy chat_conv_leer on chat_conversaciones for select to authenticated
  using (chat_participa(id, auth.uid()));
drop policy if exists chat_msg_leer on chat_mensajes;
create policy chat_msg_leer on chat_mensajes for select to authenticated
  using (chat_participa(conversacion_id, auth.uid()) and not (emisor_id is not null and chat_bloqueo_entre(auth.uid(), emisor_id)));
grant select on chat_conversaciones, chat_mensajes to authenticated;

-- ---------------------------------------------------------------------------
-- Almacén privado para fotos y audios: carpeta = id de la conversación
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('chat-archivos', 'chat-archivos', false)
on conflict (id) do update set public = false;

drop policy if exists chat_archivos_leer on storage.objects;
create policy chat_archivos_leer on storage.objects for select to authenticated
  using (bucket_id = 'chat-archivos' and public.chat_participa_ruta(name, auth.uid()));
drop policy if exists chat_archivos_subir on storage.objects;
create policy chat_archivos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-archivos' and public.chat_participa_ruta(name, auth.uid()));

-- Mensajes nuevos al instante en la app (Supabase Realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_mensajes') then
    alter publication supabase_realtime add table chat_mensajes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funciones de la app
-- ---------------------------------------------------------------------------
-- Chat propio con Administración (se crea al primer uso, con un mensaje de bienvenida).
create or replace function chat_soporte_propio()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select id into v_id from chat_conversaciones where tipo = 'soporte' and usuario_a = v_uid;
  if v_id is null then
    insert into chat_conversaciones (tipo, usuario_a, ultimo_texto) values ('soporte', v_uid, 'Te damos la bienvenida a 3B Conecta.')
    on conflict do nothing returning id into v_id;
    if v_id is null then select id into v_id from chat_conversaciones where tipo = 'soporte' and usuario_a = v_uid; end if;
    insert into chat_mensajes (conversacion_id, emisor_id, tipo, texto)
    values (v_id, null, 'texto', 'Te damos la bienvenida a 3B Conecta. Si tienes cualquier duda sobre la app, tu cuenta o una obra, escríbenos por aquí.');
  end if;
  return v_id;
end;
$$;

-- Abre (o crea) la conversación con otra cuenta y devuelve su id.
create or replace function chat_abrir(p_usuario_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_estado text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_usuario_id is null or p_usuario_id = v_uid then raise exception 'Elige a otra persona.'; end if;
  select estado_cuenta into v_estado from profiles where id = p_usuario_id;
  if not found then raise exception 'Ese usuario no existe.'; end if;

  -- Hablar con el equipo = chat de Administración
  if chat_es_equipo(p_usuario_id) then return chat_soporte_propio(); end if;

  -- El equipo abre el chat de Administración con cualquier usuario registrado
  if chat_es_equipo(v_uid) then
    select id into v_id from chat_conversaciones where tipo = 'soporte' and usuario_a = p_usuario_id;
    if v_id is null then
      insert into chat_conversaciones (tipo, usuario_a, ultimo_texto) values ('soporte', p_usuario_id, null)
      on conflict do nothing returning id into v_id;
      if v_id is null then select id into v_id from chat_conversaciones where tipo = 'soporte' and usuario_a = p_usuario_id; end if;
    end if;
    return v_id;
  end if;

  if not cuenta_verificada(v_uid) then raise exception 'Tu cuenta aún no está verificada. Podrás escribir a otros usuarios cuando lo esté.'; end if;
  if v_estado <> 'verificada' then raise exception 'Esa persona todavía no puede recibir mensajes.'; end if;
  if chat_bloqueo_entre(v_uid, p_usuario_id) then raise exception 'No puedes escribir a este usuario.'; end if;

  select id into v_id from chat_conversaciones
   where tipo = 'privado' and least(usuario_a, usuario_b) = least(v_uid, p_usuario_id) and greatest(usuario_a, usuario_b) = greatest(v_uid, p_usuario_id);
  if v_id is null then
    insert into chat_conversaciones (tipo, usuario_a, usuario_b) values ('privado', v_uid, p_usuario_id)
    on conflict do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from chat_conversaciones
       where tipo = 'privado' and least(usuario_a, usuario_b) = least(v_uid, p_usuario_id) and greatest(usuario_a, usuario_b) = greatest(v_uid, p_usuario_id);
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function chat_enviar(p_conv uuid, p_tipo text, p_texto text default null, p_archivo_path text default null, p_duracion integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c chat_conversaciones;
  v_id uuid;
  v_otro uuid;
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_resumen text;
  v_titulo text;
  v_equipo boolean;
  r record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into c from chat_conversaciones where id = p_conv;
  if not found or not chat_participa(p_conv, v_uid) then raise exception 'Esa conversación no existe.'; end if;
  if p_tipo not in ('texto', 'imagen', 'audio') then raise exception 'Tipo de mensaje no válido.'; end if;
  if p_tipo = 'texto' and v_texto is null then raise exception 'Escribe un mensaje.'; end if;
  if p_tipo <> 'texto' and (p_archivo_path is null or p_archivo_path not like p_conv::text || '/%') then raise exception 'Archivo no válido.'; end if;
  if p_tipo = 'audio' and (p_duracion is null or p_duracion < 1 or p_duracion > 300) then raise exception 'El audio puede durar hasta 5 minutos.'; end if;

  v_equipo := chat_es_equipo(v_uid);
  if c.tipo = 'privado' then
    v_otro := case when c.usuario_a = v_uid then c.usuario_b else c.usuario_a end;
    if chat_bloqueo_entre(v_uid, v_otro) then raise exception 'No puedes escribir a este usuario.'; end if;
    if not v_equipo and not cuenta_verificada(v_uid) then raise exception 'Tu cuenta aún no está verificada.'; end if;
  end if;
  if (select count(*) from chat_mensajes where emisor_id = v_uid and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Estás enviando demasiados mensajes. Espera un momento.';
  end if;

  insert into chat_mensajes (conversacion_id, emisor_id, tipo, texto, archivo_path, duracion_seg)
  values (p_conv, v_uid, p_tipo, case when p_tipo = 'texto' then v_texto else null end, case when p_tipo = 'texto' then null else p_archivo_path end,
          case when p_tipo = 'audio' then p_duracion else null end)
  returning id into v_id;

  v_resumen := case p_tipo when 'texto' then left(v_texto, 80) when 'imagen' then 'Foto' else 'Mensaje de voz' end;
  update chat_conversaciones set ultimo_texto = v_resumen, ultimo_at = now() where id = p_conv;
  if c.tipo = 'soporte' and v_equipo then
    update chat_conversaciones set equipo_leido_hasta = now() where id = p_conv;
  else
    insert into chat_lecturas (conversacion_id, usuario_id, leido_hasta) values (p_conv, v_uid, now())
    on conflict (conversacion_id, usuario_id) do update set leido_hasta = excluded.leido_hasta;
  end if;

  -- Aviso en el móvil (si falla, el mensaje se queda enviado igualmente)
  begin
    if c.tipo = 'privado' then
      perform enviar_push(v_otro, chat_nombre(v_uid), v_resumen, jsonb_build_object('tipo', 'chat', 'conversacion_id', p_conv));
    elsif v_equipo then
      perform enviar_push(c.usuario_a, 'Administración 3B Conecta', v_resumen, jsonb_build_object('tipo', 'chat', 'conversacion_id', p_conv));
    else
      v_titulo := chat_nombre(v_uid);
      for r in select id from profiles where role::text in ('admin', 'superadmin') limit 10 loop
        perform enviar_push(r.id, v_titulo, v_resumen, jsonb_build_object('tipo', 'chat', 'conversacion_id', p_conv));
      end loop;
    end if;
  exception when others then
    null;
  end;
  return v_id;
end;
$$;

create or replace function chat_mis_conversaciones()
returns table (id uuid, tipo text, otro_id uuid, nombre text, ultimo_texto text, ultimo_at timestamptz, no_leidos bigint)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_equipo boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_equipo := chat_es_equipo(v_uid);
  if not v_equipo then perform chat_soporte_propio(); end if;

  return query
  select c.id, c.tipo,
         case when c.tipo = 'soporte' then (case when v_equipo then c.usuario_a else null end)
              else (case when c.usuario_a = v_uid then c.usuario_b else c.usuario_a end) end,
         case when c.tipo = 'soporte' and not v_equipo then 'Administración 3B Conecta'
              when c.tipo = 'soporte' then chat_nombre(c.usuario_a)
              else chat_nombre(case when c.usuario_a = v_uid then c.usuario_b else c.usuario_a end) end,
         c.ultimo_texto, c.ultimo_at,
         (select count(*) from chat_mensajes m
           where m.conversacion_id = c.id
             and m.created_at > coalesce(
                   case when c.tipo = 'soporte' and v_equipo then c.equipo_leido_hasta
                        else (select l.leido_hasta from chat_lecturas l where l.conversacion_id = c.id and l.usuario_id = v_uid) end,
                   '-infinity'::timestamptz)
             and case when c.tipo = 'soporte' and v_equipo then m.emisor_id = c.usuario_a
                      else m.emisor_id is distinct from v_uid end)
    from chat_conversaciones c
   where case
           when c.tipo = 'soporte' and v_equipo then exists (select 1 from chat_mensajes m where m.conversacion_id = c.id and m.emisor_id is not null)
           when c.tipo = 'soporte' then c.usuario_a = v_uid
           else (c.usuario_a = v_uid or c.usuario_b = v_uid)
                and not chat_bloqueo_entre(v_uid, case when c.usuario_a = v_uid then c.usuario_b else c.usuario_a end)
         end
   order by (c.tipo = 'soporte' and not v_equipo) desc, c.ultimo_at desc;
end;
$$;

create or replace function chat_marcar_leido(p_conv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c chat_conversaciones;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into c from chat_conversaciones where id = p_conv;
  if not found or not chat_participa(p_conv, v_uid) then return; end if;
  if c.tipo = 'soporte' and chat_es_equipo(v_uid) then
    update chat_conversaciones set equipo_leido_hasta = now() where id = p_conv;
  else
    insert into chat_lecturas (conversacion_id, usuario_id, leido_hasta) values (p_conv, v_uid, now())
    on conflict (conversacion_id, usuario_id) do update set leido_hasta = excluded.leido_hasta;
  end if;
end;
$$;

create or replace function chat_no_leidos()
returns integer language sql security definer set search_path = public as $$
  select coalesce(sum(no_leidos), 0)::integer from chat_mis_conversaciones();
$$;

-- Buscador de personas para empezar un chat
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
       and (v_equipo or p.estado_cuenta = 'verificada')
       and not chat_bloqueo_entre(v_uid, p.id)
       and (p_buscar is null or btrim(p_buscar) = '' or chat_nombre(p.id) ilike '%' || btrim(p_buscar) || '%')
     order by chat_nombre(p.id)
     limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$$;

revoke all on function chat_es_equipo(uuid), chat_bloqueo_entre(uuid, uuid), chat_participa(uuid, uuid), chat_participa_ruta(text, uuid), chat_nombre(uuid),
  chat_soporte_propio(), chat_abrir(uuid), chat_enviar(uuid, text, text, text, integer), chat_mis_conversaciones(), chat_marcar_leido(uuid),
  chat_no_leidos(), chat_usuarios(text, integer) from public, anon;
grant execute on function chat_participa(uuid, uuid), chat_participa_ruta(text, uuid), chat_bloqueo_entre(uuid, uuid), chat_es_equipo(uuid),
  chat_soporte_propio(), chat_abrir(uuid), chat_enviar(uuid, text, text, text, integer), chat_mis_conversaciones(), chat_marcar_leido(uuid),
  chat_no_leidos(), chat_usuarios(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Denunciar un mensaje: se amplía el sistema de denuncias de 0064 (tipo 'mensaje')
-- ---------------------------------------------------------------------------
alter table reportes_contenido drop constraint if exists reportes_contenido_tipo_check;
alter table reportes_contenido add constraint reportes_contenido_tipo_check
  check (tipo in ('publicacion_tablon', 'ficha_directorio', 'obra', 'usuario', 'mensaje'));

do $$
declare
  d text;
  n text;
begin
  -- app_reportar
  d := pg_get_functiondef('app_reportar(text, uuid, text, text)'::regprocedure);
  n := replace(d, $x$if p_tipo not in ('publicacion_tablon', 'ficha_directorio', 'obra', 'usuario') then$x$,
                  $x$if p_tipo not in ('publicacion_tablon', 'ficha_directorio', 'obra', 'usuario', 'mensaje') then$x$);
  n := replace(n, $x$  elsif p_tipo = 'obra' then$x$,
$x$  elsif p_tipo = 'mensaje' then
    select emisor_id into v_denunciado from chat_mensajes where id = p_objeto_id and chat_participa(conversacion_id, v_uid);
    v_existe := found and v_denunciado is not null;
  elsif p_tipo = 'obra' then$x$);
  if n = d or position('''mensaje''' in n) = 0 then raise exception 'No se pudo actualizar app_reportar'; end if;
  execute n;

  -- panel_reportes
  d := pg_get_functiondef('panel_reportes(text)'::regprocedure);
  n := replace(d, $x$when 'obra' then (select o.titulo from obras o where o.id = r.objeto_id)$x$,
$x$when 'obra' then (select o.titulo from obras o where o.id = r.objeto_id)
             when 'mensaje' then (select coalesce(m.texto, case m.tipo when 'imagen' then 'Foto' else 'Mensaje de voz' end) from chat_mensajes m where m.id = r.objeto_id)$x$);
  if n = d then raise exception 'No se pudo actualizar panel_reportes'; end if;
  execute n;

  -- panel_resolver_reporte
  d := pg_get_functiondef('panel_resolver_reporte(uuid, text, text)'::regprocedure);
  n := replace(d, $x$      delete from fichas_directorio where profile_id = r.objeto_id;$x$,
$x$      delete from fichas_directorio where profile_id = r.objeto_id;
    elsif r.tipo = 'mensaje' then
      delete from chat_mensajes where id = r.objeto_id;$x$);
  if n = d then raise exception 'No se pudo actualizar panel_resolver_reporte'; end if;
  execute n;
end $$;