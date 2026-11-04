# Pruebas manuales contra Supabase real (proyecto de PRUEBAS)

Marcar cada fila con ✔/✘, fecha y observaciones. Ninguna se da por superada «porque compila»: debe verse el resultado en el proyecto de pruebas.
Usuarios: ADMIN, SUPER (superadmin), EMP (empresa), SUB (subcontratista), ANON (sin sesión).

## A. Autenticación real
| # | Prueba | Resultado esperado |
|---|---|---|
| A1 | Entrar al panel con ADMIN y contraseña correcta | Entra y muestra el menú |
| A2 | Contraseña incorrecta | Mensaje de error, no entra |
| A3 | Entrar con EMP y con SUB | El panel rechaza el acceso (solo admin/superadmin) |
| A4 | Cuenta sin confirmar el correo | No entra |
| A5 | Recargar la página (F5) con sesión abierta | Sigue dentro (sesión persistida) |
| A6 | Cerrar sesión y pulsar «atrás» del navegador | No muestra datos |
| A7 | Recuperar contraseña (enlace del correo) | Llega correo y permite fijar nueva contraseña |

## B. Renovación de sesión (tokens)
| # | Prueba | Esperado |
|---|---|---|
| B1 | Dejar el panel abierto > la caducidad del JWT (por defecto 1 h; *Auth → Settings → JWT expiry*, para probar bajarla a 5 min) y volver a usarlo | Sigue funcionando sin pedir login (autoRefreshToken) |
| B2 | Con la sesión abierta, en *Authentication → Users* cerrar sesión del usuario / eliminarlo | Al siguiente refresco el panel pide entrar de nuevo, sin errores mudos |
| B3 | Cambiar el rol de ADMIN a EMP en `profiles` con la sesión abierta | Las acciones de administración fallan con «No autorizado» aunque el token siga vigente (la base manda, no el token) |
| B4 | Perder la conexión 1 min y recuperarla | Las vistas se recargan, sin pantalla en blanco |

## C. Roles y RLS (hacerlo con el SQL Editor «Run as» o con llamadas REST con el JWT de cada usuario)
| # | Prueba | Esperado |
|---|---|---|
| C1 | ANON `GET /rest/v1/precios_referencia` | 0 filas o 401 |
| C2 | EMP/SUB lectura de `precios_referencia`, `precios_fuentes`, `coeficientes_precio`, `reglas_comision`, `ajustes_precios`, `importaciones_precios`, `calculos_precio` | 0 filas |
| C3 | EMP/SUB/ANON `POST/PATCH/DELETE` sobre esas tablas | Denegado (401/403 o 0 filas afectadas) |
| C4 | ANON y EMP `rpc/panel_guardar_calculo`, `panel_aprobar_calculo`, `panel_elegir_modalidad`, `panel_cobertura_precios` | Error de permisos / «No autorizado» |
| C5 | ANON ejecuta `rpc/finalizar_obra`, `resolver_canje`, `aceptar_postulacion`, `cambiar_estado_obra` (con un UUID cualquiera) | `permission denied for function …` (efecto de la 0072) |
| C6 | ANON/EMP leen `geo_municipios` | Sin acceso (catálogo solo admin) |
| C7 | ADMIN: crear, editar, borrar una referencia / fuente / coeficiente / regla | Funciona y queda en `config_precios_historial` |
| C8 | ADMIN intenta borrar un cálculo aprobado o sustituido | Error «forma parte del historial» |
| C9 | SUPER vs ADMIN: acciones exclusivas de superadmin (pestaña Equipo) | Admin no puede, SUPER sí |
| C10 | Ejecutar `supabase/pruebas/auditoria_catalogo_rls.sql` | Consultas 1, 2, 3 sin filas |

## D. Panel – Precios (con ADMIN)
| # | Prueba | Esperado |
|---|---|---|
| D1 | Referencias: crear con municipio del autocompletado | Se guarda con código INE |
| D2 | Referencia con municipio inventado | Bloqueada, no se guarda |
| D3 | Fuente CYPE/BEDEC: intentar marcar «permitir guardar» con licencia pendiente | Bloqueado |
| D4 | Formulario de referencia: lista de fuentes | Las sin licencia aparecen deshabilitadas |
| D5 | Cobertura: resumen de 19 comunidades / 52 provincias; detalle de una provincia | Cifras coherentes con las referencias creadas |
| D6 | Coeficiente sin fuente/justificación/fecha | Rechazado. Si se crea, nace **inactivo** |
| D7 | Calculadora: ámbito sin referencias | «Revisión manual», nunca un precio inventado |
| D8 | Calculadora: dos modalidades y jerarquía municipio→provincia→comunidad→nacional | Cada modalidad usa solo sus referencias y la más cercana disponible |
| D9 | Comisiones: regla por código INE + excepción + comisión manual | Prioridad: la manual gana |
| D10 | Stripe | Sin claves; los cobros siguen desactivados |

## E. Importación CSV
Ver `volumen/LEEME.md` (volumen, duplicados, referencias inválidas, ubicaciones ambiguas, fuentes sin licencia).

## F. Seguridad adicional
| # | Prueba | Esperado |
|---|---|---|
| F1 | Pegar la anon key de pruebas en el panel de PRODUCCIÓN | El panel de producción NO debe usarse: confirmar que la URL del proyecto activo mostrada es la de pruebas antes de cada sesión |
| F2 | Buscar `service_role` en el repo y en el navegador (DevTools → Application) | No aparece |s