-- Ejecutar a mano en el SQL Editor de Supabase.

update empresas_subcontratistas
set rating_medio = 4.9, obras_completadas = 14
where nombre = 'Empresa de Prueba SL';

insert into documentos_homologacion
  (empresa_id, tipo, estado, descripcion, cobertura_eur, fecha_emision, fecha_vencimiento)
select id, 'alta_autonomo', 'vigente', 'Alta Autónomo / Modelo 036',
       null, current_date - interval '400 days', current_date + interval '120 days'
from empresas_subcontratistas where nombre = 'Empresa de Prueba SL';

insert into documentos_homologacion
  (empresa_id, tipo, estado, descripcion, cobertura_eur, fecha_emision, fecha_vencimiento)
select id, 'seguro_rc', 'vigente', 'Seguro de Responsabilidad Civil',
       600000, current_date - interval '200 days', current_date + interval '165 days'
from empresas_subcontratistas where nombre = 'Empresa de Prueba SL';

insert into documentos_homologacion
  (empresa_id, tipo, estado, descripcion, cobertura_eur, fecha_emision, fecha_vencimiento)
select id, 'certificado_prl', 'vigente', 'Certificado PRL 20h Electricidad y Alturas',
       null, current_date - interval '90 days', current_date + interval '640 days'
from empresas_subcontratistas where nombre = 'Empresa de Prueba SL';

insert into documentos_homologacion
  (empresa_id, tipo, estado, descripcion, cobertura_eur, fecha_emision, fecha_vencimiento)
select id, 'certificado_aeat_tgss', 'vigente', 'Corriente de pagos AEAT y TGSS',
       null, current_date - interval '10 days', current_date + interval '80 days'
from empresas_subcontratistas where nombre = 'Empresa de Prueba SL';
