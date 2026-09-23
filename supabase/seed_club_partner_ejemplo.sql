-- Ejecutar a mano en el SQL Editor de Supabase. Asume que ya creaste la
-- empresa 'Empresa de Prueba SL' en el paso del Login/Detalle de Obra.

update empresas_subcontratistas
set puntos_disponibles = 1500, nivel_partner = 'plata'
where nombre = 'Empresa de Prueba SL';

insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto)
select id, 'ganancia', 500, 'Bonus trimestral de fidelidad'
from empresas_subcontratistas where nombre = 'Empresa de Prueba SL';

insert into club_partner_movimientos (empresa_id, tipo, puntos, concepto)
select id, 'ganancia', 1000, 'Certificación final de obra sin incidencias'
from empresas_subcontratistas where nombre = 'Empresa de Prueba SL';

insert into recompensas_catalogo (nombre, descripcion, puntos_requeridos, categoria, activo)
values
  ('Bono en Efectivo Directo', '500 € netos a cuenta bancaria', 1000, 'efectivo', true),
  ('Lote de Herramienta Hilti / DeWalt', 'Kit atornillador de impacto 18V', 2200, 'herramienta', true),
  ('Pago Seguro RC Anual', 'Financiación de la cuota de Responsabilidad Civil', 1800, 'seguro', true),
  ('Curso Passivhaus Industrializada', 'Certificación Tradesperson oficial', 900, 'formación', true);
