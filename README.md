# OH Conecta

Plataforma móvil de OH Casas Modulares que conecta a todo el sector de la construcción: **oficios (subcontratas), promotores, constructoras, arquitectos, proveedores, profesionales técnicos, administraciones y personas que recomiendan clientes**. Nació como un portal de subcontratistas y ha ido creciendo hacia un intermediario entre todos ellos.

**Estado**: app publicada en pruebas en Google Play; versiones en revisión. El nombre que se ve dentro de la app es **OH Conecta**, pero la ficha de Play Store sigue llamándose "OH Contratas" (ese texto se edita a mano en Play Console, no cambia con una compilación).

## Modelo de negocio

| Quién | Cómo aporta dinero | Estado |
|---|---|---|
| **Promotor, Constructora, Arquitecto, Proveedor, Profesional, Administrador** | Suscripción mensual | **Decidido, no cobrado todavía.** De momento todo es gratis (decisión de Dirección: gratis al lanzar, suscripción más adelante). Precios provisionales: **6,90 €/mes** (Arquitecto, Proveedor, Profesional), **19,90 €/mes** (Inmobiliaria/Administrador) y **49,90 €/mes** (Promotor, Constructora), con **precio fundador de 19,90 € durante 12 meses** para las primeras (ver "Suscripciones y Stripe"); sin confirmar si incluyen IVA |
| **Oficios** (subcontratistas) | Comisión por obra trabajada | Decidido, **no construido** |
| **Quien recomienda un cliente** | *Cobra* una comisión: **2 %** (Recomendador e Inmobiliaria/Administrador) o **1 %** (Oficios) sobre el precio de venta al cliente final, sin IVA | Construido; el pago real se hace fuera de la app |

## Stack

- **Frontend**: React Native + Expo (SDK 57), NativeWind/Tailwind, React Navigation v7, DM Sans
- **Backend**: Supabase (Postgres + Auth + Storage), RLS en todas las tablas y la lógica de negocio en funciones `security definer`, no en el cliente
- **Email transaccional**: Resend (dominio `ohcasas.es` verificado) como SMTP personalizado de Supabase Auth
- **Notificaciones push**: Expo Push Service (Firebase Cloud Messaging por debajo) + `pg_net` desde la base de datos
- **Automatización**: webhooks salientes hacia n8n/Odoo (`disparar_webhook()`), listos para conectar
- **Pagos**: Stripe previsto para las suscripciones; **no conectado** (ver "Suscripciones y Stripe")
- **Compilación**: EAS Build (cuenta `softwareoh`), perfiles `development` / `preview` / `production`
- **Monorepo**: `apps/mobile/`, `supabase/`, `packages/shared-types/`

## Identificadores del proyecto

- **Nombre de paquete (Android/iOS)**: `es.ohcasas.subcontratas`. **No cambiarlo nunca**: está ligado a la ficha de Play Console y a la keystore de firma. Se intentó pasar a `com.ohcasas.contratas` y hubo que revertirlo; si vuelve a parecer necesario, antes hay que comprobar en Play Console qué paquete tiene de verdad la ficha.
- **Keystore de firma de Android**: ya existe en EAS (`eas credentials` → Android → production). **Si EAS pregunta "¿generar una keystore nueva?", la respuesta es siempre No**: una nueva obligaría a pedir a Google un restablecimiento de clave de subida.
- **Proyecto de Firebase**: `oh-contratas`. El `google-services.json` del repo tiene que llevar `"package_name": "es.ohcasas.subcontratas"`; si no coincide con `app.config.ts`, la compilación falla o las push dejan de funcionar.
- **Cuenta/proyecto EAS**: `softwareoh/oh-casas-subcontratas`
- **Proyecto de Supabase**: `vvghqtwwrwdtekropavo` (ojo: no confundir con `vvghqtwwwdtekropavo`, una letra de diferencia que costó horas de depuración)

## Tipos de cuenta

El campo `profiles.role` decide qué ve cada persona. Hay 8 tipos que se registran solos (pantalla "¿Qué quieres hacer?") y 2 de personal de OH que se crean a mano.

| Perfil (`role`) | Pestañas | Qué hace |
|---|---|---|
| **Oficios** (`subcontratista`) | Obras, Postulaciones, Tablón, Recomienda, Partner, Perfil | Licitaciones (de OH y de promotoras/constructoras), postulaciones, obras con progreso semanal, Club OH Partner. Leen el Tablón. También pueden recomendar clientes |
| **Recomendador** (`referidor`) | Recomienda, Perfil | Recomienda clientes y sigue su estado; su Perfil resume actividad y comisiones |
| **Promotor, Constructora** | Licitaciones, Tablón, Directorio, Perfil | **Publican licitaciones** a las que se postulan los oficios, adjudican y siguen la obra; además publican necesidades en el Tablón |
| **Inmobiliaria / Administrador** (`administrador`) | Tablón, Directorio, Recomienda, Perfil | Publican avisos y oportunidades. **Las inmobiliarias se registran con este tipo**: pagan suscripción y además recomiendan clientes y cobran la comisión (2 %) |
| **Arquitecto, Proveedor, Profesional** | Tablón, Directorio, Perfil | Crean su ficha en el Directorio para que los encuentren |
| **Admin / superadmin** (personal de OH) | Obras, Postulaciones, Gremios, Recompensas, Conecta, Perfil | Gestión completa. **No es lo mismo que el perfil "Administrador"** de arriba (instituciones) |

Notas para quien programe:

- Los 6 perfiles de OH Conecta ven **Tablón y Directorio completos**; lo que cambia es qué pueden *publicar* (ver `TablonScreen` y `DirectorioScreen`). El Administrador (inmobiliarias) tiene además la pestaña Recomienda.
- El Perfil se adapta al tipo de cuenta: `PerfilScreen` pinta lo común y `PerfilPorRol` lo específico (comisiones del recomendador, publicaciones del Tablón, resumen de la ficha). Las cifras de obras, la homologación y la documentación son solo de Oficios.
- **Todas las cuentas crean una fila en `empresas_subcontratistas`**, aunque no sean subcontratistas (el nombre de la tabla es histórico). `GremiosScreen` descarta las que pertenecen a otros perfiles; cualquier pantalla nueva que liste "empresas" debería hacer lo mismo.
- `profile_roles` (varios roles por persona) existe pero **todavía no se usa**: hoy cada persona tiene un único rol.

