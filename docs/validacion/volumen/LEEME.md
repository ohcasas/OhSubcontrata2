# Pruebas de volumen de la importación CSV

Generar datos ficticios (el CSV grande NO se guarda en Git):
```
psql "$TEST_DB_URL" -Atc "select codigo from geo_municipios order by random() limit 600" > codigos.txt
python3 docs/validacion/volumen/gen_csv.py codigos.txt volumen_5000.csv 5000
```
Antes: en el proyecto de PRUEBAS, en Fuentes, crear «Tarifa de proveedor» con licencia *Permitida* y «Guardar precios» marcado, y dejar «Generador de precios CYPE» bloqueada. `ejemplo_40_filas.csv` sirve para una primera prueba rápida.

| Tipo de fila generada | % | Resultado esperado |
|---|---|---|
| Válidas (municipio por código INE) | 70 % | Importadas, con `ambito_codigo` |
| Duplicadas exactas de una válida | 6 % | **Se importan** (hoy no hay detección de duplicados: ver informe) |
| Lugar inexistente («Atlantis») | 4 % | Error «no reconozco …» |
| Ambigua («Moya») | 2 % | Error «Hay varios municipios llamados …» |
| Fuente sin licencia (CYPE) | 4 % | Error de licencia |
| Precio no numérico | 3 % | «precio no válido» |
| Fecha no válida | 3 % | «fechas no válidas» |
| Desglose mayor que el total | 3 % | Error de desglose |
| Fuente inexistente | 2 % | Error «la fuente … no existe» |

Resultado en local (Postgres 16 + PostgREST, 4.850 filas): análisis 5,9 s, guardado 1,9 s, 3.800 importadas (3.500 + 300 duplicadas), 1.050 con error (los esperados), lote registrado, 0 errores de página. **Repetir en el proyecto de pruebas real (latencia de red distinta) y anotar tiempos.**

Límites conocidos: el aviso de errores muestra las 40 primeras y el lote guarda las 200 primeras; el guardado va en bloques de 200 sin transacción única (si un bloque falla, los anteriores se conservan y el lote queda anotado como «Interrumpida»).