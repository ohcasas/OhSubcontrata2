# OH Contratas

App móvil de OH Casas Modulares para gestionar subcontratistas: licitaciones de obra, postulaciones, progreso semanal, Club OH Partner (puntos, niveles y recompensas) y un panel de administración completo.

## Stack

- **Frontend**: React Native + Expo (SDK 57), NativeWind/Tailwind, React Navigation v7, DM Sans (Google Fonts)
- **Backend**: Supabase (Postgres + Auth + Storage), con RLS en todas las tablas y la lógica de negocio en funciones `security definer`, no en el cliente
- **Notificaciones push**: Expo Push Service (habla con FCM/APNs por debajo) + `pg_net` desde la base de datos
- **Automatización**: webhooks salientes hacia n8n/Odoo (`disparar_webhook()`), listos para conectar
- **Monorepo**: `apps/mobile/`, `supabase/`, `packages/shared-types/`

## Estructura del repo

```
oh-casas-subcontratas/
├── apps/mobile/
│   ├── app.config.ts          # nombre, icono, splash, EAS projectId, plugins
│   ├── eas.json                # perfiles de compilación (development/preview/production)
│   ├── google-services.json    # Firebase (proyecto "oh-contratas"), para push en Android
│   ├── tailwind.config.js      # escala de color y tipografía — fuente única de estilos
│   ├── src/
│   │   ├── design-system/tokens.js     # colores, tipografía, sombras, radios
│   │   ├── constants/niveles.ts        # umbrales de nivel del Club Partner
│   │   ├── utils/plazos.ts             # reglas de plazo de cierre / licitación prioritaria
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
├── supabase/
│   ├── migrations/             # 0001 → 0020, ver más abajo
│   └── seed_*.sql               # datos de prueba
└── packages/shared-types/
```

## Estado actual

App funcional completa para ambos roles (subcontratista y admin), con el rediseño visual aplicado en las 25 pantallas y la marca renombrada a **OH Contratas**.

**Funciona de principio a fin:**
- Registro (con teléfono + prefijo obligatorio) y login
- Licitaciones: lista, licitación prioritaria (cuenta atrás si cierra en ≤48h), guardar oferta + recordatorio automático, detalle con formulario de postulación (oferta, teléfono de contacto, adjuntos)
- Ciclo de vida de la obra, con un único camino de cambio de estado (`cambiar_estado_obra()`): abierta → adjudicada → en curso → finalizada, o cancelada desde cualquiera de las tres primeras
- Progreso semanal de obra: la empresa adjudicataria registra qué se ha hecho (+ % opcional) mientras la obra está en curso; admin y empresa ven el mismo historial
- Rechazo de postulación con motivo (sugerido o libre)
- Club OH Partner: se desbloquea desde la 1ª obra completada; el nivel se calcula sobre puntos **totales** (nunca baja al canjear); recompensas con nivel mínimo; canjes gestionables por el admin
- Notificaciones: bandeja dentro de la app (campana) + **push real** al dispositivo (Expo Push Service)
- Gremios: empresas por nivel, valoración, documentos de homologación con estado editable
- Perfil (ambos roles): avatar, bio, documentos, obras completadas
- Webhooks hacia n8n/Odoo en cada evento de negocio relevante — vacíos hasta que se configure una URL
- Eliminar cuenta (in-app y por email) y política de privacidad publicada

**Seguridad revisada:** 4 agujeros de permisos encontrados y cerrados (ver migración `0016`) — el más importante, que cualquier usuario podía editar su propio rol o cambiarse de empresa.

## Para un/a desarrollador/a nuevo/a que se una al proyecto

Sigue estos pasos en orden — cada uno depende del anterior.

### 1. Acceso al repositorio de GitHub
Pídele a Ainhoa que te invite como colaborador/a en `github.com/ohcasas/OHCasas-Subcontrata` (Settings → Collaborators, desde el repo). Cuando te llegue la invitación por email, acéptala.

Luego, clona el proyecto:
```bash
git clone https://github.com/ohcasas/OHCasas-Subcontrata.git
cd OHCasas-Subcontrata
```