## Estructura del repo

```
oh-casas-subcontratas/
├── apps/mobile/
│   ├── app.config.ts          # nombre, icono, splash, paquete, EAS projectId, plugins
│   ├── eas.json                 # perfiles de build + variables de entorno de respaldo
│   ├── google-services.json    # Firebase, para push en Android
│   ├── tailwind.config.js      # escala de color y tipografía — fuente única de estilos
│   ├── src/
│   │   ├── design-system/tokens.js
│   │   ├── constants/          # niveles.ts, enlaces.ts (páginas legales), perfiles.ts, stripe.ts
│   │   ├── utils/              # plazos.ts, moneda.ts (euros sin Intl), texto.ts (búsqueda sin tildes)
│   │   ├── services/           # supabase.ts, storage.ts, pushNotifications.ts, catalogoRegistro.ts
│   │   ├── navigation/         # RootNavigator (decide qué ve cada rol), AuthStack,
│   │   │                       #   SubcontratistaTabs, ReferidorTabs, ConectaTabs, AdminTabs
│   │   ├── components/         # ScreenHeader, AnimatedTabBar, BuscadorFiltros,
│   │   │                       #   CamposDinamicos, AvisoDocumentos (formularios por perfil),
│   │   │                       #   TarjetaComisionFlotante, CampanaNotificaciones...
│   │   └── screens/
│   │       ├── auth/           # Login, RecuperarPassword, ElegirTipoCuenta, Registro, RegistroReferidor, RegistroEmpresa
│   │       ├── obras/ postulaciones/ partner/ notificaciones/
│   │       ├── recomienda/     # envío y seguimiento de clientes recomendados
│   │       ├── conecta/        # Tablón y Directorio
│   │       ├── perfil/         # PerfilScreen + PerfilPorRol
│   │       └── admin/          # Obras, Postulaciones, Gremios, Recompensas, Conecta (+ Secciones), Referidos, Perfil
│   └── assets/branding/
├── docs/                       # páginas legales públicas (GitHub Pages)
├── supabase/
│   ├── migrations/             # 0001 → 0031
│   └── seed_*.sql
└── packages/shared-types/
```

## Qué funciona hoy

**Oficios**

- Licitaciones (con prioridad si cierran en ≤48 h), guardar oferta con recordatorio, postulación con oferta, teléfono y adjuntos
- Ciclo de la obra con un único camino de cambio de estado (`cambiar_estado_obra()`): abierta → adjudicada → en curso → finalizada, o cancelada
- Progreso semanal de obra, visible para la empresa y para el admin
- Club OH Partner: se desbloquea desde la 1ª obra completada; nivel por puntos totales; recompensas por nivel; canjes gestionados por el admin

**OH Recomienda** (lo tienen Oficios, Recomendador e Inmobiliaria/Administrador; a nivel de base de datos cualquier cuenta con sesión podría recomendar)

- Botón "Conozco a alguien que quiere construir", con consentimiento obligatorio de la persona referida
- Pipeline de 7 estados + descartado: `enviado → contactado → visita → presupuesto → reserva → venta → comisión disponible`
- Al pasar a `venta` (el admin indica el precio de venta sin IVA) se calcula sola la comisión y se avisa por notificación
- La persona acepta la comisión desde una **tarjeta flotante** que aparece sobre cualquier pantalla (`aceptar_recompensa_referido()`)
- Los porcentajes viven en la tabla editable `reglas_recompensa_referido`, no en el código

**OH Conecta**

- **Tablón**: necesidades (promotor/constructora) y avisos (administrador); los autores pueden borrar lo suyo desde su Perfil
- **Directorio**: una ficha por proveedor/arquitecto/profesional
- Buscador (sin distinguir mayúsculas ni tildes) y filtros por tipo en ambos

**Licitaciones de terceros** (promotoras y constructoras, pestaña *Licitaciones*)
- Publican una licitación (título, presupuesto, especialidad, ubicación, requisitos, días abierta); los oficios la ven en su pestaña *Obras* y se postulan como a las de OH
- Ven las postulaciones (oferta, teléfono, adjuntos, y de la empresa: especialidad, homologación, valoración, obras en OH), **adjudican o rechazan con motivo**, y llevan la obra: *en curso*, *finalizada* o *cancelada*
- Les avisan de cada postulación nueva; a las empresas, de si las aceptan, rechazan o cancelan
- **No dan puntos del Club ni cuentan como obra completada** (evita que alguien se invente obras para generar premios a cargo de OH). Lo de OH funciona exactamente como antes
- Las funciones del dueño son aparte de las de admin (`aceptar_postulacion`, `cambiar_estado_obra`, sin tocar). El dueño no lee las tablas de postulaciones ni de empresas: ve lo necesario a través de funciones

