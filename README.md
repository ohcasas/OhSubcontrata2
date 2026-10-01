# OH Contratas

App móvil de OH Casas Modulares para gestionar subcontratistas: licitaciones de obra, postulaciones, progreso semanal, Club OH Partner (puntos, niveles y recompensas), notificaciones push y un panel de administración completo.

**Estado: en revisión en Google Play** (pruebas internas activas; esperando aprobación para producción).

## Stack

- **Frontend**: React Native + Expo (SDK 57), NativeWind/Tailwind, React Navigation v7, DM Sans (Google Fonts)
- **Backend**: Supabase (Postgres + Auth + Storage), con RLS en todas las tablas y la lógica de negocio en funciones `security definer`, no en el cliente
- **Email transaccional**: Resend (dominio `ohcasas.es` verificado), configurado como SMTP personalizado de Supabase Auth — no se usa Gmail ni el servicio por defecto de Supabase (ambos tienen límites demasiado bajos para producción)
- **Notificaciones push**: Expo Push Service (habla con Firebase Cloud Messaging en Android por debajo) + `pg_net` desde la base de datos
- **Automatización**: webhooks salientes hacia n8n/Odoo (`disparar_webhook()`), listos para conectar
- **Compilación**: EAS Build (cuenta `softwareoh`), perfiles `development`/`preview`/`production` en `eas.json`
- **Monorepo**: `apps/mobile/`, `supabase/`, `packages/shared-types/`

## Identificadores del proyecto

- **Nombre de paquete (Android/iOS)**: `com.ohcasas.contratas`
- **Proyecto de Firebase**: `oh-contratas`
- **Cuenta/proyecto EAS**: `softwareoh/oh-casas-subcontratas`
- **Proyecto de Supabase**: `vvghqtwwrwdtekropavo` (ojo: no confundir con `vvghqtwwwdtekropavo` — una letra de diferencia que costó varias horas de depuración en su momento)

## Estructura del repo

```
oh-casas-subcontratas/
├── apps/mobile/
│   ├── app.config.ts          # nombre, icono, splash, EAS projectId, plugins
│   ├── eas.json                 # perfiles de build + variables de entorno de respaldo
│   ├── google-services.json    # Firebase, para push en Android
│   ├── tailwind.config.js      # escala de color y tipografía — fuente única de estilos
│   ├── src/
│   │   ├── design-system/tokens.js     # colores, tipografía, sombras, radios
│   │   ├── constants/niveles.ts        # umbrales de nivel del Club Partner
│   │   ├── constants/enlaces.ts        # URLs de las páginas legales
│   │   ├── utils/plazos.ts             # reglas de plazo de cierre / licitación prioritaria
│   │   ├── utils/moneda.ts             # formateo de importes en euros (sin depender de Intl)
│   │   ├── services/                   # supabase.ts, storage.ts, pushNotifications.ts
│   │   ├── navigation/                 # stacks y tabs por rol
│   │   ├── components/                 # ScreenHeader, AnimatedTabBar, ObraImagePlaceholder...
│   │   └── screens/
│   │       ├── auth/          # Login, Registro
│   │       ├── obras/         # Lista y detalle de obra
│   │       ├── postulaciones/
│   │       ├── partner/       # Club OH Partner
│   │       ├── perfil/
│   │       ├── notificaciones/
│   │       └── admin/         # Obras, Postulaciones, Gremios, Recompensas, Perfil
│   └── assets/branding/       # logo, icono, icono adaptativo, splash
├── docs/                       # páginas legales públicas (GitHub Pages, ver abajo)
├── supabase/
│   ├── migrations/             # 0001 → 0021, ver más abajo
│   └── seed_*.sql               # datos de prueba
└── packages/shared-types/
```

## Estado actual

App funcional completa para ambos roles (subcontratista y admin), con el rediseño visual aplicado en las 25 pantallas, la marca renombrada a **OH Contratas**, y las notificaciones push funcionando de verdad en una development build.

