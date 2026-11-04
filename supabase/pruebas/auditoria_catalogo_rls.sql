-- AUDITORÍA DE SEGURIDAD DEL CATÁLOGO (solo lectura, no modifica nada).
-- Ejecutar en el SQL Editor del proyecto de PRUEBAS tras aplicar las migraciones.
-- Es un script NUEVO: no sustituye a los antiguos prueba_seguridad_1/2 (nunca estuvieron en Git).
-- Resultado esperado: las consultas 1, 2 y 3 sin filas. La 4, la 5 y la 6 son informativas.

-- 1) Tablas de "public" sin RLS activado (esperado: ninguna)
select 'SIN RLS' as problema, c.relname as objeto
from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and not c.relrowsecurity order by 2;

-- 2) Funciones SECURITY DEFINER ejecutables por visitantes sin sesión (anon) (esperado: ninguna)
select 'ANON PUEDE EJECUTAR' as problema, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as objeto
from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and p.prorettype<>'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute') order by 2;

-- 3) SECURITY DEFINER sin search_path fijado (esperado: ninguna)
select 'SIN SEARCH_PATH' as problema, p.proname as objeto
from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
  and (p.proconfig is null or p.proconfig::text not like '%search_path%') order by 2;

-- 4) (informativo) Funciones SECURITY DEFINER que comprueban el rol con "not in (...)", patrón que se salta
--    la comprobación cuando el rol es NULL. Revisar que ninguna sea ejecutable por anon (consulta 2).
select 'PATRON NOT IN (revisar)' as problema, p.proname as objeto
from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
  and pg_get_functiondef(p.oid) ~* 'auth_role\(\)\s+not\s+in' order by 2;

-- 5) (informativo) Privilegios de escritura de anon sobre tablas de precios. Supabase concede privilegios por defecto;
--    lo que bloquea la escritura es RLS (consulta 6). Debe haber filas aquí y, aun así, fallar cualquier escritura de anon:
--    se comprueba a mano en PRUEBAS_MANUALES.md (bloque B).
select 'ESCRITURA DIRECTA' as problema, table_name||' · '||grantee||' · '||privilege_type as objeto
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon')
  and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  and table_name in ('precios_referencia','precios_fuentes','coeficientes_precio','reglas_comision','ajustes_precios',
                     'importaciones_precios','calculos_precio','geo_comunidades','geo_provincias','geo_municipios')
order by 2;

-- 6) (informativo) Seguridad de las tablas de precios: debe haber políticas solo para admin
select tablename, policyname, cmd, roles from pg_policies
where schemaname='public' and tablename in ('precios_referencia','precios_fuentes','coeficientes_precio','reglas_comision','ajustes_precios','importaciones_precios','calculos_precio')
order by tablename, cmd;