# Cierre de pendientes · 3B Conecta · 4-nov-2026

**Estado: NO listo para producción.** Falta ejecutar las pruebas de integración contra un Supabase de pruebas real (auth, renovación de sesión, roles y RLS reales). Todo lo siguiente se ha validado en local (Postgres 16 + PostgREST + Playwright).
No se ha tocado producción, ni cargado precios reales, ni activado coeficientes, comisiones o Stripe.

## 1. Cambios realizados
1. **Nueva `0072_cerrar_funciones_a_anon.sql`** (hallazgo de seguridad, ver 3.1): quita EXECUTE a `anon`/`public` en 6 funciones de negocio. Idempotente, sin tocar datos ni lógica.
2. **`0071` y `panel/index.html`**: los validados en la ronda anterior (trigger que impide borrar cálculos aprobados; fuentes sin licencia deshabilitadas; permisos de tablas geo). **Aún no están en Git** (ver 3.3).
3. Nuevos: script `probar_migraciones.sh`, `auditoria_catalogo_rls.sql`, documentos de proyecto de pruebas, pruebas manuales, migraciones ausentes y pruebas de volumen CSV.
No se ha modificado ninguna funcionalidad validada. `0039` y `0070` no se han tocado.

## 2. Archivos (ruta de destino en el repositorio)
| Archivo | Destino | Acción |
|---|---|---|
| 0071_cobertura_nacional_precios.sql | supabase\migrations\ | reemplaza (validada) |
| 0072_cerrar_funciones_a_anon.sql | supabase\migrations\ | nuevo |
| index.html | docs\panel\ | reemplaza (validado) |
| auditoria_catalogo_rls.sql | supabase\pruebas\ | nuevo |
| probar_migraciones.sh | scripts\ | nuevo |
| PROYECTO_PRUEBAS_SUPABASE.md, PRUEBAS_MANUALES.md, MIGRACIONES_AUSENTES.md | docs\validacion\ | nuevos |
| LEEME.md, gen_csv.py, ejemplo_40_filas.csv | docs\validacion\volumen\ | nuevos |

## 3. Problemas resueltos / aclarados
**3.1 Migraciones ausentes (puntos 1 y 2).** 0039 está truncada en Git desde `1cb268a` (falta `$$;` final); no existe versión completa en ningún commit, así que no se ha restaurado ni inventado nada. 0005 y 0022 nunca estuvieron en Git (el README las documenta); 0061 tampoco y la sustituye la 0069. Detalle y dependencias en `MIGRACIONES_AUSENTES.md`.
Mi copia anterior de pruebas no coincidía con Git (le faltaban 0054 y 0055 y tenía una 0061 que nunca se subió). Reconstruí la base **solo desde `origin/main`**: 68 migraciones (+0071 +0072) → 0 errores.
**Hallazgo por la falta de 0022:** en ese esquema, `aceptar_postulacion`, `cambiar_estado_obra`, `finalizar_obra`, `resolver_canje`, `solicitar_canje` y `registrar_avance_obra` eran ejecutables sin sesión; en las de administración la comprobación `auth_role() not in (...)` se saltaba al ser NULL. Comprobado: un visitante llegaba a la lógica de negocio. La 0072 lo cierra (verificado: «permission denied»). **Hay que comprobar si producción ya lo tiene corregido.**
**3.2 Batería repetida sobre la base fiel a Git + 0071 + 0072:** 232/232 (permisos 70, admin 44, cálculo 25, comisiones 23, histórico 18, panel 52). Sin regresiones.
**3.3 Sincronización con Git.** `origin/main` (ec28c54) contiene la 0071 y el panel **previos a la validación** (0071: 359.793 bytes frente a 360.559 validados; panel: 592.785 frente a 593.114). La 0070 solo difiere en un salto de línea final: no hay que subirla. Hasta que subas los archivos de este envío, Git NO contiene la última versión validada.
**3.4 Procedimiento de proyecto de pruebas (punto 4):** `PROYECTO_PRUEBAS_SUPABASE.md` + script. El script se probó contra una base local vacía: 70 migraciones, 0 errores, aplicando el arreglo de 0039 solo en copia temporal. No se ha ejecutado contra Supabase real. El panel pide URL y clave y no lleva claves escritas.
**3.5 Lista de pruebas manuales (punto 5):** `PRUEBAS_MANUALES.md` (auth, renovación de sesión, roles, RLS, panel, CSV, seguridad).
**3.6 CSV y volumen (punto 6):** 4.850 filas (válidas, duplicadas, lugares inexistentes, ambiguos, fuente sin licencia, precio/fecha/desglose erróneos, fuente inexistente). Análisis 5,9 s, guardado 1,9 s; 3.800 importadas, 1.050 rechazadas con motivo, exactamente las esperadas; lote registrado; sin errores en página.

## 4. Pendientes
1. **Duplicados en CSV: no se detectan.** Reimportar el mismo archivo duplica referencias (las 300 duplicadas del test se importaron). No lo he cambiado por tu instrucción de no tocar lo validado; propuesta: avisar en la ventana previa de filas ya existentes (misma fuente, partida, unidad, ámbito y fecha) y que las omita, o añadir un índice único. Decide tú.
2. **Pruebas contra Supabase real**: auth, renovación de JWT, roles y RLS con usuarios reales, tiempos de red del CSV.
3. **Comparar con producción**: volcado del esquema `public` en solo lectura frente al reconstruido; recuperar 0005, 0022 y el SQL original de 0039 del historial de consultas de Supabase.
4. **Subir a Git** los archivos de este envío.
5. Guardado del CSV sin transacción única (bloques de 200).
6. La falta de los scripts `seguridad/prueba_seguridad_*` sigue sin resolverse; el auditor nuevo no los sustituye.
7. Un test no automatizable en local: envío real de correos, Stripe, Storage, pg_cron/pg_net (se usaron simulados).

## 5. Pasos exactos para validar en Supabase de pruebas
1. Crear proyecto nuevo `3bconecta-pruebas`; activar extensiones; copiar URL, anon key y cadena de conexión (guía §1).
2. `export TEST_DB_URL=… CONFIRMO_PROYECTO_DE_PRUEBAS=SI PRODUCCION_REF=vvghqtwwrwdtekropavo; bash scripts/probar_migraciones.sh` → esperar «Migraciones con error: 0».
3. Pegar `supabase/pruebas/auditoria_catalogo_rls.sql` → consultas 1, 2, 3 vacías.
4. Crear 4 usuarios de prueba y asignar roles.
5. Servir el panel en local y entrar con URL/clave de pruebas en ventana privada.
6. Completar `PRUEBAS_MANUALES.md` (A–F) anotando resultado real.
7. Generar el CSV con `gen_csv.py`, importarlo y anotar tiempos y conteos (esperado: 3.500 + 300 duplicadas, 1.050 errores).
8. Si todo pasa, y solo entonces, valorar producción: comparar esquema, aplicar 0072 en producción en una ventana controlada.
