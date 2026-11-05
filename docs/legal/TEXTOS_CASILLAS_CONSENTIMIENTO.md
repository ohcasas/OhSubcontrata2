# Textos de las casillas del registro de candidatos

> BORRADOR pendiente de validación. Versión de texto: `2026-11-v1`. Hoy la app tiene **una sola casilla obligatoria**; este documento propone dos. Cambiarlo en la app requiere tu autorización.

## Casilla 1 · obligatoria (información, no consentimiento)
> He leído la [Política de privacidad](ENLACE) y entiendo que 3B GROUP ARQUITECTURA S.L.U. tratará mis datos para gestionar mi candidatura. Declaro tener 16 años o más.

## Casilla 2 · opcional (consentimiento, sin marcar por defecto)
> Quiero que 3B GROUP ARQUITECTURA S.L.U. conserve mis datos y mi CV hasta 12 meses para tenerme en cuenta en futuras ofertas. Puedo retirar este consentimiento cuando quiera.

## Aviso bajo el campo «Resumen» y las preguntas libres
> No incluyas datos de salud, religión, ideología, afiliación sindical, origen étnico u orientación sexual, ni foto, edad o estado civil.

## Capa informativa (bajo el formulario)
> **Responsable:** 3B GROUP ARQUITECTURA S.L.U. · **Finalidad:** gestionar tu candidatura · **Base legal:** medidas precontractuales y, para futuras ofertas, tu consentimiento · **Destinatarios:** proveedor de alojamiento (UE) · **Derechos:** acceso, rectificación, supresión, oposición, limitación y portabilidad en contacto3b@3bconecta.com · Más información en la Política de privacidad.

## Requisitos técnicos si se implementa (sin hacerlo todavía)
- Guardar por separado la aceptación de cada casilla, con versión y fecha.
- La casilla 2 no puede ser obligatoria ni estar premarcada.
- Poder retirarla desde «Mis datos» (y que `sel_candidatos_caducados()` use esa marca).