### 2. Herramientas necesarias en tu ordenador
- **Node.js** (versión 20 o superior) — [nodejs.org](https://nodejs.org)
- **Git**
- La app **Expo Go**, en tu móvil (Android o iOS) — para desarrollo normal, sin notificaciones push
- Si vas a compilar tú misma con EAS (no es necesario solo para programar): `npm install -g eas-cli`

### 3. Pide a Ainhoa estos 3 archivos/datos (no están en GitHub, son credenciales)
1. **`apps/mobile/.env`** — con `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
2. **`apps/mobile/google-services.json`** — solo si vas a probar notificaciones push; si no, puedes arrancar sin él.
3. **Usuario y contraseña de prueba** en la app, para poder entrar (uno de subcontratista y, si lo necesitas, uno de admin).

### 4. Instalar y arrancar
```bash
cd apps/mobile
npm install
npx expo start -c
```
Escanea el QR con Expo Go y ya deberías ver la app.

### 5. Si necesitas tocar la base de datos (Supabase)
Pídele a Ainhoa que te invite al proyecto de Supabase: dashboard de Supabase → el proyecto → **Project Settings → Team** → **Invite a team member**, con tu email. Así puedes entrar tú misma al SQL Editor, ver las tablas y ejecutar migraciones nuevas si haces alguna.

### 6. Si vas a compilar con EAS (development/preview/production builds)
El proyecto está bajo la cuenta de Expo `softwareoh`. Pídele a Ainhoa que te añada como miembro: en [expo.dev](https://expo.dev), dentro de la cuenta/organización `softwareoh` → **Settings → Members** → invitarte por tu email de Expo. Luego, en tu terminal:
```bash
eas login
```
con tu propia cuenta de Expo, ya vinculada a `softwareoh`.

### 7. Si necesitas entrar a Firebase (solo para gestionar notificaciones push)
Pídele a Ainhoa que te añada en [console.firebase.google.com](https://console.firebase.google.com), proyecto **oh-contratas** → engranaje (Configuración del proyecto) → **Usuarios y permisos** → añadir tu email de Google.

## Configuración necesaria

`apps/mobile/.env` (no está en el repo):
```
EXPO_PUBLIC_SUPABASE_URL=<url del proyecto Supabase>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto Supabase>
```

`apps/mobile/google-services.json` tampoco está pensado para ir al repo público si en algún momento se abre — no es secreto (identifica la app, no autoriza nada), pero es buena práctica mantenerlo fuera igualmente. Si el repo es privado, no hay problema en incluirlo.

Credenciales de Supabase, Firebase y EAS compartidas por canal separado.

## Cómo arrancar

**Desarrollo normal (sin notificaciones push):**
```bash
cd apps/mobile
npm install
npx expo start -c
```
Escanear el QR con Expo Go.

**Con notificaciones push** (Expo Go no las soporta desde la SDK 53): hace falta una *development build* instalada en el móvil una vez (`eas build --profile development --platform android`), y luego:
```bash
npx expo start --dev-client -c
```

**Compilar una versión para probar sin depender del ordenador** (todo el código va dentro del instalable):
```bash
eas build --profile preview --platform android
```

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
| 16 | `0016_fase_a_notificaciones_puntos_seguridad.sql` | Notificaciones, guardar ofertas, motivo de rechazo, puntos desde la 3ª obra, rango por puntos totales, recompensas por nivel, gestión de canjes, **4 agujeros de seguridad cerrados** |
| 17 | `0017_cron_recordatorios.sql` | Programa (`pg_cron`) el envío horario de recordatorios de ofertas guardadas |
| 18 | `0018_webhooks_n8n.sql` | Webhooks salientes hacia n8n/Odoo |
| 19 | `0019_avances_obra.sql` | Progreso semanal de obra |
| 20 | `0020_push_tokens.sql` | Token de push por dispositivo + envío real vía Expo Push Service |
| 21 | `0021_puntos_desde_primera_obra_y_borrado_cuenta.sql` | Los puntos y el desbloqueo del Club Partner pasan de exigir 3 obras a exigir 1 (decisión de Ainhoa); función `eliminar_mi_cuenta()` (borrado de cuenta, requisito de Google Play) |

Si `0017` o `0018` fallan porque `pg_cron` o `pg_net` no están activas: Database → Extensions en Supabase, activarlas, y volver a ejecutar solo ese archivo.

Opcionalmente, los `seed_*.sql` para datos de prueba.

## Pendiente antes de publicar en Google Play

1. **Notificaciones push**: subir la clave de servicio de Firebase a EAS — en marcha.
2. ~~Borrado de cuenta~~ — hecho: botón "Eliminar mi cuenta" en Perfil (subcontratista) + página web para quien no tenga la app instalada: https://claude.ai/artifact/SR5xssqbVJsPtunUBBJnra
3. ~~Política de privacidad~~ — hecho, publicada en: https://claude.ai/artifact/VdKDRxLv4P9Mbz56U8R5DF (contacto de ejemplo `privacidad@ohcasas.es` — confirmar que es el email real que se quiere usar, o cambiarlo)
4. ~~Cuenta de organización en Play Console~~ — hecho.
5. ~~Tabla de configuración de niveles del Club Partner~~ — decisión: se queda tal cual (hardcodeado en `constants/niveles.ts` + SQL), no se construye una tabla editable.
6. **Recuperar contraseña**: sigue sin existir ninguna vía dentro de la app — solo se puede restablecer manualmente desde el panel de Supabase.
7. Pase final de QA end-to-end antes de abrir la app al público.

## Límites conocidos, aceptados por ahora

- Si dos personas inician sesión en el mismo móvil, el token de push de ese dispositivo queda asociado a ambas — las dos recibirían los avisos. Poco probable en el uso real (cada empresa con su propio móvil).
- Al eliminar una obra, los archivos ya subidos a Storage (fotos, adjuntos) no se borran — quedan huérfanos en el bucket, sin coste funcional.
- El icono principal se generó a 512×512 y se escaló a 1024×1024; para máxima nitidez en el futuro, lo ideal sería un rediseño nativo a esa resolución.

## Usuarios de prueba

- Subcontratista: perfil vinculado a "Empresa de Prueba SL"
- Admin: perfil con `role='admin'`, sin `empresa_id`

(Credenciales de acceso compartidas por canal separado.)