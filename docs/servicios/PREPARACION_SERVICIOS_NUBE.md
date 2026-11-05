# Preparación de servicios en la nube (3B Conecta)

Estado: **guía de preparación. No se ha enviado ningún correo, no se ha hecho ningún cobro, no se ha activado ninguna tarea programada y no se ha tocado producción.** No se ha cambiado código ni migraciones. El proyecto no está declarado listo para producción.

Todo lo de abajo se ha leído del repositorio (funciones `supabase/functions/*`, migraciones 0017, 0056, 0057, 0060, 0062, 0073). Lo que depende de tu cuenta de Supabase/Stripe/Resend no se ha podido comprobar desde aquí.

## Regla común
Hacer todo primero en **proyecto Supabase de pruebas + Stripe en modo test + dominio de pruebas**. Producción solo con tu autorización expresa, y solo después de repetir la lista de comprobación del final.

## 1. Correos (Resend)
**Qué hay ya:** función `enviar-correos` (Resend), cola `cola_correos`, plantillas `plantillas_correo`, ajustes `ajustes_correo` con interruptor `activo` (por defecto **false**). Si está desactivado la función responde «correos desactivados» y no envía.
**Qué tienes que hacer tú:**
1. Crear cuenta en Resend y **verificar el dominio** remitente (registros SPF, DKIM y, recomendado, DMARC en el DNS). Sin esto los correos caen en spam o se rechazan.
2. Crear una clave API de Resend. Mejor una para pruebas y otra distinta para producción.
3. En Supabase → Edge Functions → Secrets: `RESEND_API_KEY`, `ENVIO_CORREOS_SECRET` (cadena larga aleatoria) y `APP_URL`.
4. Desplegar `enviar-correos` (sin verificación JWT; la protege la cabecera `x-envio-secret`).
5. En el panel (sección Correos): remitente, `funcion_url`, el mismo secreto, y revisar cada plantilla. Dejar **«activo» apagado** hasta que lo decidas.
**Antes de activar:** probar con una dirección tuya y una cola de 1 correo; comprobar límites del plan de Resend; revisar que las plantillas no incluyan datos sensibles (sobre todo las del módulo «Trabaja con nosotros»: candidatos).
**Atención:** el secreto de envío está guardado también en la tabla `ajustes_correo.secreto_envio` (lo usa la base de datos para llamar a la función). Es coherente con el diseño actual, pero considera moverlo a Supabase Vault más adelante.
**El módulo de selección no encola correos** hoy (no hay `cola_correos` en 0073): los avisos a candidatos son internos de la app. Si quieres correos a candidatos, es una decisión nueva que requiere plantilla, base legal y tu aprobación.

## 2. Stripe (pagos)
**Qué hay ya:** funciones `stripe-crear-pago`, `stripe-liberar-pago`, `stripe-liberar-tramo`, `stripe-onboarding`, `stripe-webhook`; tablas `pagos`, `stripe_cuentas` (Connect Express), `stripe_eventos` (idempotencia); interruptor `ajustes_pagos.pagos_activos` (por defecto **false**, los administradores sí lo ven para probar).
**Qué tienes que hacer tú:**
1. Cuenta de Stripe con **Connect** activado; empezar en **modo test**.
2. Secretos en Supabase: `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET`.
3. Crear en Stripe el endpoint de webhook apuntando a `stripe-webhook` con estos eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.created`, `charge.refunded`. El secreto `whsec_…` va a `STRIPE_WEBHOOK_SECRET`.
4. App móvil: variable `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_test_…) en el entorno de build (EAS). `merchantIdentifier` actual: `merchant.es.tresbe.conecta` (requiere Apple Pay configurado en tu cuenta de Apple Developer si lo quieres usar; Google Pay habilitado).
5. Datos legales y fiscales de Stripe (empresa, IBAN, representante) y revisar condiciones de Connect para plataformas (retención de fondos, comisiones). **Cuestión legal/fiscal que debes validar con asesoría:** retención de fondos y comisión como intermediario.
**Pruebas sin dinero real:** tarjeta 4242 4242 4242 4242, y la CLI de Stripe (`stripe listen`) en tu equipo.
**Mantener `pagos_activos = false`** hasta superar las pruebas. Pasar a claves `sk_live_`/`pk_live_` y un segundo webhook live solo con tu autorización.

## 3. Supabase Storage
**Buckets existentes en migraciones:** `obras-fotos` (público), `avatares` (público), `postulacion-archivos`, `documentos-homologacion`, `chat-archivos`, planos (0067) y `seleccion-cv` (privado, con límite de tamaño y tipos MIME, política por carpeta del usuario).
**Qué tienes que hacer:** ejecutar las migraciones en el proyecto de pruebas y comprobar en el panel de Storage que los buckets existen con los privados como privados; revisar cuota y plan (tamaño de archivo máximo global del proyecto); decidir región/copia de seguridad.
**CV de candidatos:** el borrado manual existe (función de borrado de candidato, comprobada en las pruebas 305/305). **No hay borrado automático** y no se activará hasta validar el plazo legal y la política de privacidad.

## 4. Tareas programadas
**Existentes:**
- `recordatorios-ofertas` (cada hora, pg_cron, migración 0017). Requiere la extensión `pg_cron` activada en Supabase.
- `reintentar_correos` (cada 5 minutos, migración 0057): ejecuta `disparar_envio_correos()`, que no hace nada si `ajustes_correo.activo` está apagado.
**Qué hacer tú:** activar la extensión `pg_cron` y `pg_net` (Database → Extensions) en el proyecto de pruebas, y revisar con `select * from cron.job;` qué hay programado. Comprobar que `recordatorios-ofertas` no genera avisos no deseados antes de producción.
**No programado a propósito:** retención/borrado de datos de candidatos o cualquier eliminación automática.

## 5. Lista de comprobación antes de producción (necesita tu autorización)
- [ ] Dominio verificado en Resend y correo de prueba recibido en bandeja de entrada.
- [ ] Stripe test: cobro, retención, liberación, reembolso y contracargo probados con el webhook.
- [ ] `pagos_activos` y `ajustes_correo.activo` en estado conocido y documentado.
- [ ] Secretos solo en Supabase/EAS, ninguno en el repositorio ni en el chat.
- [ ] Revisión legal: plazos de conservación de datos de candidatos, política de privacidad, retención de fondos de Stripe.
- [ ] Copia de seguridad del proyecto antes de aplicar migraciones.
- [ ] Revisión de RLS y permisos tras desplegar (el panel de administración actual no se ha modificado).

## Qué no he podido comprobar
Cuenta real de Supabase, Resend o Stripe, estado actual de los secretos, extensiones activas, valores de `ajustes_*` en vuestra base y el dominio remitente. Ninguno es accesible desde aquí.