**Funciona de principio a fin:**
- Registro (con teléfono + prefijo obligatorio) y login, con confirmación de email por Resend
- Licitaciones: lista, licitación prioritaria (cuenta atrás si cierra en ≤48h, con imagen igual que el resto de tarjetas), guardar oferta + recordatorio automático, detalle con formulario de postulación (oferta, teléfono de contacto, adjuntos)
- Ciclo de vida de la obra, con un único camino de cambio de estado (`cambiar_estado_obra()`): abierta → adjudicada → en curso → finalizada, o cancelada desde cualquiera de las tres primeras
- Progreso semanal de obra: la empresa adjudicataria registra qué se ha hecho (+ % opcional) mientras la obra está en curso; admin y empresa ven el mismo historial
- Rechazo de postulación con motivo (sugerido o libre)
- Club OH Partner: se desbloquea **desde la 1ª obra completada** (antes exigía 3); el nivel se calcula sobre puntos **totales** (nunca baja al canjear); recompensas con nivel mínimo; canjes gestionables por el admin
- Notificaciones: bandeja dentro de la app (campana) + **push real** al dispositivo (Expo Push Service + Firebase)
- Gremios: empresas por nivel, valoración, documentos de homologación con estado editable, email/teléfono de contacto en su propia fila (sin recortarse)
- Perfil (ambos roles): avatar, bio, documentos, obras completadas
- **Eliminar cuenta**: desde la app (Perfil → solo subcontratistas, bloqueado para admins por seguridad) o desde la web sin tener la app instalada
- Importes siempre en euros, formateados a mano (ver "Límites conocidos" — Hermes/Android no siempre resuelve bien `Intl.NumberFormat`)
- Webhooks hacia n8n/Odoo en cada evento de negocio relevante — vacíos hasta que se configure una URL

**Seguridad revisada:** 4 agujeros de permisos encontrados y cerrados en el pase de QA (ver migración `0016`) — el más importante, que cualquier usuario podía editar su propio rol o cambiarse de empresa. Añadido también en esa revisión: bloqueo para que un admin no pueda borrarse su propia cuenta de autoservicio.

## Páginas legales públicas

Publicadas con GitHub Pages desde este mismo repo (es público), carpeta `docs/` en la raíz:

| Página | URL |
|---|---|
| Política de privacidad | `https://ohcasas.github.io/OhSubcontrata2/privacidad.html` |
| Eliminar cuenta (sin la app instalada) | `https://ohcasas.github.io/OhSubcontrata2/eliminar-cuenta.html` |
| Aviso legal | `https://ohcasas.github.io/OhSubcontrata2/aviso-legal.html` |
| Términos y condiciones | `https://ohcasas.github.io/OhSubcontrata2/terminos.html` |
| Confirmación de registro (destino del email de Supabase) | `https://ohcasas.github.io/OhSubcontrata2/confirmado.html` |

Las dos primeras están puestas en Play Console (Presencia en la tienda → política de privacidad; Seguridad de los datos → borrado de cuenta). Las 5 están enlazadas entre sí y, las 3 primeras, también enlazadas desde dentro de la app (Login, Registro, Perfil).

Si se edita cualquier HTML de `docs/`, hay que hacer `git push` para que se publique — GitHub Pages tarda 1-2 minutos en recoger el cambio.

## Para un/a desarrollador/a nuevo/a que se une al proyecto

### 1. Acceso al repositorio de GitHub
Pídele a Ainhoa que te invite como colaborador/a en `github.com/ohcasas/OhSubcontrata2`. Clona el proyecto:
```bash
git clone https://github.com/ohcasas/OhSubcontrata2.git
cd OhSubcontrata2
```

### 2. Herramientas necesarias
- **Node.js** 20+, **Git**
- La app **Expo Go** en tu móvil, para desarrollo normal sin push
- Para compilar o tocar notificaciones push: `npm install -g eas-cli`

