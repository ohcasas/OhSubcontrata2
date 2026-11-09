-- 0075 · Plantillas de contratos, versión definitiva (redacción formal, sin aviso de borrador)
-- Publica una versión nueva de cada plantilla solo si el texto es distinto del vigente.
-- La versión más alta activa es la que se usa. Los pagos aún sin pagar
-- tendrán que volver a firmar el encargo con este texto.
-- Idempotente: se puede ejecutar más de una vez.

with nuevo(c) as (values ($t$CONTRATO DE ENCARGO Y CONDICIONES DEL PAGO CON RETENCIÓN
Fecha: {{fecha}}

REUNIDOS
De una parte, 3B GROUP ARQUITECTURA, S.L.U., con NIF B02601367 y domicilio en C/ Cervantes 39, 02250 Albacete, titular de la plataforma 3B Conecta (en adelante, «3B»).

De otra parte, {{cliente_nombre}}, con correo electrónico {{cliente_email}} (en adelante, el «Cliente»).

Interviene, como empresa a la que se adjudica la obra, {{oficio_nombre}}, con CIF {{oficio_cif}} (en adelante, el «Oficio»).

EXPONEN
I. Que el Cliente ha adjudicado a través de 3B Conecta la obra «{{obra_titulo}}» (ref. {{obra_referencia}}) al Oficio, por el importe de la oferta aceptada: {{importe}}.

II. Que las partes desean regular las condiciones en que el Cliente realiza el pago de la obra a través de 3B Conecta.

Y, reconociéndose capacidad suficiente, acuerdan las siguientes

ESTIPULACIONES
Primera.- Pago con retención. El Cliente paga a través de 3B Conecta. El importe queda retenido y no se entrega al Oficio hasta que se cumplan las condiciones de liberación.

Segunda.- Plan de pagos. El pago se entregará al Oficio conforme al siguiente plan:

{{plan_tramos}}

Tercera.- Liberación. Cuando el Oficio marca la obra (o cada tramo) como terminada, el Cliente la revisa y firma su conformidad. 3B realiza una comprobación final y libera el pago al Oficio.

Cuarta.- Silencio del Cliente. Si el Cliente no responde en {{dias_confirmacion}} días desde que el Oficio marca la obra (o el tramo) como terminada, esta se da por confirmada y el proceso continúa con la comprobación de 3B.

Quinta.- Incidencias. Antes de firmar la conformidad, el Cliente puede comunicar un problema desde la app. En ese caso, el pago queda detenido hasta que se resuelva.

Sexta.- Reembolsos. Si procede devolver el pago, se efectúa por el mismo medio de pago utilizado.

Séptima.- Protección de datos. El tratamiento de los datos personales se explica en la política de privacidad: https://3bconecta.com/privacidad.html

Octava.- Firma electrónica. Al marcar la casilla de aceptación y escribir su nombre, el Cliente firma el presente documento. Se registran la fecha y la hora, el nombre escrito y datos técnicos de la conexión, junto con una huella del texto firmado.

Y, en prueba de conformidad, el Cliente firma el presente documento en la fecha indicada.
$t$))
insert into contratos_plantillas (tipo, version, titulo, cuerpo)
select 'encargo',
       (select coalesce(max(version), 0) + 1 from contratos_plantillas where tipo = 'encargo'),
       'Encargo y condiciones del pago con retención', nuevo.c
  from nuevo
 where not exists (select 1 from contratos_plantillas p where p.tipo = 'encargo' and p.cuerpo = nuevo.c);

with nuevo(c) as (values ($t$DOCUMENTO DE CONFORMIDAD CON LA OBRA
Fecha: {{fecha}}

REUNIDOS
{{cliente_nombre}}, con correo electrónico {{cliente_email}} (en adelante, el «Cliente»), en relación con la obra «{{obra_titulo}}» (ref. {{obra_referencia}}), ejecutada por {{oficio_nombre}}, con CIF {{oficio_cif}} (en adelante, el «Oficio»).

Alcance de esta conformidad: {{alcance}}.

Importe asociado: {{importe_alcance}}.

DECLARA
Que ha revisado {{alcance}} y que se encuentra conforme con el trabajo realizado.

ESTIPULACIONES
Primera.- Efectos de la firma. La firma de este documento confirma la obra (o el tramo) y permite a 3B realizar la comprobación final y liberar el pago al Oficio.

Segunda.- Conformidad tácita. Si el Cliente no firma ni comunica ningún problema en {{dias_confirmacion}} días desde que el Oficio marcó la obra (o el tramo) como terminada, esta se da por confirmada automáticamente y se registra como conformidad tácita.

Tercera.- Incidencias. Si existe algún problema, el Cliente debe comunicarlo desde la app antes de firmar. El pago queda detenido hasta que se resuelva.

Cuarta.- Firma electrónica. Al marcar la casilla de aceptación y escribir su nombre, el Cliente firma el presente documento. Se registran la fecha y la hora, el nombre escrito y datos técnicos de la conexión, junto con una huella del texto firmado.

Y, en prueba de conformidad, el Cliente firma el presente documento en la fecha indicada.
$t$))
insert into contratos_plantillas (tipo, version, titulo, cuerpo)
select 'conformidad',
       (select coalesce(max(version), 0) + 1 from contratos_plantillas where tipo = 'conformidad'),
       'Conformidad con la obra', nuevo.c
  from nuevo
 where not exists (select 1 from contratos_plantillas p where p.tipo = 'conformidad' and p.cuerpo = nuevo.c);