**Verificación de cuentas** (todos los perfiles, Oficios incluidos)
- Una cuenta **nueva nace pendiente** y, al iniciar sesión, solo ve una pantalla de "Estamos revisando tu cuenta". Las cuentas que ya existían al aplicar la migración quedaron verificadas
- **El bloqueo está en la base de datos**, no solo en la pantalla: una cuenta pendiente o suspendida no lee licitaciones (con los presupuestos de OH), Tablón ni Directorio, ni publica, ni se postula, ni recomienda, aunque llame a la API a mano
- El admin **verifica, rechaza, suspende y reactiva** desde Conecta → Cuentas (los pendientes salen primero, con un contador en la pestaña). Suspender cierra las sesiones, impide volver a entrar (`auth.users.banned_until`) y **oculta lo que esa cuenta había publicado** (Tablón, ficha, licitaciones abiertas); las licitaciones en marcha siguen visibles para las empresas implicadas
- Todo cambio queda en `cuenta_historial` (quién, cuándo, motivo) y la persona recibe un aviso (notificación y push)
- Nadie puede aprobarse a sí mismo: los usuarios solo editan 4 columnas de su perfil (`0016`). Un admin no puede cambiar su propia cuenta ni la de otro admin
- **Aviso a los admin**: al registrarse una cuenta pendiente, cada admin recibe una notificación y un push ("Nueva cuenta por verificar" / "N cuentas por verificar"), como mucho uno cada 15 minutos por admin para que nadie pueda llenar el móvil registrando cuentas falsas. Salta al registrarse, aunque la persona aún no haya confirmado el correo (esas cuentas no pueden ni iniciar sesión). Además se dispara el webhook `cuenta.pendiente` (hacia n8n/Odoo, si hay URL configurada). Si falla el aviso o el webhook, el registro no se bloquea
- **Indicador de CIF/NIF/NIE** en cada tarjeta del panel (`utils/documentoFiscal.ts`): dice si el número tiene un formato válido (letra o dígito de control correctos). No comprueba que la empresa exista
- **Bloqueo por tabla**: `avances_obra` y `canjes` rechazan escrituras de cuentas pendientes o suspendidas con un disparador, así que cubre cualquier función que escriba ahí, la de hoy y las futuras. Sin sesión de usuario (backend, n8n, SQL Editor) no se aplica
- **Alta por perfil**: cada tipo de cuenta tiene su propio formulario (un arquitecto pide nº de colegiado y colegio; una constructora, su inscripción en el REA...). Los campos de cada perfil vienen de la tabla `campos_registro` y la app los pinta sola (`CamposDinamicos`); el CIF/NIF/NIE se valida al registrarse. Los datos se guardan en `datos_registro` y el admin los ve en su tarjeta
- **Documentación obligatoria**: tras confirmar el correo, la pantalla de "en revisión" pide los documentos de su perfil (`documentos_requeridos`) y deja subir cada uno (PDF o foto, hasta 10 MB) a un almacén **privado**. El admin los abre, y aprueba o rechaza cada uno con motivo (le llega a la persona). **Verificar una cuenta nueva exige tener aprobados los documentos obligatorios**; el admin puede saltárselo escribiendo el motivo, que queda en el historial. Reactivar una cuenta que ya estuvo verificada no los vuelve a pedir
- **Por qué en dos tiempos**: al registrarse la persona aún no ha confirmado el correo, no tiene sesión y el almacén no admite subidas; por eso los datos se piden en el alta y los documentos al iniciar sesión por primera vez
- **Borrar la cuenta no deja documentos**: la base de datos no puede borrar archivos del almacén (Supabase lo bloquea desde SQL), así que la app lo hace en orden: `comprobar_eliminacion_cuenta()` (que ejecuta las reglas de borrado y lo deshace todo), borrar los archivos de la persona, y `eliminar_mi_cuenta()`

**Admin de OH** — pestaña **Conecta**, con cinco secciones: Recomendaciones (mover el pipeline), **Comisiones** (lo que se debe y marcar como pagado, con aviso a la persona), Cuentas (verificar, rechazar, suspender y reactivar, por estado y por perfil), Tablón y Directorio (ver y quitar lo que no deba estar). Gremios solo lista Oficios.

**Común a todos**: registro con confirmación de email (Resend), recuperar contraseña por email, notificaciones dentro de la app y push reales, eliminar cuenta (desde la app o desde la web), importes siempre en euros, webhooks hacia n8n/Odoo (vacíos hasta configurar una URL).

### Cambios de estado de una recomendación: confirmación, historial y diagnóstico

Cada cambio de estado **avisa a quien envió la recomendación**, y el único camino que lo hace es `actualizar_estado_referencia()` (solo admin), que solo lanza la pantalla de Recomendaciones del panel al tocar una píldora. No hay tareas programadas ni automatismos que cambien estados.

- **Confirmación**: tocar una píldora pregunta antes ("¿Pasar la recomendación de «X» a «Y»? Se avisará a ..."), para que un roce al desplazar la lista no cambie nada ni mande avisos por error
- **Historial**: cada cambio queda en `referencias_historial` (de cuál a cuál, quién, cuándo) y cada tarjeta del panel muestra "Último cambio: ... · fecha · quién"
- **Con comisión generada, no se retrocede**: una recomendación que ya tiene comisión solo puede estar en `venta` o `comision_disponible` (no se puede volver a "Visita" ni descartarla)

Si llegan avisos que parecen ocurrir solos, en el SQL Editor (las horas salen en **UTC**: en octubre, las 13:02 de Madrid son las 11:02):

```sql
-- ¿Cuándo se crearon de verdad los avisos? (si es mucho antes de cuando sonaron, el móvil los recibió tarde)
select created_at, titulo, cuerpo from notificaciones
where tipo = 'referencia_actualizada' order by created_at desc limit 20;

-- ¿Quién cambió cada estado y cuándo? (solo hay datos desde la migración 0037)
select h.created_at, r.nombre_cliente, h.estado_anterior, h.estado_nuevo, p.nombre_completo, p.email
from referencias_historial h
join referencias_comerciales r on r.id = h.referencia_id
left join profiles p on p.id = h.cambiado_por
order by h.created_at desc limit 30;
```

Si los avisos llegan **todos juntos y tarde** en móviles Xiaomi/Redmi/POCO, suele ser el ahorro de batería del fabricante: Ajustes → Aplicaciones → OH Conecta → Ahorro de batería → «Sin restricciones», y activar el inicio automático.

## Qué se pide a cada perfil, y cómo cambiarlo

Los campos del formulario y los documentos de cada perfil son **datos, no código**: se cambian desde el SQL Editor de Supabase y la app los recoge al momento, sin recompilar. Los valores de partida (migración `0036`) son una propuesta y conviene validarlos con una gestoría. Volver a ejecutar la migración **no pisa** lo que hayas editado.

