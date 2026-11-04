#!/usr/bin/env python3
"""Genera un CSV de prueba de volumen para «Importar referencias».
Uso: python3 gen_csv.py CODIGOS_INE.txt SALIDA.csv [N=5000]
CODIGOS_INE.txt: un código INE de municipio (5 dígitos) por línea.
Los datos son FICTICIOS y solo sirven para probar la importación en un proyecto de PRUEBA."""
import sys, random
random.seed(7)
cods = [l.strip() for l in open(sys.argv[1]) if l.strip()]
out = sys.argv[2]; N = int(sys.argv[3]) if len(sys.argv) > 3 else 5000
cab = "fuente;partida_codigo;partida;especialidad;unidad;precio_unitario;precio_mano_obra;precio_materiales;ambito_tipo;ambito_valor;ambito_codigo;fecha_precio;fecha_consulta"
OK, CYPE = "Tarifa de proveedor", "Generador de precios CYPE"
filas = []; esperado = dict(validas=0, duplicadas=0, lugar_inexistente=0, ambigua=0, sin_licencia=0, precio_malo=0, fecha_mala=0, desglose=0, fuente_inexistente=0)
def valida(i, cod):
    p = round(random.uniform(5, 90), 2); mo = round(p * 0.4, 2); ma = round(p * 0.4, 2)
    return f"{OK};VOL{i:05d};Partida volumen {i%300};Pintores;m2;{str(p).replace('.',',')};{str(mo).replace('.',',')};{str(ma).replace('.',',')};municipio;;{cod};2026-10-01;2026-11-04"
n_ok = int(N * 0.70)
for i in range(n_ok): filas.append(valida(i, random.choice(cods))); esperado["validas"] += 1
for i in range(int(N * 0.06)):   # duplicados exactos de filas válidas ya generadas
    filas.append(random.choice(filas[:n_ok])); esperado["duplicadas"] += 1
def malas(k, plantilla):
    for i in range(int(N * k[0])):
        filas.append(plantilla(i)); esperado[k[1]] += 1
malas((0.04, "lugar_inexistente"), lambda i: f"{OK};X{i};Partida mala;Pintores;m2;10;;;municipio;Atlantis{i};;2026-10-01;2026-11-04")
malas((0.02, "ambigua"),           lambda i: f"{OK};A{i};Partida ambigua;Pintores;m2;10;;;municipio;Moya;;2026-10-01;2026-11-04")
malas((0.04, "sin_licencia"),      lambda i: f"{CYPE};C{i};Partida CYPE;Pintores;m2;10;;;nacional;;;2026-10-01;2026-11-04")
malas((0.03, "precio_malo"),       lambda i: f"{OK};P{i};Precio malo;Pintores;m2;abc;;;nacional;;;2026-10-01;2026-11-04")
malas((0.03, "fecha_mala"),        lambda i: f"{OK};F{i};Fecha mala;Pintores;m2;10;;;nacional;;;31-31-2026;2026-11-04")
malas((0.03, "desglose"),          lambda i: f"{OK};D{i};Desglose mayor;Pintores;m2;10;8;8;nacional;;;2026-10-01;2026-11-04")
malas((0.02, "fuente_inexistente"),lambda i: f"Fuente inventada;N{i};Fuente mala;Pintores;m2;10;;;nacional;;;2026-10-01;2026-11-04")
random.shuffle(filas)
open(out, "w", encoding="utf-8").write("\n".join([cab] + filas) + "\n")
print(len(filas), "filas;", esperado)