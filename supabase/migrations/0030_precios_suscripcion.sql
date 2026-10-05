-- ============================================================================
-- Precios de suscripción + comisión de las inmobiliarias (octubre 2026)
-- ============================================================================
-- Las inmobiliarias se registran con el tipo de cuenta 'administrador'
-- (decisión de Ainhoa/Dirección). Por eso ese perfil:
--   1) paga suscripción como las promotoras y constructoras, y
--   2) puede recomendar clientes y cobra la comisión del 2 % (la de la
--      inmobiliaria en el planteamiento original). Sin esta segunda fila una
--      inmobiliaria pagaría la cuota y sus recomendaciones nunca generarían
--      comisión (actualizar_estado_referencia solo calcula si hay regla).
--
-- Precios PROVISIONALES: todavía no se cobra nada (uso gratuito en el
-- lanzamiento, sin Stripe) y sin confirmar si se anuncian con IVA. Es solo
-- configuración; se puede cambiar con otro UPDATE.
--   6,90 €  → arquitecto, proveedor, profesional
--   19,90 € → promotor, constructora, administrador (inmobiliarias)
-- Oficios no está en esta tabla (modelo previsto: comisión por obra, sin construir).
--
-- Se puede ejecutar más de una vez sin problema.

update precios_suscripcion set precio_mensual = 6.90
  where role in ('arquitecto', 'proveedor', 'profesional');

update precios_suscripcion set precio_mensual = 19.90
  where role in ('promotor', 'constructora', 'administrador');

insert into reglas_recompensa_referido (role, porcentaje, descripcion)
values ('administrador', 2.00, 'Inmobiliaria o administrador que recomienda clientes')
on conflict (role) do update
  set porcentaje = excluded.porcentaje, descripcion = excluded.descripcion;

update reglas_recompensa_referido
  set descripcion = 'Persona externa que recomienda clientes (agente o particular)'
  where role = 'referidor';