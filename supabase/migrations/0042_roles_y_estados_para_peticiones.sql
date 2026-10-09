-- ============================================================================
-- Roles y estados nuevos para la revisión previa de peticiones
-- ============================================================================
-- EJECUTAR ESTE ARCHIVO SOLO, Y DESPUÉS EL 0043.
-- Motivo técnico: Postgres no deja usar un valor nuevo de un tipo enumerado en la
-- misma transacción en la que se crea. Por eso van en dos ejecuciones distintas.
--
--   user_role   + particular   (persona que pide una obra o reforma para su casa)
--               + tecnico      (hace las visitas técnicas; de 3B o colaborador externo)
--   estado_obra + en_revision      (enviada, la está mirando 3B)
--               + pendiente_info   (3B ha pedido más datos a quien la envió)
--               + rechazada        (3B no la publica; se explica el motivo)
--
-- Se puede ejecutar más de una vez sin problema.

alter type user_role add value if not exists 'particular';
alter type user_role add value if not exists 'tecnico';

alter type estado_obra add value if not exists 'en_revision';
alter type estado_obra add value if not exists 'pendiente_info';
alter type estado_obra add value if not exists 'rechazada';