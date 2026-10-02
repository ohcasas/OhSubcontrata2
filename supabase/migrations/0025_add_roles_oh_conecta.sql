-- ============================================================================
-- OH Conecta: 6 roles nuevos de pago por suscripción
-- ============================================================================
-- Igual que con 'referidor' (0023): Postgres no deja añadir un valor a un
-- enum y usarlo en la misma transacción. Este archivo va SOLO, antes que
-- 0026, cada uno ejecutado por separado.
--
-- 'oficios' no se añade aquí porque ya existe — es el 'subcontratista' de
-- siempre, solo cambia de nombre visible en la app, no en la base de datos
-- (cambiar el valor del enum ahora mismo obligaría a tocar todas las
-- políticas y funciones que ya comprueban 'subcontratista'; no vale la
-- pena el riesgo solo por el nombre).

alter type user_role add value if not exists 'promotor';
alter type user_role add value if not exists 'constructora';
alter type user_role add value if not exists 'arquitecto';
alter type user_role add value if not exists 'proveedor';
alter type user_role add value if not exists 'profesional';
alter type user_role add value if not exists 'administrador';