```sql
-- Ver qué se pide hoy a un perfil
select clave, etiqueta, obligatorio from campos_registro where role = 'arquitecto' order by orden;
select tipo, etiqueta, obligatorio from documentos_requeridos where role = 'arquitecto' order by orden;

-- Hacer obligatorio (o no) un campo o un documento
update campos_registro set obligatorio = true where role = 'arquitecto' and clave = 'zona';
update documentos_requeridos set obligatorio = false where role = 'constructora' and tipo = 'seguro_rc';

-- Pedir un documento nuevo a un perfil (tipo = nombre corto sin espacios)
insert into documentos_requeridos (role, tipo, etiqueta, descripcion, obligatorio, orden)
values ('proveedor', 'seguro_rc', 'Seguro de responsabilidad civil', 'Póliza vigente o justificante de pago.', true, 30);

-- Pedir un campo nuevo (tipo 'texto' o 'seleccion'; en 'seleccion', opciones es una lista JSON)
insert into campos_registro (role, clave, etiqueta, tipo, opciones, obligatorio, orden)
values ('promotor', 'sector', 'Sector', 'seleccion', '["Residencial","Industrial"]', false, 60);
```

Perfiles: `arquitecto`, `profesional`, `promotor`, `constructora`, `proveedor`, `administrador` (inmobiliarias), `subcontratista` (Oficios). `referidor` no pide nada. Las claves `nombre_empresa` y `cif` son especiales: viajan aparte, porque las leen los disparadores de registro de siempre. Cambiar lo que se pide **no afecta a las cuentas ya verificadas**.

## Suscripciones y Stripe

Preparado, **no conectado**:

- Cada cuenta de los 6 perfiles de pago nace con una fila en `suscripciones` en estado `pendiente_pago` y **sin precio** (se calcula al activar el cobro). **No bloquea nada**: bloquear antes de poder cobrar dejaría a la gente sin forma de pagar ni de entrar.
- El precio mensual de cada rol vive en `precios_suscripcion` (provisional, ver arriba).
- **Precio fundador**: las primeras *N* cuentas de promotor/constructora, **por orden de registro**, pagan `precio_fundador` durante `meses` meses **contados desde que empiece el cobro** (no desde el registro, para que el periodo gratuito no se lo coma). Vive en `programa_fundador`, y `precio_aplicable(profile_id)` calcula qué le toca a cada cuenta. El número de plazas está **vacío a propósito** (programa inactivo = todos a precio estándar): **hay que fijarlo antes de activar el cobro** con `update programa_fundador set plazas = N;`. Si una cuenta se da de baja antes de cobrar, la siguiente sube un puesto.
- La clave pública de Stripe está en `constants/stripe.ts` (no es secreta). **La clave secreta nunca va en la app ni en el repo**: cuando toque conectar, se pone como variable de una Edge Function de Supabase.
- Falta: al activar una suscripción, guardar el resultado de `precio_aplicable()` en `suscripciones.precio_mensual` y la fecha de fin del precio fundador (inicio del cobro + `meses`); la Edge Function que hable con Stripe, el webhook de eventos de suscripción, el SDK `@stripe/stripe-react-native` (librería nativa → exige compilar de nuevo) y la pantalla de pago.

## Páginas legales públicas

Publicadas con GitHub Pages desde este mismo repo (es público), carpeta `docs/`:

| Página | URL |
|---|---|
| **Portada de la app** (informativa) | `https://ohcasas.github.io/OhSubcontrata2/` (es `docs/index.html`) |
| Política de privacidad | `https://ohcasas.github.io/OhSubcontrata2/privacidad.html` |
| Eliminar cuenta (sin la app instalada) | `https://ohcasas.github.io/OhSubcontrata2/eliminar-cuenta.html` |
| Aviso legal | `https://ohcasas.github.io/OhSubcontrata2/aviso-legal.html` |
| Términos y condiciones | `https://ohcasas.github.io/OhSubcontrata2/terminos.html` |
| Confirmación de registro (destino del email de Supabase) | `https://ohcasas.github.io/OhSubcontrata2/confirmado.html` |
| Nueva contraseña (destino del enlace de recuperar contraseña) | `https://ohcasas.github.io/OhSubcontrata2/nueva-contrasena.html` |

Las dos primeras están puestas en Play Console. Privacidad, aviso legal y términos se enlazan desde dentro de la app (Login, las tres pantallas de registro y Perfil); "Eliminar cuenta" es un botón del Perfil. Tras editar un HTML de `docs/` hay que hacer `git push`; GitHub Pages tarda 1-2 minutos.

Los cuatro textos legales se actualizaron en octubre de 2026 para OH Conecta (perfiles nuevos, Tablón y Directorio públicos, clientes recomendados, comisiones, precio del servicio). Son un **borrador redactado sin asesoría legal**: ver "Pendiente". `nueva-contrasena.html` no es un texto legal: es la página donde se escribe la contraseña nueva (habla directamente con Supabase, sin librerías).

### La portada (`docs/index.html`)

Una sola página informativa, **un único archivo** sin nada externo: la fuente (DM Sans, la de la app) y el logo van incrustados, no hay cookies ni analítica ni peticiones a terceros, así que no necesita aviso de cookies. Enlaza a las páginas legales de esta misma carpeta con rutas relativas (`privacidad.html`...), así que **no cambies sus nombres**.

