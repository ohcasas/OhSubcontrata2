-- Añade la columna de imagen de portada, que no venía en el esquema inicial
-- (0001) y hace falta para las tarjetas de obra en la pantalla real.
alter table obras add column if not exists imagen_url text;
comment on column obras.imagen_url is
  'URL de la imagen de portada de la obra (Supabase Storage o externa). Opcional — si es NULL, la app muestra un marcador visual en su lugar.';
