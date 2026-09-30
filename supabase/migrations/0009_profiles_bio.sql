-- ============================================================================
-- Biografía / descripción de perfil
-- ============================================================================
-- Un campo de texto libre, editable por el propio usuario (admin o
-- subcontratista), para presentarse — "quién soy", especialidad en sus
-- propias palabras, lo que quiera poner. Comparte tabla porque tanto el
-- perfil de admin como el de subcontratista son filas de `profiles`.

alter table profiles add column if not exists bio text;
comment on column profiles.bio is
  'Biografía/descripción libre que el propio usuario escribe sobre sí mismo, editable desde su Perfil.';