- **Enlace de Google Play**: al final del archivo, en `ENLACE_GOOGLE_PLAY`, entre las comillas. Mientras esté vacío los botones dicen "Próximamente en Google Play"; al pegarlo, pasan solos a "Descargar en Google Play".
- **Textos**: están en el cuerpo, en lenguaje normal. Tres afirmaciones hay que mantenerlas al día a mano: "de momento, solo para Android" (la nota de la portada y una pregunta frecuente), "durante el lanzamiento es gratis" (tiene que coincidir con el apartado 7 de los términos) y la lista de lo que hace cada perfil (tiene que coincidir con la app).
- **No lleva precios ni porcentajes de comisión**, a propósito, hasta que estén decididos.
- **Estilo "liquid glass"** (cristal translúcido, como iOS): la barra flotante, las etiquetas del plano, los paneles de perfiles y preguntas, los botones y los avisos. El cristal solo luce sobre un fondo con color, por eso la portada y las secciones llevan resplandores azules detrás. Se controla con las variables del principio del CSS (`--filtro`, `--c-claro`, `--c-oscuro`, `--c-nav`...). Si el navegador no lo soporta, o la persona pide menos transparencia en su móvil, **todo pasa solo a fondos sólidos** igual de legibles.
- **No subas el desenfoque de la barra flotante por encima de unos 20 px** (`--filtro-nav`): en Chrome, un radio grande en una caja fina refleja los bordes y deja ver *más* lo que hay detrás, no menos. El tinte de la barra (`--c-nav`) tampoco conviene aclararlo: sobre las secciones claras, por debajo de ~0,8 el texto blanco pierde contraste.
- **Contenido de la portada** (en este orden): qué es OH Conecta y las seis herramientas de la app; ocho fichas de perfil (qué puede hacer, qué ve al entrar y qué se le pide para registrarse); cómo empezar; una licitación paso a paso; una recomendación paso a paso; los avisos de ejemplo; privacidad de los documentos; once preguntas frecuentes. **Cada nodo del dibujo de la portada lleva a la ficha de su perfil** (`#promotor`, `#constructora`, `#arquitecto`, `#profesional`, `#proveedor`, `#oficios`, `#inmobiliaria`, `#recomendador`), y también funcionan enlaces directos como `…/#inmobiliaria`.
- **Qué hay que mantener al día a mano**: las fichas ("Qué te pedimos para entrar") copian lo que pide la app al registrarse, que vive en las tablas `campos_registro` y `documentos_requeridos` de Supabase (migración `0036`): si cambias allí lo que se pide, cámbialo aquí. Igual con los pasos de licitación (migración `0033`), los estados de una recomendación (`0024`, `0032`) y los avisos de ejemplo (`0032`, `0033`, `0034`).
- **Animaciones**: señales que viajan por las líneas del dibujo, ondas en los puntos, resplandores que se desplazan, bloques que aparecen al bajar, avisos que llegan uno a uno, línea de la licitación que se dibuja, estados de la recomendación que se encienden y el menú que marca en qué sección estás. Todo se desactiva solo si la persona tiene activado "reducir movimiento" (la clase `anim` de `<html>` la pone el script del principio). Las clases son: `rev` (un bloque aparece al entrar en pantalla), `esc` (cada hijo aparece cuando entra él), `seq` (los hijos aparecen en orden al entrar el bloque) y `av` (los avisos).
- **Dos trampas que ya nos hemos encontrado** (no las repitas): (1) las animaciones de entrada se aplican **por elemento** y no por lista: si una ficha esperaba a que le tocara su turno, quien llegaba a ella con un enlace aterrizaba en un hueco vacío; ahora llegar a un destino lo muestra al instante. (2) **No pongas `filter` (ni `opacity` fija) en un bloque que tenga cristal dentro**: el desenfoque de lo de dentro deja de ver lo que hay detrás.
- **Sección "Te avisamos en cada paso"**: los cuatro avisos son los textos reales de la app (verificación, nueva postulación, postulación aceptada, recomendación) con nombres inventados. Si cambias uno en la app (migraciones `0033`, `0034`, `0032`), cámbialo también aquí.
- **El dibujo de la portada** (los perfiles como nodos unidos al logo) es SVG a mano dentro del mismo archivo; si cambian los perfiles hay que tocarlo.
- Si algún día se añade analítica o un formulario de contacto, hay que actualizar la política de privacidad y añadir aviso de cookies.

## Para un/a desarrollador/a nuevo/a

> Ainhoa y su compañera usan el **mismo email** para todo (GitHub, Supabase, Play Console...): comparten ya el mismo acceso, sin invitaciones. Los pasos de invitación solo aplican si se incorpora alguien con un email **distinto**.

1. **Código**: pide acceso (si hace falta) a `github.com/ohcasas/OhSubcontrata2` y `git clone`.
2. **Herramientas**: Node.js 20+, Git, `npm install -g eas-cli`, y la app de desarrollo instalada en el móvil (ver "Cómo arrancar").
3. **Pide a Ainhoa**: `apps/mobile/.env`, `apps/mobile/google-services.json` y un usuario de prueba de cada tipo de cuenta que vayas a tocar.
4. **Accesos extra** (solo con email distinto): Supabase → Project Settings → Team; EAS → expo.dev → Settings → Members + `eas login`; Firebase → proyecto `oh-contratas` → Usuarios y permisos; Play Console → Usuarios y permisos.

## Configuración

`apps/mobile/.env` (no está en el repo):
```
EXPO_PUBLIC_SUPABASE_URL=https://vvghqtwwrwdtekropavo.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto>
```

Para compilar con EAS, esas dos variables están en **dos sitios**: como respaldo en `eas.json` y como fuente real en el panel de Expo (Project → Environment variables, por entorno). Si cambian, actualiza los dos: **EAS Build usa el panel**, no `eas.json`.

## Cómo arrancar

**Expo Go no vale para este proyecto** (usa notificaciones push, que necesitan código nativo). Hace falta una *development build* instalada en el móvil una sola vez:
```bash
eas build --profile development --platform android
```
Luego, para desarrollar:
```bash
cd apps/mobile
npm install
npx expo start --dev-client -c
```
y conectar desde esa app (no desde Expo Go).

**Compilar para Google Play** (desde `apps/mobile`):
```bash
eas build --profile production --platform android
```
Descarga el `.aab` desde la página del build en expo.dev y súbelo a Play Console → Pruebas (Interna / Abierta) o Producción. `eas build --profile preview` genera un `.apk` instalable directamente, útil para probar sin Play.

