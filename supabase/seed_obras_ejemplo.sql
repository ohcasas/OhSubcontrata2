-- Datos de ejemplo para probar la pantalla de Obras Disponibles.
-- Ejecutar a mano en el SQL Editor de Supabase (no se aplica solo).
-- Inspirados en las licitaciones de ejemplo del diseño de Stitch, con datos
-- de relleno — sustituir por obras reales cuando OH Casas empiece a publicar.

insert into obras
  (referencia, titulo, descripcion, especialidad_requerida, ubicacion, modulos, m2,
   presupuesto, moneda, puntos_bonus, fecha_inicio, duracion_dias, plazo_cierre, estado, requisitos)
values
  ('LIC-2025-089', 'Residencial MonteReal – Fase 2',
   'Instalación eléctrica completa de cuadro de mando modular, pre-canalización domótica KNX e iluminación LED indirecta integrada en techos prefabricados.',
   'Electricidad & Domótica', 'Pozuelo de Alarcón (Madrid)', 4, 185,
   18200, 'EUR', 350, current_date + interval '20 days', 14, now() + interval '2 days', 'abierta', 'PRL 20h + Instalador'),

  ('LIC-2025-094', 'Villa Modular Ribera',
   'Montaje e izado de entramado Steel Frame y cerramiento de paneles sándwich autoportantes en losa de cimentación previa.',
   'Estructura Ligera', 'Sant Cugat del Vallès (Barcelona)', null, 240,
   32400, 'EUR', 600, current_date + interval '28 days', 21, now() + interval '10 days', 'abierta', 'Equipo mínimo: 3 operarios'),

  ('LIC-2025-102', 'Bungalows Ecoturismo',
   'Instalación de suelo radiante hidrónico, aerotermia compacta individual por módulo y conexionado estanco de saneamientos.',
   'Fontanería & Clima', 'Costa del Sol (Málaga)', 3, 140,
   24800, 'EUR', 450, current_date + interval '40 days', 10, now() + interval '15 days', 'abierta', 'Certificación RITE');
