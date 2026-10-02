-- ============================================================================
-- Nuevo rol: 'referidor' (inmobiliarias y personas que recomiendan clientes)
-- ============================================================================
-- Separado en su propio archivo a propósito: Postgres no permite añadir un
-- valor nuevo a un enum y usarlo en la misma transacción. Si esto se pegara
-- junto con 0024 en una sola ejecución, daría error. Ejecutar este archivo
-- primero, y 0024 después, cada uno por separado.

alter type user_role add value if not exists 'referidor';