Qué obliga a compilar de nuevo: cambios en `app.config.ts`, librerías nativas nuevas, o querer probar en una build sin servidor de desarrollo. Cambiar solo pantallas o SQL **no** obliga a nada nuevo en la development build.

## Notificaciones push

- Firebase `oh-contratas` con la app Android registrada bajo `es.ohcasas.subcontratas`; si existe otra registrada con un paquete distinto, no se usa.
- Clave de servicio de Firebase (FCM V1) subida a EAS (`eas credentials` → Android → Push Notifications).
- `registrarPush()` guarda el token del dispositivo al iniciar sesión; `crear_notificacion()` en Supabase manda el push a través del servicio de Expo.
- La pantalla de Notificaciones está registrada para todos los perfiles que muestran la campana.
- **Un móvil, un usuario** (migración `0038`): un token de push pertenece siempre a **un solo** usuario; al guardarse, la base de datos lo borra de cualquier otro. Antes se quedaba para siempre en todas las cuentas con las que se hubiera entrado en ese móvil, así que los avisos de cualquiera de ellas llegaban aunque hubiera otra sesión abierta (o ninguna), y un evento para una empresa con varias cuentas sonaba varias veces en el mismo móvil. Además, **cerrar sesión borra el token de esa cuenta** (`services/sesion.ts`, `cerrarSesion()`): usa siempre esa función, no `supabase.auth.signOut()` a secas, salvo tras borrar la cuenta.
- Si algo suena repetido o en el móvil equivocado, en el SQL Editor:

```sql
-- ¿Hay móviles repartidos entre varias cuentas? (tras la 0038 no debería salir nada)
select right(t.token, 8) as token_termina_en, count(*) as cuentas, string_agg(p.email, ', ') as cuentas_con_este_movil
from push_tokens t join profiles p on p.id = t.user_id
group by t.token having count(*) > 1;

-- ¿Cuántos móviles tiene registrados cada cuenta? (más de uno es normal: móvil y tablet, o una reinstalación que dejó uno viejo)
select p.email, count(*) as moviles, max(t.updated_at) as ultimo_uso
from push_tokens t join profiles p on p.id = t.user_id
group by p.email order by moviles desc;
```

## Migraciones de base de datos

Ejecutar en orden desde el SQL Editor de Supabase, **cada archivo en una consulta aparte**:

| # | Archivo | Qué añade |
|---|---|---|
| 1 | `0001_init_schema.sql` | Esquema inicial: 10 tablas + RLS |
| 2 | `0002_add_imagen_obras.sql` | Columna de imagen en obras |
| 3 | `0003_canje_rpc.sql` | `solicitar_canje()` |
| 4 | `0004_registro_trigger.sql` | Alta automática de empresa + perfil al registrarse |
| 5 | `0005_aceptar_postulacion_rpc.sql` | Versión original de `aceptar_postulacion()` (superada por `0014`/`0015`, se mantiene por historial) |
| 6 | `0006_obras_fotos_storage.sql` | Bucket público `obras-fotos` |
| 7 | `0007_profiles_email.sql` | Email accesible en `profiles` |
| 8 | `0008_fix_obras_fotos_public.sql` | Corrige que el bucket no quedara público |
| 9 | `0009_profiles_bio.sql` | Bio editable |
| 10 | `0010_avatares_storage.sql` | Bucket público `avatares` |
| 11 | `0011_documentos_storage.sql` | Adjuntos de postulación + documentos de homologación (buckets privados) |
| 12 | `0012_estado_en_curso.sql` | Estado intermedio `en_curso` en las obras |
| 13 | `0013_postulaciones_telefono_contacto.sql` | Teléfono de contacto informativo por postulación |
| 14 | `0014_fix_aceptar_postulacion.sql` | Recrea `aceptar_postulacion()`, que nunca llegó a existir en el proyecto real |
| 15 | `0015_cambiar_estado_obra.sql` | `cambiar_estado_obra()`: único camino para cambiar el estado de una obra, con puntos idempotentes |
| 16 | `0016_fase_a_notificaciones_puntos_seguridad.sql` | Notificaciones, ofertas guardadas, motivo de rechazo, nivel por puntos totales, recompensas por nivel, canjes, **4 agujeros de seguridad cerrados** |
| 17 | `0017_cron_recordatorios.sql` | Recordatorios horarios (`pg_cron`) |
| 18 | `0018_webhooks_n8n.sql` | Webhooks salientes hacia n8n/Odoo |
| 19 | `0019_avances_obra.sql` | Progreso semanal de obra |
| 20 | `0020_push_tokens.sql` | Token por dispositivo + envío real de push |
| 21 | `0021_puntos_desde_primera_obra_y_borrado_cuenta.sql` | Puntos desde la 1ª obra; `eliminar_mi_cuenta()` |
| 22 | `0022_fix_seguridad_funciones_admin.sql` | **Fallo grave corregido**: la comprobación de admin se saltaba con un NULL (sin sesión). Revoca permisos a `anon`; elimina `finalizar_obra()` |
| 23 | `0023_add_rol_referidor.sql` | Rol `referidor`. **Va solo**: Postgres no deja añadir un valor de enum y usarlo en la misma transacción |
| 24 | `0024_referidos_pipeline.sql` | Pipeline de recomendaciones, comisiones por porcentaje, `profile_roles`, funciones de recomendar / avanzar / aceptar, registro de referidor |
| 25 | `0025_add_roles_oh_conecta.sql` | Los 6 roles de OH Conecta. **Va solo**, por lo mismo que el 23 |
| 26 | `0026_oh_conecta_suscripciones.sql` | `suscripciones`, `precios_suscripcion` y el registro de los 6 perfiles |
| 27 | `0027_oh_conecta_tablon_directorio.sql` | `publicaciones_tablon` y `fichas_directorio` |
| 28 | `0028_eliminar_cuenta_todos_los_perfiles.sql` | `eliminar_mi_cuenta()` para los 8 tipos de cuenta; las recomendaciones y comisiones se conservan al borrarse quien las hizo |
| 29 | `0029_seguridad_tablas_nuevas_y_pago_comisiones.sql` | Pase de seguridad de las tablas nuevas (2 fallos menores cerrados) y `marcar_recompensa_pagada()` |
| 30 | `0030_precios_suscripcion.sql` | Precios mensuales provisionales en `precios_suscripcion` y comisión del 2 % para el perfil Administrador (inmobiliarias) |
| 31 | `0031_precio_fundador.sql` | Precio fundador de promotor/constructora: `programa_fundador`, `precio_aplicable()`; el registro deja de copiar el precio |
| 32 | `0032_fix_avisos_repetidos_recomendaciones.sql` | `actualizar_estado_referencia()` solo avisa si el estado cambia de verdad; textos legibles |
| 33 | `0033_licitaciones_de_terceros.sql` | Licitaciones de promotoras y constructoras: `crear_licitacion()`, `mis_licitaciones()`, `postulaciones_de_mi_licitacion()`, `aceptar_/rechazar_postulacion_propietario()`, `cambiar_estado_licitacion()`; no se postula a la propia; el dueño ve adjuntos y progreso de lo suyo |
| 34 | `0034_verificacion_de_cuentas.sql` | **Verificación de cuentas**: `profiles.estado_cuenta` (pendiente / verificada / suspendida), `cambiar_estado_cuenta()`, `cuenta_historial`, y el bloqueo de lectura/escritura para cuentas sin verificar |
| 35 | `0035_avisos_de_cuentas_y_cierre_de_limites.sql` | Aviso (notificación y push) a los admin cuando llega una cuenta pendiente, y bloqueo por tabla (`avances_obra`, `canjes`) para cuentas pendientes o suspendidas |
| 36 | `0036_alta_por_perfil_y_documentacion.sql` | Alta por perfil: `campos_registro` y `documentos_requeridos` (editables), `datos_registro`, `documentos_cuenta` y su almacén privado; verificar una cuenta nueva exige los documentos aprobados (`cambiar_estado_cuenta` gana `p_forzar`); `comprobar_eliminacion_cuenta()` |
| 37 | `0037_historial_y_bloqueo_de_recomendaciones.sql` | `referencias_historial` (quién cambió cada estado, de cuál a cuál y cuándo; solo lo leen los admin) y bloqueo para no retroceder ni descartar una recomendación que ya tiene comisión |
| 38 | `0038_un_movil_un_usuario.sql` | Un token de push pertenece a un único usuario (disparador en `push_tokens`) y limpia los duplicados que había: los avisos de una cuenta ya no suenan en móviles donde se usó otra |

