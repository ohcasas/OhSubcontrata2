# 3B Conecta

Plataforma móvil de **3B GROUP ARQUITECTURA, S.L.U.** que conecta a particulares que quieren hacer una obra o reforma con empresas y profesionales del sector de la construcción, con 3B como intermediario que revisa y filtra cada paso. Además incluye licitaciones entre promotoras, constructoras y oficios, un Tablón, un Directorio y un sistema de recomendación de clientes con comisión.

> Nombres anteriores del proyecto: *Portal de Subcontratas*, *OH Contratas*, *OH Club*, *OH Network*, *OH Conecta*. Si ves alguno en el código, en una migración o en un nombre de archivo, es historia: el nombre actual es **3B Conecta**.

**Estado (octubre de 2026)**: app Android en prueba interna de Google Play; prueba abierta y producción enviadas a revisión de Google (actualiza esta línea cuando se aprueben). iPhone: sin empezar. Web pública y panel de gestión publicados. Cobro de suscripciones (Stripe): sin conectar.

- Empresa: 3B GROUP ARQUITECTURA, S.L.U. · CIF B02601367 · C/ Cervantes 39 · info@3bgrouparquitectura.com · tel. 967 471 148 · representante: Braulio López Núñez (gerente)
- Soporte técnico: software@ohcasas.es

---

## Índice