### 3. Pide a Ainhoa
1. **`apps/mobile/.env`** — `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (ojo con el nombre del proyecto Supabase, ver "Identificadores del proyecto" arriba — es fácil copiar mal una letra).
2. **`apps/mobile/google-services.json`** — solo si vas a probar push.
3. Usuario y contraseña de prueba.

### 4. Instalar y arrancar
```bash
cd apps/mobile
npm install
npx expo start -c
```

### 5. Acceso a Supabase, EAS o Firebase
Solo si los necesitas:
- **Supabase**: Project Settings → Team → Invite.
- **EAS**: pídele que te añada a la cuenta/organización `softwareoh` en expo.dev → Settings → Members, y haz `eas login`.
- **Firebase**: proyecto `oh-contratas` → Configuración → Usuarios y permisos.

## Configuración necesaria

`apps/mobile/.env` (no está en el repo):
```
EXPO_PUBLIC_SUPABASE_URL=https://vvghqtwwrwdtekropavo.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto>
```

Para compilaciones con EAS (`preview`/`production`), estas mismas dos variables están puestas en **dos sitios**: como respaldo en `eas.json`, y como fuente real en el panel de Expo (**Project → Environment variables**, por entorno). Si algún día hay que cambiar la URL o la clave, actualízalas en los dos sitios — el panel de Expo es el que de verdad usa EAS Build; `eas.json` es solo un respaldo para builds locales.

Credenciales de Supabase, Firebase y EAS compartidas por canal separado.

## Cómo arrancar

**Desarrollo normal (sin notificaciones push):**
```bash
cd apps/mobile
npm install
npx expo start -c
```
Escanear el QR con Expo Go.

**Con notificaciones push** (Expo Go no las soporta desde la SDK 53): hace falta una *development build* instalada en el móvil una vez:
```bash
eas build --profile development --platform android
```
y luego, para desarrollar:
```bash
npx expo start --dev-client -c
```

**Compilar una versión para probar sin depender del ordenador** (todo el código va dentro del instalable):
```bash
eas build --profile preview --platform android
```

**Compilar para subir a Google Play:**
```bash
eas build --profile production --platform android
```
Sube el `.aab` resultante a Play Console → Pruebas → Interna (o Producción, cuando corresponda).

## Notificaciones push: estado de la configuración

- Proyecto de Firebase `oh-contratas` creado, con una app Android registrada bajo `com.ohcasas.contratas` → `google-services.json` ya en el repo.
- Proyecto EAS creado y vinculado (`extra.eas.projectId` en `app.config.ts`).
- Clave de servicio de Firebase (FCM V1) subida a EAS (`eas credentials` → Android → Push Notifications).
- `registrarPush()` (en `services/pushNotifications.ts`) pide permiso y guarda el token del dispositivo al iniciar sesión; `crear_notificacion()` en Supabase manda el push de verdad a través del servicio de Expo.
- **Confirmado funcionando** en una development build real.

## Migraciones de base de datos

Ejecutar en orden desde el SQL Editor de Supabase:

| # | Archivo | Qué añade |
|---|---|---|
| 1 | `0001_init_schema.sql` | Esquema inicial: 10 tablas + RLS |
| 2 | `0002_add_imagen_obras.sql` | Columna de imagen en obras |
| 3 | `0003_canje_rpc.sql` | `solicitar_canje()` |
| 4 | `0004_registro_trigger.sql` | Alta automática de empresa + perfil al registrarse |
| 5 | `0005_aceptar_postulacion_rpc.sql` | Versión original de `aceptar_postulacion()` / `finalizar_obra()` (superada por `0014`/`0015`, se mantiene por historial) |
| 6 | `0006_obras_fotos_storage.sql` | Bucket público `obras-fotos` |
| 7 | `0007_profiles_email.sql` | Email accesible en `profiles` |
| 8 | `0008_fix_obras_fotos_public.sql` | Corrige que el bucket no quedara público |
| 9 | `0009_profiles_bio.sql` | Bio editable |
| 10 | `0010_avatares_storage.sql` | Bucket público `avatares` |
| 11 | `0011_documentos_storage.sql` | Adjuntos de postulación + documentos de homologación (buckets privados) |
| 12 | `0012_estado_en_curso.sql` | Añade el estado intermedio `en_curso` a las obras |
| 13 | `0013_postulaciones_telefono_contacto.sql` | Teléfono de contacto informativo por postulación |
| 14 | `0014_fix_aceptar_postulacion.sql` | Recrea `aceptar_postulacion()`, que nunca llegó a existir en el proyecto real |
| 15 | `0015_cambiar_estado_obra.sql` | `cambiar_estado_obra()`: único camino para cambiar el estado de una obra, con puntos idempotentes |
| 16 | `0016_fase_a_notificaciones_puntos_seguridad.sql` | Notificaciones, guardar ofertas, motivo de rechazo, puntos desde la 3ª obra (ver `0021`), rango por puntos totales, recompensas por nivel, gestión de canjes, **4 agujeros de seguridad cerrados** |
| 17 | `0017_cron_recordatorios.sql` | Programa (`pg_cron`) el envío horario de recordatorios de ofertas guardadas |
| 18 | `0018_webhooks_n8n.sql` | Webhooks salientes hacia n8n/Odoo |
| 19 | `0019_avances_obra.sql` | Progreso semanal de obra |
| 20 | `0020_push_tokens.sql` | Token de push por dispositivo + envío real vía Expo Push Service |
| 21 | `0021_puntos_desde_primera_obra_y_borrado_cuenta.sql` | Puntos y desbloqueo del Club Partner desde la 1ª obra (antes 3ª); `eliminar_mi_cuenta()`, bloqueada para admins |

Si `0017` o `0018` fallan porque `pg_cron` o `pg_net` no están activas: Database → Extensions en Supabase, activarlas, y volver a ejecutar solo ese archivo.

Opcionalmente, los `seed_*.sql` para datos de prueba.

## Email transaccional (Resend)

El envío por defecto de Supabase (y, antes, un intento con una cuenta de Gmail personal) no son aptos para producción: límites muy bajos y Gmail directamente lo desaconseja para correo automático. Configurado con **Resend** como SMTP personalizado:

- Dominio `ohcasas.es` verificado en Resend (registros DNS en Hostinger: 1 TXT de DKIM + 2 CNAME).
- Remitente: `software@ohcasas.es`.
- El enlace de confirmación de registro usa `emailRedirectTo` (en `RegistroScreen.tsx`) apuntando a `docs/confirmado.html` de este repo — **no** a la página antigua `portal-subcontratas-reset`, que solo sabía manejar enlaces de recuperación de contraseña y se quedaba colgada con un enlace de registro.
- Esa URL de redirección está añadida a la lista blanca de Supabase (Authentication → URL Configuration → Redirect URLs).

## Pendiente

1. **Confirmar la aprobación de Google Play** — app enviada a revisión; normal que tarde entre unas horas y una semana la primera vez.
2. **Recuperar contraseña**: no existe ninguna vía dentro de la app (se retiró) — hoy solo se puede restablecer manualmente desde el panel de Supabase.
3. Pase final de QA end-to-end antes de abrir la app al público (más allá del ya hecho sobre seguridad y permisos).
4. Opcional: poner al día las dependencias que `npx expo doctor` marca como ligeramente desactualizadas (aviso no bloqueante, visto en el último build).

## Límites conocidos, aceptados por ahora

- Si dos personas inician sesión en el mismo móvil, el token de push de ese dispositivo queda asociado a ambas — las dos recibirían los avisos. Poco probable en el uso real (cada empresa con su propio móvil).
- Al eliminar una obra, los archivos ya subidos a Storage (fotos, adjuntos) no se borran — quedan huérfanos en el bucket, sin coste funcional.
- El icono principal se generó a 512×512 y se escaló a 1024×1024; para máxima nitidez en el futuro, lo ideal sería un rediseño nativo a esa resolución.
- La pantalla de carga (splash) en Android solo puede mostrar un icono centrado sobre un color de fondo desde Android 12 — no admite la composición completa (wordmark + fondo decorativo) que sí se usó para el gráfico de Play Store. Es una limitación del propio sistema operativo, no de la app.
- `Intl.NumberFormat` con moneda no es fiable en Hermes/Android en producción (puede mostrar "$" en vez de "€" aunque el código pida EUR) — por eso `utils/moneda.ts` formatea los importes a mano en vez de usarlo.

## Usuarios de prueba

- Subcontratista: perfil vinculado a "Empresa de Prueba SL"
- Admin: perfil con `role='admin'`, sin `empresa_id`

(Credenciales de acceso compartidas por canal separado.)