Si `0017` o `0018` fallan por `pg_cron`/`pg_net`: Database → Extensions, activarlas y repetir solo ese archivo. Los `seed_*.sql` son datos de prueba opcionales.

## Email transaccional (Resend)

- Dominio `ohcasas.es` verificado en Resend (DNS en Hostinger: 1 TXT de DKIM + 2 CNAME). Remitente: `software@ohcasas.es`. Supabase → Authentication → SMTP Settings → *Sender name* debe decir **OH Conecta**.
- El enlace de confirmación usa `emailRedirectTo` apuntando a `docs/confirmado.html`, y el de recuperar contraseña a `docs/nueva-contrasena.html`. **Las dos URLs tienen que estar en la lista blanca de Supabase** (Authentication → URL Configuration → Redirect URLs); si falta una, Supabase ignora la redirección y manda a la página por defecto. La antigua `portal-subcontratas-reset` solo sabía recuperar contraseñas y se quedaba colgada.
- **Al probar**: registrar un email que ya existe devuelve "200, todo bien" pero **no envía nada ni crea cuenta** (Supabase lo hace a propósito para no revelar qué emails están registrados). Para probar cada perfil, usa alias: `tunombre+arquitecto@gmail.com` llega a la misma bandeja y cuenta como email distinto.

## Seguridad

Revisión hecha sobre las 15 tablas originales: RLS activo en todas, políticas antiguas siempre eliminadas antes de recrearse, buckets con la visibilidad correcta, y ninguna traza de la `service_role key` en la app. La corrección más importante es la `0022`.

Las tablas de OH Conecta (`0024`-`0027`) pasaron su propio pase de seguridad en octubre de 2026. Estaban bien: RLS activo, todo exige sesión, y las tablas de recomendaciones, comisiones y suscripciones solo se escriben desde funciones `security definer` o por admin. Se cerraron dos fallos menores en `0029` (un proveedor podía guardar su ficha como "arquitecto"; un promotor podía convertir su necesidad en un "aviso"). Siguen siendo decisiones de producto, no fallos: los datos de contacto del Tablón y el Directorio los ve cualquier cuenta registrada (y registrarse es libre), y no hay límite de recomendaciones por día.

## Pendiente

**Depende de decisiones o de terceros**

1. **Revisión legal de los textos** (privacidad, términos, aviso legal). Lo más delicado: la base legal para tratar datos de **clientes recomendados** (hoy se apoya en que quien recomienda confirma el consentimiento, que es débil) y el aviso a esa persona en el primer contacto.
2. **Suscripciones con Stripe** (ver arriba). Faltan por decidir: **cuántas plazas fundador** (yo pondría entre 10 y 20), si los importes llevan IVA y el precio de Oficios si finalmente paga suscripción.
3. **Comisión por obra de Oficios**: falta decidir el porcentaje y sobre qué importe.
4. **Cómo se pagan las comisiones** de recomendación a personas particulares (factura, retención de IRPF...): decisión fiscal de OH. La app solo registra el acuerdo y, desde `0029`, que ya se ha pagado.
5. **OH Score**, **OH Wallet** e **invitaciones entre profesionales**: descritos en el documento de Dirección, sin decidir ni construir.

**Tareas manuales**