1. [Comandos de actualización (lo que más se usa)](#comandos-de-actualización)
2. [Modelo de negocio](#modelo-de-negocio)
3. [Stack e identificadores](#stack)
4. [Tipos de cuenta](#tipos-de-cuenta)
5. [El flujo de una petición de particular](#el-flujo-de-una-petición-de-particular)
6. [Qué funciona hoy](#qué-funciona-hoy)
7. [Panel de gestión (web interna)](#panel-de-gestión-web-interna)
8. [Webhooks y avisos al correo](#webhooks-y-avisos-al-correo)
9. [Notificaciones push](#notificaciones-push)
10. [Migraciones de base de datos](#migraciones-de-base-de-datos)
11. [Seguridad y pruebas](#seguridad-y-pruebas)
12. [Web pública y páginas legales](#web-pública-y-páginas-legales)
13. [Publicación: Google Play y iPhone](#publicación-google-play-y-iphone)
14. [Configuración y cómo arrancar](#configuración-y-cómo-arrancar)
15. [Estructura del repo](#estructura-del-repo)
16. [Suscripciones y Stripe](#suscripciones-y-stripe)
17. [Email transaccional (Resend)](#email-transaccional-resend)
18. [Pendiente](#pendiente)
19. [Límites conocidos](#límites-conocidos-aceptados-por-ahora)
20. [Trampas conocidas](#trampas-conocidas)
21. [Para un/a desarrollador/a nuevo/a](#para-unaa-desarrolladora-nuevoa)

---

## Comandos de actualización

Todos los comandos son de **PowerShell**, desde la raíz del repo salvo que se diga otra cosa. Cada uno va en su propio bloque para copiarlo sin errores.

### 1. Subir cambios a GitHub

Ver qué ha cambiado:

```powershell
git status
```

Añadir todo:

```powershell
git add -A
```

Guardar el cambio con un mensaje que diga qué se hizo:

```powershell
git commit -m "Descripción corta del cambio"
```

Subirlo:

```powershell
git push
```

Si `git push` dice que el remoto tiene cambios que no tienes, primero:

```powershell
git pull
```

y vuelve a hacer `git push`.

### 2. Traer los últimos cambios (otro ordenador o compañera)

```powershell
git pull
```

Si cambió `package.json`, instala dependencias (desde `apps\mobile`):

```powershell
npm install
```

### 3. Orden correcto cuando el cambio toca la base de datos **y** la app

1. **Primero el SQL**: pega el archivo nuevo de `supabase/migrations/` en Supabase → SQL Editor → New query → Run. Cada archivo en una consulta aparte.
2. Guarda el archivo en `supabase/migrations/` con el número siguiente (el último es `0049`).
3. Sube el repo con los comandos del apartado 1.
4. **Después** compila la app (apartado 4). Si la app nueva pide una columna que aún no existe, todos verán un error de carga.

Una migración que añade un valor a un `enum` (`alter type ... add value`) **va sola** en su consulta: Postgres no deja añadir un valor y usarlo en la misma transacción (ver `0023`, `0025`, `0042`).

### 4. Compilar la app

Desde `apps\mobile`. **EAS compila lo que hay en GitHub**, no lo que hay en tu ordenador: haz `git push` antes.

Para Google Play (genera un `.aab`; el número de versión sube solo):

```powershell
eas build --platform android --profile production
```

APK de pruebas, para instalar en un móvil o en el emulador de Android Studio sin pasar por Play (no cambia el número de versión ni toca Play):

```powershell
eas build --platform android --profile preview
```

Development build, para desarrollar con recarga en caliente:

```powershell
eas build --platform android --profile development
```

Ver el estado de las compilaciones:

```powershell
eas build:list
```

Descarga el `.aab` desde la página del build en expo.dev y súbelo en Play Console → Pruebas (Interna / Abierta) o Producción.

**Qué obliga a compilar de nuevo**: cualquier cambio en pantallas o código de la app, en `app.config.ts`, iconos, o una librería nativa nueva. **Qué no**: cambios solo de SQL, del panel o de la web.

### 5. Publicar cambios de la web, las páginas legales o el panel

Copia el HTML nuevo a `docs\` (o `docs\panel\` para el panel), haz `git add -A`, `git commit` y `git push`. GitHub Pages tarda 1-2 minutos. Comprueba la URL en una ventana privada para evitar la caché.

### 6. Desarrollar con la development build

Una sola vez, instala la development build en el móvil (apartado 4). Luego, desde `apps\mobile`:

```powershell
npx expo start --dev-client -c
```

y conecta desde esa app (**no** desde Expo Go: no vale, usa notificaciones push).

### 7. Probar en el emulador de Android Studio

Crea un Pixel en Android Studio → Virtual Device Manager, arráncalo, genera el APK `preview` (apartado 4) y arrástralo a la ventana del emulador.

### 8. Ver los errores de la app en un móvil (cuando se cierra al arrancar)

Con la depuración USB activada y el móvil conectado, en **CMD**. Si hay más de un dispositivo (móvil y emulador), añade `-s CODIGO` con el código que muestra `devices`.

```
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" devices
```

```
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" -s CODIGO logcat -c
```

Abre la app, espera a que falle y guarda el registro:

```
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" -s CODIGO logcat -d *:E > "%USERPROFILE%\Desktop\fallo.txt"
```

Busca en el archivo `AndroidRuntime`, `ReactNativeJS` o `es.tresbe.conecta`.

### 9. Deshacer o consultar

Ver los últimos cambios:

```powershell
git log --oneline -10
```

Descartar los cambios sin guardar de un archivo:

```powershell
git restore ruta\del\archivo
```

Deshacer un commit ya subido, sin reescribir la historia:

```powershell
git revert COMMIT
```

Comprobar cómo está registrado un archivo (mayúsculas):

```powershell
git ls-files apps/mobile/src | findstr /i NombreArchivo
```

### 10. Dependencias

Desde `apps\mobile`, comprobar y arreglar versiones de Expo:

```powershell
npx expo-doctor
```

```powershell
npx expo install --check
```

### 11. Repetir las pruebas de seguridad (tras cada migración importante)

En Supabase → SQL Editor, pega **todo** el contenido y pulsa Run. Ver [Seguridad y pruebas](#seguridad-y-pruebas).

- `seguridad/prueba_seguridad_1_catalogo.sql`
- `seguridad/prueba_seguridad_2_roles.sql`

### 12. Cambiar un secreto o un destino de webhook (SQL Editor)

Ver los destinos, sin mostrar secretos:

```sql
select evento, left(url, 45) as url, activo from webhooks_config order by evento;
```

Cambiar solo la clave de la URL del receptor (Apps Script) de todos los eventos:

```sql
update webhooks_config set url = regexp_replace(url, 'clave=.*$', 'clave=NUEVA_CLAVE');
```

Apagar un destino sin borrarlo:

```sql
update webhooks_config set activo = false where evento = 'peticion.creada';
```

### 13. Avisos diarios de caducidad (una sola vez)

Activa `pg_cron` (Database → Extensions) y ejecuta:

```sql
select cron.schedule('avisar-caducidades', '0 7 * * *', $cron$ select avisar_caducidades(); $cron$);
```

Para probarlo al momento: `select avisar_caducidades();`

### 14. Qué hacer si una clave se expone (chat, repo, captura)

1. **Rota la clave en su origen** (Firebase: nueva clave de servicio y súbela con `eas credentials`; receptor de webhooks: nueva `CLAVE` en el script y en `webhooks_config`; Supabase: la `service_role` nunca debe estar en la app).
2. Borra la antigua.
3. No la pegues en chats ni en commits. La clave `anon` de Supabase **sí** va en la app (no es secreta): la protegen las reglas RLS.

---

## Modelo de negocio

| Quién | Cómo aporta dinero | Estado |
|---|---|---|
| **Promotor, Constructora, Arquitecto, Proveedor, Profesional, Administrador (inmobiliarias)** | Suscripción mensual | **Decidido, no cobrado.** De momento todo es gratis. Precios provisionales: 6,90 €/mes (Arquitecto, Proveedor, Profesional), 19,90 €/mes (Inmobiliaria/Administrador), 49,90 €/mes (Promotor, Constructora), con precio fundador de 19,90 € durante 12 meses para las primeras cuentas. Sin confirmar si llevan IVA |
| **Oficios** (subcontratistas) | Comisión por obra trabajada | Decidido, **no construido** |
| **Quien recomienda un cliente** | *Cobra* una comisión: 2 % (Recomendador e Inmobiliaria/Administrador) o 1 % (Oficios) sobre el precio de venta sin IVA | Construido; el pago real se hace fuera de la app |
| **Particulares** | No pagan | Su petición pasa por la revisión de 3B |

---

## Stack

- **App móvil**: React Native + Expo (SDK 57), NativeWind/Tailwind, React Navigation v7, DM Sans
- **Backend**: Supabase (Postgres + Auth + Storage). RLS en todas las tablas y la lógica de negocio en funciones `security definer`, no en el cliente
- **Correo de cuenta**: Resend (dominio `ohcasas.es` verificado) como SMTP de Supabase Auth
- **Push**: Expo Push Service + Firebase Cloud Messaging V1, enviadas desde la base de datos con `pg_net`
- **Avisos y automatización**: webhooks de base de datos (`disparar_webhook()`) hacia un script de **Google Apps Script** que escribe en una hoja de cálculo y envía correo. Odoo: preparado, sin conectar
- **Pagos**: Stripe previsto, **no conectado**
- **Compilación**: EAS Build, perfiles `development` / `preview` / `production`
- **Web, legales y panel**: GitHub Pages desde la carpeta `docs/`

### Identificadores (no cambiar sin leer esto)

| Qué | Valor |
|---|---|
| Nombre de paquete Android | `es.tresbe.conecta`. **No cambiarlo nunca**: va ligado a la ficha de Play y a la keystore |
| Proyecto de Firebase | `b-conecta` (`google-services.json` debe llevar `"package_name": "es.tresbe.conecta"` y `"project_id": "b-conecta"`) |
| Proyecto de Supabase | `vvghqtwwrwdtekropavo` (ojo: no confundir con `vvghqtwwwdtekropavo`, una letra de diferencia que costó horas) |
| Proyecto EAS | el de `extra.eas.projectId` en `app.config.ts`. Comprobar con `eas project:info`. Si existe otro proyecto de Expo sobrante (`softwareoh`), no es este: se puede borrar desde expo.dev tras comprobarlo |
| Keystore de firma | ya existe en EAS (`eas credentials` → Android → production). **Si EAS pregunta "¿generar una keystore nueva?", la respuesta es siempre No**: una nueva obligaría a pedir a Google un restablecimiento de clave. Guarda una copia de seguridad |
| Cuenta de Google Play | la de empresa de **OH Casas** (organización). El nombre de desarrollador visible es el de esa organización; el responsable del tratamiento de datos en los textos legales es 3B GROUP. Conviene explicar la relación en la ficha o en la web |

---

## Tipos de cuenta

El campo `profiles.role` decide qué ve cada persona.

| Perfil (`role`) | Qué hace |
|---|---|
| **Particular** (`particular`) | Envía una petición de obra o reforma, recibe la respuesta de 3B, ve las ofertas que 3B le traslada y adjudica una |
| **Técnico** (`tecnico`) | Personal de 3B (interno o externo). Realiza la visita técnica a la vivienda y registra el resultado (apto / ajustar / no apto) con fotos. Solo ve las viviendas que tiene asignadas. Lo da de alta el administrador desde el panel |
| **Oficios** (`subcontratista`) | Licitaciones (de 3B y de promotoras/constructoras), postulaciones, obras con progreso semanal, Club de socios. También puede recomendar clientes |
| **Promotor, Constructora** | Publican licitaciones, reciben ofertas, adjudican y siguen la obra. Usan el Tablón |
| **Arquitecto, Proveedor, Profesional** | Crean su ficha en el Directorio y consultan el Tablón |
| **Inmobiliaria / Administrador** (`administrador`) | Publican avisos y recomiendan clientes (cobran la comisión) |
| **Recomendador** (`referidor`) | Recomienda clientes y sigue su estado y comisiones |
| **Admin / superadmin** | Personal de 3B. Gestión completa desde la app y desde el panel. **No es lo mismo que el perfil "Administrador"** (inmobiliarias) |

Notas para quien programe:

- **Todas las cuentas crean una fila en `empresas_subcontratistas`** (el nombre de la tabla es histórico). Cualquier pantalla nueva que liste "empresas" debe descartar las que no son oficios (como hace `GremiosScreen`).
- `profile_roles` (varios roles por persona) existe pero **no se usa**: hoy cada persona tiene un único rol.
- **Una cuenta nueva nace pendiente** (verificación). Las excepciones son particulares y técnicos, que tienen su propio circuito.

---

## El flujo de una petición de particular

1. **Envío.** El particular describe su proyecto. La petición queda en revisión (`en_revision`) y no es visible para las empresas. Sus datos personales viven aparte (`obras_privado`).
2. **Revisión de 3B** (respuesta en 3 días laborables), desde el panel: **publicar**, **pedir información** (`pendiente_info`), **programar visita técnica** o **rechazar** (`rechazada`).
3. **Visita técnica.** Un técnico visita, registra el resultado y adjunta fotos. Un resultado "no apto" termina en rechazo.
4. **Publicación.** La petición pasa a `abierta` y las empresas verificadas la ven.
5. **Ofertas filtradas.** Las empresas ofertan, pero **3B las filtra**: solo traslada al particular las adecuadas; las descartadas no las ve.
6. **Adjudicación.** El particular elige. 3B comparte sus datos de contacto **únicamente con la empresa elegida** (`panel_compartir_contacto`).
7. **Obra.** `adjudicada` → `en_curso` → `cerrada` (o `cancelada`). El estado solo se cambia con `cambiar_estado_obra()`.

Cada paso dispara su webhook (ver [Webhooks](#webhooks-y-avisos-al-correo)). Las licitaciones de empresas verificadas se publican directamente (`abierta`) sin pasar por revisión.

Estados de una obra: `en_revision`, `pendiente_info`, `rechazada`, `abierta`, `adjudicada`, `en_curso`, `cerrada`, `cancelada`.

> **Si añades un estado nuevo**, busca todos los `Record<EstadoObra, …>` y mapas de estilos de la app y añade el estado **o un valor por defecto** (`?? ESTILO_DESCONOCIDO`). Un estado que una pantalla no conoce hace que la app se cierre al abrirla (ya pasó: `Cannot read property 'badge' of undefined` en `AdminObrasScreen`).

---

## Qué funciona hoy

**Particulares y técnicos**: flujo de petición completo (arriba), con revisión previa, visitas técnicas, filtro de ofertas y adjudicación.

**Oficios**
- Licitaciones (con prioridad si cierran en ≤48 h), guardar oferta con recordatorio, postulación con oferta, teléfono y adjuntos
- Ciclo de obra con un único camino de cambio de estado; progreso semanal visible para la empresa y el admin
- Club de socios: se desbloquea desde la 1ª obra completada; nivel por puntos; recompensas; canjes gestionados por el admin

**Recomienda** (Oficios, Recomendador, Inmobiliaria/Administrador)
- Botón "Conozco a alguien que quiere construir", con consentimiento obligatorio de la persona referida
- Pipeline: `enviado → contactado → visita → presupuesto → reserva → venta → comisión disponible` (+ descartado)
- Al pasar a `venta` (el admin indica el precio sin IVA) se calcula la comisión y se avisa. La persona la acepta desde una tarjeta flotante
- Los porcentajes viven en `reglas_recompensa_referido`, no en el código
- Con comisión generada, no se puede retroceder ni descartar

**Tablón y Directorio**: necesidades (promotor/constructora) y avisos (administrador); una ficha por proveedor/arquitecto/profesional; buscador sin tildes y filtros.

**Licitaciones de terceros** (promotoras y constructoras): publican, ven postulaciones con datos de la empresa, adjudican o rechazan con motivo y llevan la obra. **No dan puntos del Club ni cuentan como obra completada.**

**Verificación de cuentas** (todos los perfiles)
- Una cuenta nueva nace **pendiente** y solo ve "Estamos revisando tu cuenta". **El bloqueo está en la base de datos**, no solo en pantalla: una cuenta pendiente o suspendida no lee licitaciones, Tablón ni Directorio, ni publica, ni se postula, ni recomienda, aunque llame a la API a mano
- El admin verifica, rechaza, suspende y reactiva (Conecta → Cuentas, o el panel). Suspender cierra sesiones, impide volver a entrar y oculta lo publicado
- Todo cambio queda en `cuenta_historial` (quién, cuándo, motivo) y la persona recibe aviso
- Nadie puede aprobarse a sí mismo: los usuarios solo editan 4 columnas de su perfil (`0016`)
- Aviso a los admin al registrarse una cuenta pendiente (máx. uno cada 15 min por admin) y webhook `cuenta.pendiente`
- **Alta por perfil**: cada tipo de cuenta tiene su formulario (campos de `campos_registro`, CIF/NIF/NIE validado)
- **Documentación obligatoria**: tras confirmar el correo se suben los documentos del perfil (`documentos_requeridos`) a un almacén privado (PDF o foto, hasta 10 MB). Verificar exige los documentos aprobados; el admin puede saltárselo con un motivo
- **Caducidad**: los documentos valen 2 meses; avisos a 15 y 7 días y el día que caduca; renovación desde la app (el documento actual sigue vigente hasta aprobar el nuevo); trabajadores de cada empresa con sus documentos

**Común a todos**: registro con confirmación de correo, recuperar contraseña, notificaciones dentro de la app y push reales, eliminar cuenta (desde la app y desde la web), importes siempre en euros.

### Cambiar lo que se pide a cada perfil (sin recompilar)

Los campos y documentos de cada perfil son **datos, no código** (migración `0036`); se cambian en el SQL Editor y la app los recoge al momento.

```sql
select clave, etiqueta, obligatorio from campos_registro where role = 'arquitecto' order by orden;
select tipo, etiqueta, obligatorio from documentos_requeridos where role = 'arquitecto' order by orden;
update documentos_requeridos set obligatorio = false where role = 'constructora' and tipo = 'seguro_rc';
```

Perfiles: `arquitecto`, `profesional`, `promotor`, `constructora`, `proveedor`, `administrador`, `subcontratista`. Cambiarlo no afecta a las cuentas ya verificadas. La lista inicial es una propuesta: conviene validarla con una gestoría.

---

## Panel de gestión (web interna)

Un solo archivo, `docs/panel/index.html`, que usa el mismo Supabase que la app. URL: `https://ohcasas.github.io/OhSubcontrata2/panel/`. No guarda datos propios: lo que protege la información son las reglas de la base de datos (solo entran cuentas `admin` o `superadmin`; todas las funciones `panel_*` llaman a `panel_exigir_admin()`).

| Pantalla | Para qué |
|---|---|
| Panel | Contadores (por revisar, caducados, caducan en 15 días, cuentas) y las que requieren atención |
| Por revisar | Cola de documentos subidos, los más antiguos primero: ver, aprobar, rechazar con motivo |
| Peticiones | Cola de peticiones de particulares: publicar, pedir información, visita técnica o rechazar; historial de cada una |
| Ofertas | Ofertas a peticiones de particulares: trasladar o descartar; compartir contacto al adjudicar |
| Técnicos | Alta de técnicos por correo (**Añadir técnico**), marcar interno/externo, asignar visitas |
| Empresas | Cuentas con semáforo, buscador y filtros; ficha con documentos, trabajadores y actividad; verificar o suspender |
| Trabajadores | Alta, baja y ficha de cada trabajador con sus documentos |
| Actividad | Quién subió, aprobó o rechazó qué documento y cuándo |
| Documentos que se piden | Qué se pide a cada perfil, si es obligatorio y cuántos meses vale |

**Puesta en marcha**: ejecutar las migraciones, copiar `docs/panel/index.html` a `docs/panel/` y subir con Git. La primera vez la página pide la URL y la clave `anon` de Supabase y las guarda solo en ese navegador. Entrar con una cuenta admin.

**Dar de alta un técnico**: crear la cuenta en Supabase (Authentication → Add user) o que se registre, y en el panel → Técnicos → Añadir técnico con su correo (la función `panel_crear_tecnico` crea el perfil si hace falta). Una cuenta con rol admin no puede ser técnico: usa un alias (`tucorreo+tecnico@gmail.com`).

---

## Webhooks y avisos al correo

La tabla `webhooks_config(evento, url, secreto, activo)` guarda el destino de cada evento. Cuando ocurre, `disparar_webhook()` envía a cada URL activa un POST con el cuerpo `{"evento": "...", "fecha": "...", "datos": {...}}` y la cabecera `X-Webhook-Secret`. **Si no hay filas, no se envía nada. Si un envío falla, nunca tumba la operación real.** Los resultados se pueden ver en `net._http_response`.

### Receptor actual: Google Apps Script

Un script publicado como aplicación web (ejecutar como *yo*, acceso *Cualquier usuario*) con una `CLAVE` que viaja en la URL (`...?clave=...`). Recibe el POST, añade una fila a la hoja de cálculo (fecha, evento, referencia, detalle) y envía un correo a `info@3bgrouparquitectura.com` para los eventos importantes (`peticion.creada`, `oferta.pendiente`, `visita.realizada`, `peticion.adjudicada`).

- Tras editar el script, hay que **crear una versión nueva de la implementación** (Implementar → Administrar implementaciones → Editar → Nueva versión).
- Para cambiar la clave: nueva `CLAVE` en el script, nueva versión, y el `update webhooks_config` del apartado de comandos.
- Probar un envío a mano: `select disparar_webhook('peticion.creada', '{"referencia":"PRUEBA"}'::jsonb);` y mirar `net._http_response`. Borra después la fila de prueba de la hoja.

### Eventos

| Evento | Cuándo se dispara |
|---|---|
| `peticion.creada` | Un particular envía una petición (`0043`). Solo lleva el id del propietario |
| `peticion.decidida` | 3B publica, pide información, programa visita o rechaza (`0048`) |
| `visita.asignada`, `visita.agendada`, `visita.realizada`, `visita.cancelada` | Ciclo de la visita técnica; `visita.realizada` lleva el resultado (`0048`) |
| `oferta.pendiente`, `oferta.trasladada`, `oferta.descartada` | Llega una oferta a una petición de particular y 3B la traslada o descarta (`0048`) |
| `peticion.adjudicada` | El particular adjudica: hay que compartir su contacto con la empresa elegida (`0048`) |
| `obra.adjudicada`, `obra.en_curso`, `obra.finalizada`, `obra.cancelada` | Cambia el estado de una obra |
| `postulacion.creada`, `postulacion.aceptada`, `postulacion.rechazada` | Ciclo de postulaciones |
| `avance.registrado` | Un oficio registra el avance de una obra |
| `canje.solicitado`, `canje.completado`, `canje.cancelado` | Canjes de puntos del Club |
| `empresa.registrada` | Se da de alta una empresa |
| `cuenta.pendiente` | Se registra una cuenta que espera verificación |
| `cuenta.verificada`, `cuenta.suspendida`, `cuenta.en_revision` | El admin cambia el estado de una cuenta |
| `documentacion.completa` | Una cuenta pendiente ha subido todos sus documentos obligatorios |
| `documento.caduca` | Un documento caduca (avisos a 15 y 7 días y el día); lo dispara `avisar_caducidades()` |
| `recomendacion.creada`, `recomendacion.estado` | Alguien recomienda un cliente; avanza o se descarta |
| `comision.generada`, `comision.aceptada`, `comision.pagada` | Ciclo de la comisión |
| `licitacion.creada`, `licitacion.estado` | Una promotora o constructora publica una licitación; cambia de estado |

**Datos personales**: `recomendacion.creada` lleva nombre, teléfono y correo del cliente recomendado, y `cuenta.*` el nombre y correo de la persona. Los eventos del flujo de particulares (`peticion.*`, `visita.*`, `oferta.*`) **no llevan datos personales**, solo identificadores y estados. Usa solo destinos de la empresa.

```sql
insert into webhooks_config (evento, url, secreto) values
  ('peticion.creada', 'https://script.google.com/macros/s/ID/exec?clave=CLAVE', null);
```

Pendiente, además de Stripe: webhooks **entrantes** (Stripe → suscripciones; Resend → rebotes; recibos de Expo) y la conexión con **Odoo**, que se haría desde Apps Script con `UrlFetchApp` (hace falta conocer la versión y la API de Odoo).

---

## Notificaciones push

- Firebase `b-conecta` con la app Android `es.tresbe.conecta`. Clave de servicio **FCM V1** subida a EAS (`eas credentials` → Android → Push Notifications).
- `registrarPush()` guarda el token al iniciar sesión; `crear_notificacion()` envía el push a través de Expo.
- **Un móvil, un usuario** (`0038`): un token pertenece a un solo usuario. **Cerrar sesión borra el token** (`services/sesion.ts`, `cerrarSesion()`): usa siempre esa función, no `supabase.auth.signOut()` a secas.
- Con un móvil y dos cuentas, **solo la última cuenta recibe push**; para probar el circuito entero hacen falta dos dispositivos.

### Si el push no llega (pero el aviso sí sale dentro de la app)

```sql
-- 1) ¿A qué cuenta pertenece cada móvil?
select p.email, right(t.token, 10) as token, t.plataforma, t.updated_at
from push_tokens t join profiles p on p.id = t.user_id order by t.updated_at desc;

-- 2) Envío directo (cambia el correo)
select enviar_push((select id from profiles where email = 'TU_CORREO'), 'Prueba', 'Si ves esto, el push funciona', '{}'::jsonb);

-- 3) Qué respondió Expo a los últimos envíos
select created, status_code, left(content, 400) as respuesta from net._http_response order by created desc limit 5;
```

| Lo que ves | Qué significa |
|---|---|
| El paso 2 llega al móvil | La tubería funciona; el problema era el paso 1 |
| El paso 3 no devuelve filas | `pg_net` no está activada (Database → Extensions) |
| `"status":"ok"` pero no llega | Permisos de notificación del móvil; en Xiaomi, ahorro de batería «Sin restricciones» e inicio automático |
| `DeviceNotRegistered` | Token obsoleto: cierra sesión y vuelve a entrar |
| `InvalidCredentials` / `MismatchSenderId` | Credenciales de Firebase: paquete `es.tresbe.conecta`, `google-services.json` y clave FCM V1 en EAS |

---

## Migraciones de base de datos

Ejecutar **en orden**, desde el SQL Editor de Supabase, **cada archivo en una consulta aparte**. `0042` va sola, antes de la `0043`.

| # | Archivo | Qué añade |
|---|---|---|
| 1 | `0001_init_schema.sql` | Esquema inicial: 10 tablas + RLS |
| 2 | `0002_add_imagen_obras.sql` | Columna de imagen en obras |
| 3 | `0003_canje_rpc.sql` | `solicitar_canje()` |
| 4 | `0004_registro_trigger.sql` | Alta automática de empresa + perfil al registrarse |
| 5 | `0005_aceptar_postulacion_rpc.sql` | Versión original de `aceptar_postulacion()` (superada por 0014/0015; por historial) |
| 6 | `0006_obras_fotos_storage.sql` | Bucket público `obras-fotos` |
| 7 | `0007_profiles_email.sql` | Email accesible en `profiles` |
| 8 | `0008_fix_obras_fotos_public.sql` | Corrige que el bucket no quedara público |
| 9 | `0009_profiles_bio.sql` | Bio editable |
| 10 | `0010_avatares_storage.sql` | Bucket público `avatares` |
| 11 | `0011_documentos_storage.sql` | Adjuntos de postulación y documentos de homologación (buckets privados) |
| 12 | `0012_estado_en_curso.sql` | Estado `en_curso` |
| 13 | `0013_postulaciones_telefono_contacto.sql` | Teléfono de contacto por postulación |
| 14 | `0014_fix_aceptar_postulacion.sql` | Recrea `aceptar_postulacion()` |
| 15 | `0015_cambiar_estado_obra.sql` | `cambiar_estado_obra()`: único camino para cambiar el estado, con puntos idempotentes |
| 16 | `0016_fase_a_notificaciones_puntos_seguridad.sql` | Notificaciones, ofertas guardadas, niveles, recompensas, canjes, 4 agujeros de seguridad cerrados |
| 17 | `0017_cron_recordatorios.sql` | Recordatorios horarios (`pg_cron`) |
| 18 | `0018_webhooks_n8n.sql` | Webhooks salientes (`webhooks_config`, `disparar_webhook`) |
| 19 | `0019_avances_obra.sql` | Progreso semanal de obra |
| 20 | `0020_push_tokens.sql` | Token por dispositivo + envío de push |
| 21 | `0021_puntos_desde_primera_obra_y_borrado_cuenta.sql` | Puntos desde la 1ª obra; `eliminar_mi_cuenta()` |
| 22 | `0022_fix_seguridad_funciones_admin.sql` | **Fallo grave corregido**: la comprobación de admin se saltaba sin sesión (NULL). Revoca permisos a `anon` |
| 23 | `0023_add_rol_referidor.sql` | Rol `referidor`. **Va solo** |
| 24 | `0024_referidos_pipeline.sql` | Pipeline de recomendaciones y comisiones |
| 25 | `0025_add_roles_oh_conecta.sql` | Los 6 roles de empresa. **Va solo** |
| 26 | `0026_oh_conecta_suscripciones.sql` | `suscripciones`, `precios_suscripcion`, registro de los 6 perfiles |
| 27 | `0027_oh_conecta_tablon_directorio.sql` | Tablón y Directorio |
| 28 | `0028_eliminar_cuenta_todos_los_perfiles.sql` | `eliminar_mi_cuenta()` para todos los tipos de cuenta |
| 29 | `0029_seguridad_tablas_nuevas_y_pago_comisiones.sql` | Pase de seguridad (2 fallos menores) y `marcar_recompensa_pagada()` |
| 30 | `0030_precios_suscripcion.sql` | Precios provisionales; comisión del 2 % para el perfil Administrador |
| 31 | `0031_precio_fundador.sql` | `programa_fundador`, `precio_aplicable()` |
| 32 | `0032_fix_avisos_repetidos_recomendaciones.sql` | Solo avisa si el estado cambia de verdad |
| 33 | `0033_licitaciones_de_terceros.sql` | Licitaciones de promotoras y constructoras |
| 34 | `0034_verificacion_de_cuentas.sql` | `profiles.estado_cuenta`, `cambiar_estado_cuenta()`, `cuenta_historial`, bloqueo de cuentas sin verificar |
| 35 | `0035_avisos_de_cuentas_y_cierre_de_limites.sql` | Aviso a los admin de cuentas pendientes; bloqueo por tabla |
| 36 | `0036_alta_por_perfil_y_documentacion.sql` | Campos y documentos por perfil (editables), `documentos_cuenta`, almacén privado |
| 37 | `0037_historial_y_bloqueo_de_recomendaciones.sql` | `referencias_historial` y bloqueo de retrocesos |
| 38 | `0038_un_movil_un_usuario.sql` | Un token de push, un usuario |
| 39 | `0039_webhooks_de_recomendaciones_cuentas_y_licitaciones.sql` | 11 webhooks nuevos |
| 40 | `0040_panel_documentos_caducidad_y_trabajadores.sql` | Panel de documentación, caducidad, trabajadores, `avisar_caducidades()` |
| 41 | `0041_renovaciones_y_trabajadores_desde_la_app.sql` | Renovar documentos y gestionar trabajadores desde la app |
| 42 | `0042_roles_y_estados_para_peticiones.sql` | Roles `particular` y `tecnico`; estados `en_revision`, `pendiente_info`, `rechazada`. **Va sola** |
| 43 | `0043_revision_previa_particulares_y_tecnicos.sql` | Revisión previa de peticiones, datos personales aparte, técnicos, visitas, informe y fotos |
| 44 | `0044_publicacion_directa_y_filtro_de_ofertas.sql` | Licitaciones de empresas verificadas, publicación directa; filtro de ofertas de particulares |
| 45 | `0045_alta_de_particulares.sql` | Crea el perfil al registrarse un particular |
| 46 | `0046_alta_de_tecnicos_desde_el_panel.sql` | `panel_crear_tecnico()` |
| 47 | `0047_arreglo_alta_sin_rol.sql` | Crear un usuario sin rol (p. ej. "Add user" de Supabase) ya no falla |
| 48 | `0048_webhooks_del_flujo_de_peticiones.sql` | Webhooks del flujo de particulares, sin datos personales |
| 49 | `0049_endurecer_funciones_auxiliares.sql` | Revoca a `anon` las funciones auxiliares de permisos y fija su `search_path` (resultado de la prueba de seguridad) |

Si `0017` o `0018` fallan por `pg_cron`/`pg_net`: Database → Extensions, actívalas y repite solo ese archivo. Los `seed_*.sql` son datos de prueba opcionales.

---

## Seguridad y pruebas

**Principio**: la seguridad está en la base de datos (RLS y funciones `security definer`), no en la pantalla. Nunca se pone la `service_role key` en la app ni en el repo.

### Pruebas automáticas (`seguridad/`)

Se ejecutan en Supabase → SQL Editor pegando **todo** el archivo. Ninguna cambia datos.

| Archivo | Qué hace |
|---|---|
| `prueba_seguridad_1_catalogo.sql` | Audita el catálogo: tablas sin RLS, funciones ejecutables sin sesión, políticas abiertas, buckets públicos, funciones sin `search_path` fijo, destinos de webhook |
| `prueba_seguridad_2_roles.sql` | Simula cada rol (sin sesión, particular, subcontratista, técnico, promotor/constructora, administrador) e intenta lo que no debería poder: leer datos ajenos, subirse el rol, verificarse a sí mismo, leer webhooks, usar funciones `panel_*`, ver archivos de otros. Acaba en `rollback` |

Lectura de resultados: **OK** = bloqueado como debe · **FALLO** = pudo hacer algo que no debía · **REVISAR** = mira si es intencionado · **INCONCLUSO** = la tabla o columna no existe con ese nombre · **CONTROL ROTO** = la prueba de control falló (resultados no fiables). Necesita una cuenta por rol; si falta alguna, esas pruebas se omiten.

**Repítelas tras cada migración importante y antes de un lanzamiento grande.**

### Resultado (13 de octubre de 2026)

- 152 comprobaciones por rol: 147 correctas, **0 fallos reales**, 3 avisos explicados (falso positivo), 1 inconcluso, 1 informativa.
- Sin sesión, no se puede leer ni escribir nada sensible. Particular, subcontratista y técnico no pueden subirse el rol, verificarse a sí mismos, ver datos de otros, leer webhooks ni usar funciones del panel.
- **Corregido** (`0049`): cuatro funciones auxiliares (`auth_role`, `auth_empresa_id`, `cuenta_verificada`, `rls_auto_enable`) eran ejecutables sin sesión; `auth_role` y `auth_empresa_id` no fijaban `search_path`. Verificado tras la corrección.
- **Falso positivo**: `panel_estado_doc()` figura como "se ejecutó sin ser admin"; es una función auxiliar que solo traduce un estado y no devuelve datos.
- **Informativo / intencionado**: buckets públicos `avatares` y `obras-fotos` (**nunca guardar datos personales ahí**); `campos_registro` y `documentos_requeridos` legibles sin sesión (necesario para el formulario de registro).
- **Mejora futura**: limitar a usuarios con sesión las políticas de almacenamiento definidas para el rol `public`.
- **Pendiente de completar**: probar el rol promotor/constructora (no había cuenta); ajustar la prueba de comisiones (el nombre de la tabla es otro).
- **Límites**: son pruebas internas de permisos y datos. No sustituyen un test de intrusión externo ni cubren la infraestructura de terceros, la disponibilidad ni el abuso por volumen.

### Revisiones anteriores

RLS activo en todas las tablas; políticas antiguas siempre eliminadas antes de recrearse; ninguna traza de `service_role`. La corrección más importante histórica es la `0022`. Siguen siendo decisiones de producto, no fallos: los datos de contacto del Tablón y el Directorio los ve cualquier cuenta registrada (y registrarse es libre).

---

## Web pública y páginas legales

Publicadas con GitHub Pages desde la carpeta `docs/` de este repo (público): `https://ohcasas.github.io/OhSubcontrata2/`.

| Página | Archivo |
|---|---|
| Portada de la app | `docs/index.html` |
| Política de privacidad | `docs/privacidad.html` |
| Eliminar cuenta (sin la app instalada) | `docs/eliminar-cuenta.html` |
| Aviso legal | `docs/aviso-legal.html` |
| Términos y condiciones | `docs/terminos.html` |
| Confirmación de registro (destino del correo de Supabase) | `docs/confirmado.html` |
| Nueva contraseña (destino del enlace de recuperación) | `docs/nueva-contrasena.html` |
| Panel de gestión | `docs/panel/index.html` |

- Los textos legales llevan los datos de 3B GROUP. Son un **borrador redactado sin asesoría legal**: hay que hacerlos revisar por un abogado.
- Privacidad y eliminar cuenta se enlazan en Play Console; privacidad, aviso legal y términos, desde dentro de la app (`constants/enlaces.ts`). "Eliminar cuenta" es también un botón del Perfil.
- Tras editar un HTML de `docs/`, `git push`; GitHub Pages tarda 1-2 minutos.
- **No cambies los nombres de estos archivos**: la portada y la app los enlazan con rutas relativas.

### La portada (`docs/index.html`)

Un único archivo, sin nada externo (fuente y logo incrustados), sin cookies ni analítica ni peticiones a terceros, así que no necesita aviso de cookies. Si algún día se añade analítica o un formulario de contacto, hay que actualizar la política de privacidad y añadir aviso de cookies.

- **Enlace de Google Play**: al final del archivo, en `ENLACE_GOOGLE_PLAY`. Mientras esté vacío, los botones dicen "Próximamente en Google Play"; al pegarlo, pasan solos a "Descargar en Google Play".
- Mantén al día a mano: "de momento, solo para Android", "durante el lanzamiento es gratis" (debe coincidir con el apartado de los términos), las fichas de cada perfil (lo que se pide al registrarse, de `campos_registro` y `documentos_requeridos`) y los textos de los avisos de ejemplo.
- No lleva precios ni porcentajes de comisión, a propósito.
- Estilo "cristal translúcido": se controla con variables CSS al principio. No subas el desenfoque de la barra flotante por encima de ~20 px, y no pongas `filter` ni `opacity` fija en un bloque con cristal dentro. Todo pasa a fondos sólidos si el navegador no lo soporta o la persona reduce la transparencia/movimiento.
- Cada nodo del dibujo lleva a la ficha de su perfil (`#promotor`, `#constructora`, `#arquitecto`, `#profesional`, `#proveedor`, `#oficios`, `#inmobiliaria`, `#recomendador`).

---

## Publicación: Google Play y iPhone

### Google Play (cuenta de organización de OH Casas)

- Estado: prueba interna disponible; prueba abierta y producción en revisión de Google.
- Antes de publicar, en Play Console → Panel → "Configurar tu aplicación": política de privacidad, acceso a la app, anuncios (no), clasificación de contenido, público objetivo, seguridad de los datos, eliminación de cuenta (URL de `eliminar-cuenta.html`) y ficha principal (textos de `textos_ficha_play_store.txt`).
- **Acceso a la app**: da las credenciales de una cuenta de revisor **ya verificada** (si el equipo de Google se registra por su cuenta, queda en "pendiente" y no puede probar nada).
- Para pasar a producción con la misma versión: Producción → Crear versión → "Añadir desde la biblioteca" → elegir el build aprobado. Recomendado: **publicación manual** y **lanzamiento progresivo** (10-20 %).
- Cuando se publique: pegar el enlace en `ENLACE_GOOGLE_PLAY` (portada).
- Quitar una app antigua: si nunca se publicó, Configuración avanzada → Eliminar aplicación; si ya se publicó, solo se puede **anular su publicación**.

### iPhone / App Store (pendiente)

Se puede compilar sin Mac (`eas build --platform ios`), pero hace falta:
- Cuenta de **Apple Developer** (99 $/año; para empresa, número D-U-N-S).
- Clave **APNs** para las notificaciones (`eas credentials`) y `ios.bundleIdentifier` en `app.config.ts`.
- **Borrado de cuenta desde dentro de la app** (Apple lo exige; hoy existe en el Perfil).
- **Pagos**: si se cobran suscripciones digitales por usar funciones de la app, Apple suele exigir su sistema de compras integradas (con comisión). Decidirlo antes de activar Stripe.
- Cuenta de revisor, y TestFlight para probar en un iPhone real.

---

## Configuración y cómo arrancar

`apps/mobile/.env` (no está en el repo):

```
EXPO_PUBLIC_SUPABASE_URL=https://vvghqtwwrwdtekropavo.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto>
```

Para compilar con EAS, esas dos variables están en **dos sitios**: como respaldo en `eas.json` y como fuente real en el panel de Expo (Project → Environment variables). Si cambian, actualiza los dos. La clave `anon` no es secreta; la `service_role` no debe estar en ninguno.

Para desarrollar: ver los apartados 4, 6 y 7 de [Comandos de actualización](#comandos-de-actualización).

---

## Estructura del repo

```
OhSubcontrata2/
├── apps/mobile/
│   ├── app.config.ts            # nombre, icono, splash, paquete, EAS projectId, plugins
│   ├── eas.json                 # perfiles de build + variables de respaldo
│   ├── google-services.json     # Firebase (b-conecta), para push en Android
│   ├── tailwind.config.js       # escala de color y tipografía: fuente única de estilos
│   ├── src/
│   │   ├── design-system/tokens.js
│   │   ├── constants/           # niveles, enlaces (páginas legales), perfiles, stripe
│   │   ├── utils/               # plazos, moneda (euros sin Intl), texto (sin tildes), documentoFiscal
│   │   ├── services/            # supabase, storage, pushNotifications, sesion, catalogoRegistro
│   │   ├── navigation/          # RootNavigator (decide qué ve cada rol) y las pestañas de cada rol
│   │   ├── components/          # ScreenHeader, AnimatedTabBar, CamposDinamicos, TarjetaComisionFlotante...
│   │   └── screens/             # auth, obras, postulaciones, partner, notificaciones, recomienda, conecta, perfil, admin
│   └── assets/branding/         # logo, iconos y pantalla de carga
├── docs/                        # web pública, páginas legales y panel (GitHub Pages)
│   └── panel/index.html
├── seguridad/                   # pruebas de seguridad (SQL)
├── supabase/
│   ├── migrations/              # 0001 → 0049
│   └── seed_*.sql
└── packages/shared-types/
```

---

## Suscripciones y Stripe

Preparado, **no conectado**:

- Cada cuenta de los 6 perfiles de pago nace con una fila en `suscripciones` en estado `pendiente_pago` y sin precio (se calcula al activar el cobro). **No bloquea nada**: bloquear antes de poder cobrar dejaría a la gente sin forma de pagar ni de entrar.
- El precio mensual de cada rol vive en `precios_suscripcion` (provisional).
- **Precio fundador**: las primeras *N* cuentas de promotor/constructora por orden de registro pagan `precio_fundador` durante `meses` meses **contados desde que empiece el cobro**. Vive en `programa_fundador` y `precio_aplicable(profile_id)` calcula qué le toca a cada cuenta. El número de plazas está **vacío a propósito**: **hay que fijarlo antes de activar el cobro** con `update programa_fundador set plazas = N;`
- La clave pública de Stripe está en `constants/stripe.ts` (no es secreta). **La clave secreta nunca va en la app ni en el repo**: se pone como variable de una Edge Function de Supabase.
- Falta: guardar `precio_aplicable()` en `suscripciones.precio_mensual` al activar; la Edge Function que hable con Stripe; el webhook de eventos de suscripción; el SDK `@stripe/stripe-react-native` (librería nativa: exige compilar de nuevo); y la pantalla de pago. En iPhone, valorar las normas de pago de Apple.

---

## Email transaccional (Resend)

- Dominio `ohcasas.es` verificado en Resend (DNS en Hostinger: 1 TXT de DKIM + 2 CNAME). Remitente: `software@ohcasas.es`. Supabase → Authentication → SMTP Settings → *Sender name* debe decir **3B Conecta**.
- La confirmación usa `emailRedirectTo` → `docs/confirmado.html`; recuperar contraseña → `docs/nueva-contrasena.html`. **Las dos URLs tienen que estar en Redirect URLs de Supabase** (Authentication → URL Configuration); si falta una, Supabase ignora la redirección.
- **Al probar**: registrar un correo que ya existe devuelve "200, todo bien" pero no envía nada ni crea cuenta (Supabase lo hace a propósito). Para probar cada perfil usa alias: `tunombre+arquitecto@gmail.com` llega a la misma bandeja y cuenta como correo distinto.

---

## Pendiente

**Decisiones o terceros**

1. **Revisión legal** de privacidad, términos y aviso legal. Lo más delicado: la base legal para tratar datos de **clientes recomendados** y la relación entre OH Casas (cuenta de Play) y 3B GROUP (responsable de datos).
2. **Suscripciones con Stripe**: plazas fundador, IVA, precio de Oficios, y cómo encaja con Apple en iPhone.
3. **Comisión por obra de Oficios**: porcentaje e importe base.
4. **Cómo se pagan las comisiones** de recomendación a particulares (factura, retención de IRPF…): decisión fiscal.
5. **Versión iPhone** (ver arriba).
6. **Conexión con Odoo** desde Apps Script.
7. **Dominio propio** para la web y los enlaces legales, en lugar de `ohcasas.github.io`.

**Tareas manuales**

8. Esperar la aprobación de Play, publicar y pegar el enlace en `ENLACE_GOOGLE_PLAY`.
9. Probar el flujo completo en producción con cuentas de prueba (particular → petición → revisión → visita → oferta → adjudicación) comprobando avisos y panel.
10. Crear una cuenta de promotor/constructora y repetir la prueba de seguridad por roles.
11. Añadir `nueva-contrasena.html` y `confirmado.html` a Redirect URLs de Supabase, si no están; cambiar el *Sender name* a "3B Conecta".
12. Validar con una gestoría la lista de documentos de cada perfil.
13. Si una cuenta se rechaza o elimina desde el panel de Supabase (no desde la app), sus archivos quedan en el almacén `documentos-verificacion`: bórralos a mano desde Storage.
14. Guardar una copia de la keystore de firma. Borrar el proyecto de Expo sobrante, si lo hay.
15. Limitar a usuarios con sesión las políticas de almacenamiento definidas para el rol `public`; valorar doble verificación para cuentas admin.

**Mantenimiento**: dependencias que `npx expo-doctor` marque desactualizadas.

---

## Límites conocidos, aceptados por ahora

- Cada persona tiene **un solo rol**.
- **Licitaciones de terceros**: máximo 10 abiertas por cuenta; sin moderación previa (el admin las ve y puede cancelarlas); sin valoración de la empresa por el dueño; el borrado de cuenta se bloquea mientras haya una abierta o en marcha.
- Los oficios todavía no tienen ficha en el Directorio.
- **Verificación manual**: nadie comprueba el CIF automáticamente. El token de una cuenta suspendida sigue siendo válido hasta 1 hora, pero las lecturas y escrituras están bloqueadas en la base de datos desde el primer segundo.
- **Tokens de push viejos**: al reinstalar queda uno antiguo (Expo lo rechaza como `DeviceNotRegistered`; no molesta, solo hace envíos inútiles).
- **Documentos**: un archivo por tipo (varias páginas, en un solo PDF o foto); PDF, JPG, PNG y WebP hasta 10 MB; al sustituir uno, el anterior queda en el almacén hasta borrar la cuenta.
- Sin límite de recomendaciones por usuario y día.
- El buscador del Tablón y el Directorio filtra en el móvil sobre lo cargado; con cientos de entradas habría que pasarlo al servidor.
- **Eliminar cuenta** está bloqueado para admin/superadmin (se dan de baja a mano) y para quien tenga una comisión pendiente o aceptada sin cobrar.
- Al eliminar una obra, sus archivos de Storage quedan huérfanos.
- La pantalla de carga de Android solo puede mostrar un icono sobre un color de fondo (limitación del sistema desde Android 12).
- `Intl.NumberFormat` con moneda no es fiable en Hermes/Android: por eso `utils/moneda.ts` formatea a mano. Por la misma razón `utils/texto.ts` quita las tildes con una tabla en vez de `normalize()`.

---

## Trampas conocidas

Cosas que ya han costado tiempo:

1. **Mayúsculas en nombres de archivo**: Windows no distingue, EAS compila en Linux y sí. Renombrar solo la capitalización desde el Explorador no basta: usa `git mv` y comprueba con `git ls-files`.
2. **EAS compila lo que hay en GitHub**, no lo que hay en tu ordenador: `git push` antes de `eas build`.
3. **No debe existir un `app.json` junto a `app.config.ts`**: algunos comandos de EAS leen solo el primero.
4. **El paquete, la keystore y `google-services.json` van juntos** (ver Identificadores).
5. **Nombres de funciones SQL y llamadas de la app**: si renombras una función en una migración, busca sus llamadas (`supabase.rpc('...')`) en la app.
6. **Play sirve la versión con el número más alto** entre todas las pistas en las que esté la misma cuenta.
7. **En PL/pgSQL, un `IF` con condición NULL cuenta como falso**: `if auth_role() not in (...) then raise exception` no salta sin sesión. Comprueba `auth.uid() is null` antes.
8. **`profiles` solo deja editar 4 columnas** (`grant update (nombre_completo, telefono, bio, avatar_url)`, `0016`). Nunca hagas un `grant update on profiles` a secas: abriría `role` y `estado_cuenta` (un usuario podría ascenderse a admin).
9. **Orden al desplegar**: primero el SQL, luego la versión nueva de la app.
10. **Un estado nuevo en un `enum` exige revisar la app**: todo `Record<Estado, …>` necesita el estado nuevo o un valor por defecto, o la pantalla se rompe y la app se cierra al arrancar.
11. **Las funciones auxiliares de permisos (`auth_role`, `auth_empresa_id`, `cuenta_verificada`) no son ejecutables por `anon`** desde `0049`. Al crear una función auxiliar nueva, revoca `execute` a `public` y `anon` y fija `set search_path = public`.
12. **Pruebas de seguridad con tablas simplificadas** dan falsos avisos (sin RLS real): ejecútalas siempre sobre el Supabase real.
13. **Una URL de Apps Script con acceso restringido da 403** a Supabase: la implementación debe ser "ejecutar como yo" y acceso "Cualquier usuario". Y la URL no debe duplicarse (`.../s/https://...`).
14. **Con más de un dispositivo conectado, `adb` exige `-s CODIGO`**.
15. **Claves por chat, nunca**: si pasa, rótala (ver comandos, apartado 14).

---

## Para un/a desarrollador/a nuevo/a

1. **Código**: acceso a `github.com/ohcasas/OhSubcontrata2` y `git clone`.
2. **Herramientas**: Node.js 20+, Git, `npm install -g eas-cli`, y la development build en el móvil.
3. **Pide a Ainhoa**: `apps/mobile/.env`, `apps/mobile/google-services.json` y un usuario de prueba de cada tipo de cuenta que vayas a tocar.
4. **Accesos extra** (si el correo es distinto): Supabase → Project Settings → Team; EAS → expo.dev → Settings → Members + `eas login`; Firebase → proyecto `b-conecta` → Usuarios y permisos; Play Console → Usuarios y permisos.
5. Lee [Trampas conocidas](#trampas-conocidas) antes de tocar nada.

### Usuarios de prueba

- Admin: perfil con `role='admin'`, sin `empresa_id`.
- Técnico: alias `tucorreo+tecnico@...` dado de alta desde el panel.
- Particular y subcontratista de prueba: cuentas con alias de correo.
- (Credenciales compartidas por canal separado. No las pongas aquí.)