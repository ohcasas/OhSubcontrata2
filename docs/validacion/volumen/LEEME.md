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
| Duplicadas exactas de una válida | 6 % | **Se omiten** y se avisa: «N fila(s) repetidas…» (misma fuente, partida, unidad, lugar, fecha y precio) |
| Lugar inexistente («Atlantis») | 4 % | Error «no reconozco …» |
| Ambigua («Moya») | 2 % | Error «Hay varios municipios llamados …» |
| Fuente sin licencia (CYPE) | 4 % | Error de licencia |
| Precio no numérico | 3 % | «precio no válido» |
| Fecha no válida | 3 % | «fechas no válidas» |
| Desglose mayor que el total | 3 % | Error de desglose |
| Fuente inexistente | 2 % | Error «la fuente … no existe» |

Resultado esperado y comprobado (4.850 filas): se importan 3.500, se omiten 300 repetidas y se rechazan 1.050 con motivo. Al reimportar el mismo archivo: 0 nuevas, 3.800 repetidas y el botón de importar desactivado. Mismo precio con otra fecha, o mismo texto con otro precio, NO cuenta como repetida. En local: análisis ≈6 s, guardado ≈2 s; en el Supabase de Docker de Ainhoa, guardado ≈3 s. **Repetir en el proyecto de pruebas real (latencia de red distinta) y anotar tiempos.**

Límites conocidos: el aviso de errores muestra las 40 primeras y el lote guarda las 200 primeras; el guardado va en bloques de 200 sin transacción única (si un bloque falla, los anteriores se conservan y el lote queda anotado como «Interrumpida»).