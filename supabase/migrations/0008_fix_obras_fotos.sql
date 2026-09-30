-- ============================================================================
-- Corrección: asegurar que obras-fotos es público
-- ============================================================================
-- La migración 0006 usaba "on conflict (id) do nothing", así que si el
-- bucket ya existía por cualquier motivo con public=false, esa migración
-- no lo habría corregido — y las fotos subidas devolverían una URL
-- "pública" que en realidad no es servible sin sesión, lo que en el
-- cliente se ve como "la imagen no carga". Este UPDATE explícito lo
-- corrige sin depender de si el insert anterior hizo algo o no.

update storage.buckets set public = true where id = 'obras-fotos';