-- ============================================================================
-- 0086 · Avisos a administración: cuenta nueva, petición nueva y documento subido
-- ============================================================================
-- REQUISITO: 0018 (webhooks n8n), 0020 (push) y 0036 (documentos de cuenta).
--
-- Qué hace
--   Cuando ocurre algo que requiere tu revisión, avisa a las cuentas de administración (admin y superadmin):
--     · se registra una cuenta nueva (queda pendiente de verificar),
--     · un particular envía una petición de obra nueva,
--     · alguien sube un documento a revisar.
--   El aviso llega: a la campana del panel, al móvil (push de la app 3B Conecta, si has entrado en ella con tu usuario
--   de administración) y, si lo configuras, a n8n (evento 'panel.aviso') para mandarlo por Telegram u otro canal.
--
-- Protección de datos
--   · Solo se avisa a administración. Ninguna empresa ni particular recibe nada con esto.
--   · A n8n NO se envían nombres, correos ni teléfonos: solo el tipo de aviso, un texto genérico y el enlace al panel.
--     Los datos personales se ven únicamente dentro del panel, con tu sesión.
--   · Un fallo al avisar nunca bloquea el registro ni la subida del documento.
--   · No se envían correos.
-- Se puede ejecutar más de una vez sin problema.

-- Interruptores (todos encendidos: solo avisan a administración)
create table if not exists ajustes_avisos_admin (
  id boolean primary key default true check (id),
  cuenta_nueva boolean not null default true,
  peticion_nueva boolean not null default true,
  documento_subido boolean not null default true,
  push_movil boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into ajustes_avisos_admin (id) values (true) on conflict (id) do nothing;
alter table ajustes_avisos_admin enable row level security;
drop policy if exists ajustes_avisos_admin_sel on ajustes_avisos_admin;
create policy ajustes_avisos_admin_sel on ajustes_avisos_admin
  for select using (coalesce(auth_role()::text, '') in ('admin', 'superadmin'));

-- Núcleo: campana + push móvil + n8n, todo blindado
create or replace function avisar_admins(p_tipo text, p_titulo text, p_cuerpo text, p_enlace text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_push boolean;
begin
  begin
    select push_movil into v_push from ajustes_avisos_admin where id;
    for r in select id from profiles where role::text in ('admin', 'superadmin') loop
      insert into notificaciones (user_id, tipo, titulo, cuerpo, datos)
      values (r.id, p_tipo, p_titulo, p_cuerpo, jsonb_build_object('enlace', p_enlace));
      if coalesce(v_push, true) then
        perform enviar_push(r.id, p_titulo, p_cuerpo, jsonb_build_object('enlace', p_enlace));
      end if;
    end loop;
    -- n8n: sin datos personales
    perform disparar_webhook('panel.aviso', jsonb_build_object(
      'tipo', p_tipo, 'titulo', p_titulo, 'enlace', p_enlace));
  exception when others then
    null;  -- avisar nunca debe romper la acción real
  end;
end;
$$;
revoke all on function avisar_admins(text, text, text, text) from public, anon, authenticated;

-- 1) Cuenta nueva
create or replace function trg_aviso_cuenta_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.role::text not in ('admin', 'superadmin')
       and coalesce(new.estado_cuenta, 'pendiente') = 'pendiente'
       and coalesce((select cuenta_nueva from ajustes_avisos_admin where id), true) then
      perform avisar_admins(
        'cuenta_nueva',
        'Cuenta nueva por verificar',
        coalesce(nullif(new.nombre_completo, ''), 'Alguien') || ' se ha registrado como ' || new.role::text || '.',
        '#/empresas?f=pendiente');
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists aviso_cuenta_nueva on profiles;
create trigger aviso_cuenta_nueva after insert on profiles
  for each row execute function trg_aviso_cuenta_nueva();

-- 2) Petición nueva de un particular
create or replace function trg_aviso_peticion_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.origen = 'particular' and new.estado::text = 'en_revision'
       and coalesce((select peticion_nueva from ajustes_avisos_admin where id), true) then
      perform avisar_admins(
        'peticion_nueva',
        'Petición nueva por revisar',
        coalesce(new.titulo::text, 'Petición') || '. Respuesta en 3 días laborables.',
        '#/peticiones');
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists aviso_peticion_nueva on obras;
create trigger aviso_peticion_nueva after insert on obras
  for each row execute function trg_aviso_peticion_nueva();

-- 3) Documento subido a revisar
create or replace function trg_aviso_documento_subido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.estado = 'pendiente'
       and (tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path)
       and coalesce((select documento_subido from ajustes_avisos_admin where id), true) then
      perform avisar_admins(
        'documento_subido',
        'Documento por revisar',
        'Se ha subido un documento (' || coalesce(new.tipo, 'sin tipo') || ') pendiente de revisión.',
        '#/revision');
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists aviso_documento_subido on documentos_cuenta;
create trigger aviso_documento_subido after insert or update of storage_path on documentos_cuenta
  for each row execute function trg_aviso_documento_subido();

-- Panel: avisos instantáneos (la campana se actualiza sola al llegar un aviso)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones') then
    alter publication supabase_realtime add table notificaciones;
  end if;
end $$;

-- Panel: ver y cambiar los interruptores
create or replace function panel_avisos_admin_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform panel_exigir_admin();
  select to_jsonb(a) - 'id' into v from ajustes_avisos_admin a where a.id;
  return v;
end;
$$;
create or replace function panel_avisos_admin_ajustar(p_cuenta_nueva boolean default null, p_peticion_nueva boolean default null,
  p_documento_subido boolean default null, p_push_movil boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform panel_exigir_admin();
  update ajustes_avisos_admin set
    cuenta_nueva = coalesce(p_cuenta_nueva, cuenta_nueva),
    peticion_nueva = coalesce(p_peticion_nueva, peticion_nueva),
    documento_subido = coalesce(p_documento_subido, documento_subido),
    push_movil = coalesce(p_push_movil, push_movil),
    updated_at = now()
  where id;
end;
$$;
revoke all on function panel_avisos_admin_estado() from public, anon;
revoke all on function panel_avisos_admin_ajustar(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function panel_avisos_admin_estado() to authenticated;
grant execute on function panel_avisos_admin_ajustar(boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- TELEGRAM CON n8n (opcional, a mano cuando tengas el workflow importado)
-- ---------------------------------------------------------------------------
--   insert into webhooks_config (evento, url, secreto)
--   values ('panel.aviso', 'https://<tu-n8n>/webhook/<ruta>', '<un-secreto-largo-que-inventes>');
-- Para apagarlo:  update webhooks_config set activo = false where evento = 'panel.aviso';