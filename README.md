# Portal de Subcontratas — OH Casas Modulares

Fase 0-1: estructura del proyecto, esquema de base de datos, y scaffolding
de navegación/tokens de la app móvil. **Todavía sin pantallas reales ni
lógica de negocio** — eso es la siguiente fase.

## Decisiones tomadas hasta ahora

- **Diseño:** fuente de verdad = exportación de Stitch (`stitch-export.zip`),
  analizada en `docs/informe_tecnico_stitch_oh_casas.pdf`. El sistema de
  diseño "Modular Architectural Luxury" se tokenizará una sola vez en
  `apps/mobile` en vez de duplicarse por pantalla como en el export original.
- **Backend:** Supabase (Postgres + Auth + Storage + Row Level Security).
  Motivo: presupuesto de IT limitado en OH Casas y un único responsable de
  sistemas — evita mantener un servidor propio. Si el presupuesto cambia más
  adelante, la lógica de negocio se puede sacar a un servicio propio sin
  tocar el esquema de datos (está diseñado para eso).
- **Frontend móvil:** React Native + Expo (pendiente de confirmar en la
  siguiente fase, junto con NativeWind para portar los tokens de diseño).

## Estructura

```
oh-casas-subcontratas/
├── apps/
│   └── mobile/              # App Expo — sólo scaffolding por ahora, sin pantallas
├── supabase/
│   ├── migrations/
│   │   └── 0001_init_schema.sql   # Esquema completo (Fase 0)
│   └── config.toml
├── packages/
│   └── shared-types/        # Tipos TypeScript compartidos (placeholder)
└── docs/                    # Informe técnico y documentación de referencia
```

## Esquema de base de datos (resumen)

| Tabla | Propósito |
|---|---|
| `profiles` | Extiende `auth.users` de Supabase; rol (subcontratista/admin/superadmin) |
| `empresas_subcontratistas` | Ficha de cada gremio/subcontrata, nivel Partner, puntos |
| `documentos_homologacion` | PRL, seguro RC, altas fiscales — con vigencia |
| `obras` | Licitaciones publicadas |
| `postulaciones` / `postulacion_archivos` | Ofertas enviadas a una obra + adjuntos |
| `club_partner_movimientos` | Ledger de puntos (append-only) |
| `recompensas_catalogo` / `canjes` | Catálogo de recompensas y canjes |
| `logs_auditoria` | Auditoría — exigida por el propio diseño del panel admin |

Row Level Security activada en todas las tablas desde el primer día:
cada subcontrata sólo ve sus propios datos; los roles `admin`/`superadmin`
tienen visibilidad completa.

## Scaffolding de la app móvil (ya hecho)

- `src/design-system/tokens.ts` — colores, tipografía, espaciado y radios
  portados 1:1 desde `DESIGN.md`, más `tailwind.config.js` (NativeWind) que
  los consume, para que ninguna pantalla vuelva a declarar su propia paleta.
- `src/services/supabase.ts` — cliente de Supabase con sesión persistida en
  `expo-secure-store` (nunca AsyncStorage). Lee las credenciales de `.env`
  (ver `.env.example`); si faltan, la app falla explícitamente al arrancar.
- `src/navigation/` — `RootNavigator` (decide Auth vs. rol Subcontratista vs.
  rol Admin), `AuthStack`, `SubcontratistaTabs` (Obras/Postulaciones/Partner/
  Perfil) y `AdminTabs` (Obras/Postulaciones/Gremios/Perfil Admin).
- `src/screens/` — una pantalla placeholder por ruta (incluidas
  Postulaciones y Gremios, que no venían en el export de Stitch).
- Validado con `tsc --noEmit` sin errores antes de entregar.

## Pendiente — requiere que lo hagas tú (fuera de este chat)

1. Crear el proyecto en [supabase.com](https://supabase.com) (yo no tengo
   acceso a ese dominio desde este entorno).
2. Aplicar la migración: `supabase link` + `supabase db push`, o pegar
   `supabase/migrations/0001_init_schema.sql` en el SQL Editor del dashboard.
3. Copiar `apps/mobile/.env.example` a `apps/mobile/.env` y rellenar
   `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` con los
   valores reales (Project Settings → API).
4. `npm install` dentro de `apps/mobile/` y `npm run start` para comprobar
   que arranca (con `.env` sin rellenar, arrancará y fallará explícitamente
   con el mensaje del cliente de Supabase — es el comportamiento esperado).

## Siguiente paso de implementación

Con el proyecto de Supabase ya creado y la migración aplicada: construir las
pantallas reales (empezando por Obras Disponibles y Login) usando los tokens
y la navegación ya listos.
