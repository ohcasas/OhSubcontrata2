# Cómo crear un proyecto de Supabase de PRUEBAS y validar 3B Conecta

Regla de oro: **nada de esto toca producción**. No uses la clave `service_role` ni la contraseña de la base de producción en ningún paso.
El proyecto de pruebas es un proyecto Supabase nuevo, vacío y desechable.

## 1. Crear el proyecto (≈10 min)
1. supabase.com → *New project*. Nombre: `3bconecta-pruebas`. Región: la misma que producción. Contraseña de base de datos nueva (guárdala solo para esta prueba).
2. *Database → Extensions*: activar `pg_cron`, `pg_net`, `pg_trgm`, `unaccent`.
3. *Project Settings → API*: copiar **Project URL** y **anon public key** (la `anon`, nunca la `service_role`).
4. *Project Settings → Database → Connection string (URI)*: copiar la cadena para usarla en el paso 2.
5. Apunta la referencia del proyecto de producción (`vvghqtwwrwdtekropavo`, la que aparece en `docs/panel/index.html`) para NO confundirla.

## 2. Aplicar las migraciones (opción A: script, recomendada)
Desde la raíz del repositorio, con `psql` instalado:

```
export TEST_DB_URL='postgresql://postgres:CONTRASEÑA@db.REFERENCIA_PRUEBAS.supabase.co:5432/postgres'
export CONFIRMO_PROYECTO_DE_PRUEBAS=SI
export PRODUCCION_REF=vvghqtwwrwdtekropavo     # el script se niega a ejecutarse si el destino coincide
bash scripts/probar_migraciones.sh
```
El script: exige que el esquema `public` esté vacío, aplica las migraciones en orden natural (`sort -V`), corrige **solo en una copia temporal** el cierre `$$;` que falta en la 0039 y se detiene mostrando el error de cada fichero que falle. Resultado esperado: `Migraciones con error: 0`.

### Opción B: a mano en el SQL Editor
Pegar cada fichero de `supabase/migrations/` en orden numérico (0001, 0002 … 0072). Ojo:
- `007_profiles_email.sql` es el 0007 con el nombre mal escrito: va entre 0006 y 0008.
- Al final de `0039_webhooks_de_recomendaciones_cuentas_y_licitaciones.sql` añade una línea con `$$;` antes de ejecutarlo (en Git está truncado; ver `MIGRACIONES_AUSENTES.md`).
- Faltan en Git: 0005, 0022 y 0061 (ver mismo documento). No hay que inventarlas.

## 3. Auditoría automática del catálogo
SQL Editor → pegar `supabase/pruebas/auditoria_catalogo_rls.sql`. Las consultas 1, 2 y 3 deben devolver 0 filas.

## 4. Datos de prueba
- Crear en *Authentication → Users* 4 usuarios (con contraseña, *Auto Confirm*): `admin@prueba.test`, `super@prueba.test`, `empresa@prueba.test`, `sub@prueba.test`.
- En el SQL Editor, asignar roles: `update profiles set role='admin' where email='admin@prueba.test';` (y `superadmin`, `empresa`, `subcontratista` según corresponda; comprueba los valores reales del enum `user_role`).
- **No cargar precios reales, no activar coeficientes ni reglas de comisión, no configurar Stripe.** Para el CSV usar solo datos ficticios (`docs/validacion/volumen/gen_csv.py`) y una fuente de prueba marcada como «licencia permitida» únicamente dentro del proyecto de pruebas.

## 5. Abrir el panel contra el proyecto de pruebas
En `docs/panel/index.html` la clave está sin rellenar (`PEGA_AQUI_TU_ANON_KEY`), así que el panel pide URL y clave y las guarda en el navegador. **No rellenes esas constantes en el fichero.**
1. Servirlo en local, no desde el dominio de producción: `cd docs/panel && python3 -m http.server 8080` y abrir `http://localhost:8080/index.html` en una ventana privada.
2. Pegar la URL y la anon key de PRUEBAS. Entrar con `admin@prueba.test`.
3. Al terminar, cerrar la ventana privada (se borra el `localStorage`).

## 6. Pruebas
Seguir `PRUEBAS_MANUALES.md` y, para volumen, `volumen/LEEME.md`. Marcar cada prueba con fecha y resultado real. Hasta completarlas, el proyecto NO está listo para producción.

## 7. Limpieza
Pausar o borrar el proyecto de pruebas al terminar.