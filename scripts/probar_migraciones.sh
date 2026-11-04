#!/usr/bin/env bash
# Aplica TODAS las migraciones, en orden, a un proyecto de Supabase de PRUEBAS.
# NUNCA a producción. No guarda credenciales: la URL de conexión se pasa por variable de entorno.
#
#   export TEST_DB_URL='postgresql://postgres:CONTRASEÑA@db.XXXX.supabase.co:5432/postgres'
#   export CONFIRMO_PROYECTO_DE_PRUEBAS=SI
#   bash scripts/probar_migraciones.sh
#
# Requiere: psql (cliente PostgreSQL). Solo LEE los .sql del repositorio; no los modifica.
set -u
cd "$(dirname "$0")/.."
: "${TEST_DB_URL:?Falta TEST_DB_URL (cadena de conexión del proyecto de PRUEBAS)}"
[ "${CONFIRMO_PROYECTO_DE_PRUEBAS:-}" = "SI" ] || { echo "Define CONFIRMO_PROYECTO_DE_PRUEBAS=SI para confirmar que NO es producción."; exit 2; }
HOST=$(printf '%s' "$TEST_DB_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')
echo "Destino: $HOST"
[ -n "${PRODUCCION_REF:-}" ] && printf '%s' "$HOST" | grep -q "$PRODUCCION_REF" && { echo "ABORTADO: el destino coincide con PRODUCCION_REF."; exit 3; }
read -r -p "¿Es '$HOST' un proyecto de PRUEBAS vacío o desechable? (escribe SI) " r; [ "$r" = "SI" ] || exit 4

# Estado previo: el proyecto debe estar vacío (sin tablas de 3B Conecta).
n=$(psql "$TEST_DB_URL" -Atqc "select count(*) from information_schema.tables where table_schema='public'")
[ "$n" = "0" ] || { echo "El esquema public no está vacío ($n tablas). Usa un proyecto nuevo."; exit 5; }

# Extensiones que usan las migraciones (en Supabase: Database > Extensions)
psql "$TEST_DB_URL" -qc 'create extension if not exists pg_trgm; create extension if not exists unaccent; create extension if not exists pg_net; create extension if not exists pg_cron;' || echo "AVISO: activa pg_cron y pg_net desde el panel de Supabase y repite."

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cp supabase/migrations/*.sql "$TMP"/
# 0039: en Git le falta el cierre final '$$;' (fichero truncado desde el commit 1cb268a). Se corrige SOLO en la copia temporal.
F=$(ls "$TMP"/0039_*.sql)
tail -c 20 "$F" | tr -d ' \n\r' | grep -q '\$\$;$' || { printf '\n$$;\n' >> "$F"; echo "AVISO: 0039 sin cierre; añadido '\$\$;' solo en la copia temporal (el original no se toca)."; }

# Orden natural (sort -V): evita que 007_profiles_email.sql (errata de nombre) quede detrás de la 0071.
tot=0; : > "$TMP/errores.log"
for f in $(ls "$TMP"/*.sql | sort -V); do
  b=$(basename "$f"); out=$(psql "$TEST_DB_URL" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); rc=$?
  if [ $rc -ne 0 ]; then echo "ERROR en $b"; echo "$out" | grep -E "ERROR|DETAIL|CONTEXT" | head -5; tot=$((tot+1)); echo "$b" >> "$TMP/errores.log"; else echo "ok    $b"; fi
done
echo "Migraciones con error: $tot"
echo "Siguiente paso: pegar supabase/pruebas/auditoria_catalogo_rls.sql en el SQL Editor y comprobar las consultas 1, 2 y 3 sin filas."
exit $tot