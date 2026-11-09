# Contratos automáticos de 3B Conecta — nota para revisión jurídica

**Estado:** BORRADOR técnico. Los textos no se deben usar con clientes reales hasta que los revise Javi / la asesoría. Pagos reales y correos siguen desactivados.

## Qué hace el sistema
1. **Contrato de encargo y condiciones del pago** — se genera cuando se crea el pago. El cliente lo lee y firma **antes** de que se cree el cobro en Stripe. Si no lo firma, no se cobra.
2. **Contrato de conformidad con la obra** — se genera cuando el oficio marca la obra (o un tramo) como terminada. El cliente lo firma para confirmar; la firma y la confirmación ocurren en un solo paso.
3. Aviso automático al cliente en cada momento (notificación en la app; el correo solo si se activa más adelante).

## Firma electrónica simple
Nombre y apellidos escritos + casilla "he leído y acepto". Se guardan: texto exacto firmado (copia congelada), huella SHA-256, fecha y hora, IP y navegador/dispositivo. Un contrato firmado no se puede modificar ni borrar.

## Aceptación tácita
Si el cliente no responde en el plazo del pago (por defecto 7 días), la obra se confirma sola y la conformidad queda marcada como **"tácita"** (no firmada). 

## Preguntas para el asesor
- ¿Es válida la aceptación tácita a los N días para consumidores? ¿Qué plazo y qué texto de aviso previo?
- ¿Basta la firma electrónica simple para estos documentos o conviene reforzarla (código por SMS/email)?
- Cláusulas de comisión (15 % + IVA al oficio), retención, disputas, desistimiento y reembolso.
- Rol de 3B (intermediario / agente de pago) y responsabilidad frente a cliente y oficio.
- Conservación de los contratos y datos (IP/agente) conforme al RGPD y la política de privacidad.
- Redacción final de ambas plantillas (`encargo` y `conformidad`).

## Operativa técnica
- Las plantillas viven en la tabla `contratos_plantillas`. Se publica una nueva versión con `panel_contratos_plantilla_nueva(tipo, titulo, cuerpo)` (solo administradores, desde SQL). Variables disponibles: `{{cliente_nombre}}`, `{{oficio_nombre}}`, `{{oficio_cif}}`, `{{obra_titulo}}`, `{{obra_referencia}}`, `{{importe}}`, `{{dias_confirmacion}}`, `{{plan_tramos}}`, `{{alcance}}`, `{{importe_alcance}}`.
- Si se publica una versión nueva, los pagos aún sin pagar pedirán firmar de nuevo.
- Si no hay plantilla activa de un tipo, no se exige firma de ese tipo.
- No se ha modificado el panel de administración.