6. Añadir `https://ohcasas.github.io/OhSubcontrata2/nueva-contrasena.html` a Redirect URLs de Supabase, si no está.
7. Cambiar el nombre de la ficha en Play Console ("OH Contratas" → "OH Conecta") y el *Sender name* del email en Supabase.
8. **Play Console → Contenido de la app → Acceso a la app**: dar las credenciales de una cuenta de prueba **ya verificada** (si el equipo de revisión de Google se registra por su cuenta, se queda en "pendiente" y no puede probar nada).
9. Opcional: el aviso al móvil del admin ya funciona solo; si además se quiere correo, se puede configurar en n8n el webhook `cuenta.pendiente`.
10. **Validar con una gestoría la lista de documentos de cada perfil** (`documentos_requeridos`) y los campos (`campos_registro`): son una propuesta de partida. Y ajustar las consultas del apartado anterior si cambia algo.
11. Si OH **rechaza o elimina una cuenta desde el panel de Supabase** (no desde la app), sus archivos quedan en el almacén `documentos-verificacion`: hay que borrarlos a mano desde Storage (Supabase no deja hacerlo desde SQL).

**Mantenimiento**

8. Dependencias que `npx expo doctor` marca como ligeramente desactualizadas.

## Límites conocidos, aceptados por ahora

- Cada persona tiene **un solo rol** (`profile_roles` está preparado pero sin usar).
- **Licitaciones de terceros**: máximo 10 abiertas por cuenta; sin moderación previa (el admin las ve en *Obras* y puede cancelarlas); los oficios no saben aún, en la lista, quién las publica; no hay valoración de la empresa por el dueño ni aviso a los oficios cuando se publica una nueva; el borrado de cuenta se bloquea mientras haya una abierta o en marcha.
- Los oficios todavía no tienen ficha en el Directorio ni lo ven.
- **Verificación**: es manual (nadie comprueba el CIF automáticamente) y vale también para los Oficios nuevos, que antes entraban sin revisión. El token de una cuenta suspendida sigue siendo válido hasta 1 hora, pero todas las lecturas y escrituras están bloqueadas en la base de datos desde el primer segundo. Una cuenta suspendida con una licitación abierta no puede borrarse hasta que alguien la cancele (el admin puede desde Obras).
- **Tokens de push viejos**: al reinstalar la app queda un token antiguo en `push_tokens` (Expo lo rechaza como `DeviceNotRegistered`, pero nada lo borra todavía): no molesta, solo hace envíos inútiles
- **Documentos**: un archivo por tipo de documento (si hay que subir varias páginas, una sola foto o PDF); solo PDF, JPG, PNG y WebP, hasta 10 MB. Al sustituir un documento, el archivo anterior queda en el almacén (el borrado de cuenta lo elimina junto a los demás). Los documentos de una cuenta rechazada se conservan hasta que alguien pida borrarlos
- Sin límite de recomendaciones por usuario y día, y los datos de contacto del Tablón y el Directorio son visibles para cualquier cuenta registrada.
- El buscador del Tablón y el Directorio filtra en el móvil sobre lo ya cargado; con cientos de entradas habría que pasarlo al servidor.
- **Eliminar cuenta** está bloqueado para admin/superadmin (se dan de baja a mano) y para quien tenga una comisión pendiente o aceptada sin cobrar (el mensaje le dirige a `software@ohcasas.es`).
- Si dos personas inician sesión en el mismo móvil, el token de push queda asociado a ambas.
- Al eliminar una obra, sus archivos de Storage quedan huérfanos en el bucket.
- La pantalla de carga de Android solo puede mostrar un icono sobre un color de fondo (limitación del sistema desde Android 12).
- `Intl.NumberFormat` con moneda no es fiable en Hermes/Android (puede mostrar "$" en vez de "€"): por eso `utils/moneda.ts` formatea a mano. Por la misma razón `utils/texto.ts` quita las tildes con una tabla en vez de `normalize()`.

## Trampas conocidas

Cosas que ya han costado tiempo y conviene no repetir:

1. **Mayúsculas en los nombres de archivo**: Windows no distingue, pero EAS compila en Linux y sí. Renombrar solo la capitalización desde el Explorador no basta: Git no lo ve. Usa `git mv` y comprueba cómo está registrado con `git ls-files apps/mobile/src | findstr /i NombreArchivo`.
2. **EAS compila lo que hay en GitHub**, no lo que hay en tu ordenador. Haz `git push` antes de `eas build`.
3. **No debe existir un `app.json` junto a `app.config.ts`**: `eas credentials` y otros comandos leen solo el primero.
4. **El paquete, la keystore y `google-services.json` van juntos** (ver Identificadores).
5. **Nombres de funciones SQL y llamadas de la app**: si renombras una función en una migración, busca sus llamadas (`supabase.rpc('...')`) en la app. Ya falló una vez (`aceptar_comision_referido` → `aceptar_recompensa_referido`).
6. **Play Store sirve la versión con el número más alto** entre todas las pistas de prueba en las que esté la misma cuenta. Si una prueba abierta tiene un número mayor que la interna, instalará la abierta.
7. **En PL/pgSQL, un `IF` con condición NULL cuenta como falso**: `if auth_role() not in (...) then raise exception` no salta si no hay sesión. Comprueba `auth.uid() is null` antes.

8. **Las columnas de `profiles` que edita el usuario están limitadas con `grant update (nombre_completo, telefono, bio, avatar_url)` (0016).** Por eso `role` y `estado_cuenta` no se pueden cambiar a mano. No hagas nunca un `grant update on profiles` a secas: abriría esas dos columnas (un usuario podría ascenderse a admin o aprobarse a sí mismo).
9. **Orden al desplegar un cambio de base de datos que la app ya consulta**: primero el SQL, después la versión nueva. Si la app pide una columna que aún no existe, todos verán un error de carga.

## Usuarios de prueba

- Oficios: perfil vinculado a "Empresa de Prueba SL"
- Admin: perfil con `role='admin'`, sin `empresa_id`
- Para el resto de perfiles, crea cuentas con alias de email (ver Email transaccional)

(Credenciales compartidas por canal separado.)