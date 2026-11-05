# Investigación de fuentes de precios · 3B Conecta
Fecha de consulta: 4-nov-2026. Nada de esto se ha cargado en la plataforma ni se ha modificado código, tablas o migraciones.

## 1. Resultado en una frase
Hay **33 partidas reales** con código, unidad, desglose mano de obra / materiales, fecha y fuente, todas de **Andalucía (BCCA, ed. 2024-01)**, listas en `catalogo_inicial_referencias_BCCA_Andalucia.csv`. **No tengo precios de ninguna otra zona de España**, y no existe nada de «montaje de cocina completa», «mueble de baño» ni «vivienda modular» en las fuentes que pude leer.

## 2. Qué pude consultar de cada fuente
| Fuente | ¿Precios visibles sin registro? | Qué hice / qué no pude ver | Reutilización |
|---|---|---|---|
| **BCCA · Junta de Andalucía** | **Sí.** BC3 (zip, ≈480 KB) y 3 PDF (básicos, auxiliares, unitarios descompuestos) | Leí el PDF de unitarios (solo me llegaron las primeras páginas: demoliciones). No pude descargar el BC3 (mi entorno solo llega a registros de paquetes y GitHub). Las 33 partidas salen de las fichas de CERP, que citan el código BCCA | La página del BCCA **no declara licencia**. CERP afirma que son datos reutilizables con atribución (Ley 37/2007). **Hay que confirmarlo con la Consejería** |
| **CERP · items.cerp.es** | **Sí.** Capítulos, fichas y descomposición | Navegué capítulos (Instalaciones, Albañilería, Pintura, Saneamiento, Equipamiento, Carpintería, Revestimientos) y abrí 33 fichas. No pude abrir su API REST, su `index.json` ni el repositorio de GitHub (bloqueados para mi herramienta), y su buscador devolvió resultados repetidos | Dice «datos abiertos con atribución»: «Información obtenida del Portal de la Junta de Andalucía». **No nombra una licencia concreta.** Su propia página de salud reconoce: 0 ítems con revisión humana y que todos los precios superan los 24 meses |
| **CYPE · Generador de precios** | **Sí, en cada ficha de partida** (precio total y descomposición), sin registro. **No** en las páginas de capítulo, que solo muestran índices (corrijo lo que dije antes: tenías razón). Para exportar o adaptar la obra sí piden cuenta myCYPE | Abrí las fichas DPS010 (demolición de entramado, 4,95 €/m², mano de obra 4,85 € + 2 % costes directos complementarios) y RTD010 (tabica de falso techo, 35,60 €/m, materiales 6,46 € + mano de obra 28,44 € + 2 %). Son costes directos de una **obra de referencia** (en Ceuta se indica: 2.200 m², 6 plantas); **no muestran fecha de la base** ni provincia concreta. No pude abrir su aviso legal (URL bloqueada para mi herramienta) | **Restringida** (consta en el sistema: sus términos permiten uso individual y no ceder copias a terceros; no hay permiso para guardar la base en un sistema compartido). Que sea visible **no** da permiso de guardarla. **No la he incluido en el CSV**. Sirve como contraste manual interno |
| **PREOC 2026** (ATAYO) | **No.** Se ven los 50 capítulos (U/A/D) y, en D47, subapartados de industrializada (Sismo Spain, Baupanel, Lignum Tech, baños); sin precios | Leí sus condiciones de uso | **Prohíbe** copiar, reproducir, crear trabajos derivados e incorporarlo a «nube» o sistemas similares sin autorización escrita de ATAYO. **Excluida** |
| **Comunidad de Madrid** | Descarga pública (web `gestiona.comunidad.madrid/bdco_inter`, que redirige a una aplicación) | Su documento de uso 2024 confirma: BC3 y PDF, precios a **junio de 2024**, 179 municipios en 3 zonas (CM1–CM3). No pude abrir la aplicación ni el BC3, así que no tengo ninguna partida | **No indica licencia.** Dudas: bdc@madrid.org |
| **Junta de Extremadura (2025)** | Sí, enlaces directos a BC3, Presto y PDF (actualizado 12-jun-2025) | El PDF de descompuestos solo se me abre hasta los ≈85.000 primeros caracteres (demoliciones y trabajos previos), fuera de tus especialidades | **No indica licencia ni si el precio es de ejecución material o contrata** |
| **IVE (Valencia)** | No pude comprobarlo: `bdc.five.es` no se renderiza | Solo vi enlaces (BDC IVE 2026 es un producto; condiciones en `five.es/condiciones-de-uso`, sin leer) | Restringida (BC3 de pago) |
| **ITeC · BEDEC** | No: 15 consultas al mes **con registro**; exportación FIEBDC-3 sin precisar qué suscripción | No consulté ninguna partida (requiere cuenta) | Restringida |
| **Buildgets (directorio)** | Es un directorio, no una base | Lo usé para localizar bases por comunidad (Galicia, País Vasco, Castilla y León, Canarias, Baleares, Asturias, Murcia, Cantabria, Guadalajara, Zaragoza) | — |

## 3. Cobertura territorial real
- **Comunidad (Andalucía):** 33 partidas. Es todo lo que puedo ofrecer con datos reales.
- **Nacional, provincial, municipal:** **ninguna.** No hay ninguna base pública con precios nacionales ni con precios por municipio que haya podido leer. Extender un precio andaluz al resto de España **no es válido**: lo evita el motor (jerarquía territorial) y yo no lo he forzado.
- **Por abrir cuando haya licencia o acceso:** Madrid (BC3/PDF, junio 2024), Extremadura (BC3/PDF 2025), Galicia (BDCG, 2.º semestre 2025), País Vasco (con registro), Valencia/Cataluña (de pago).
- **Municipal:** Madrid capital y Zaragoza tienen cuadro/banco municipal según Buildgets, sin URL ni licencia comprobadas. Para una ciudad concreta, la fuente más útil serán **tus presupuestos reales**.

## 4. Cobertura por especialidad (CSV)
| Especialidad | Partidas | Observación |
|---|---|---|
| Electricidad | 5 | Faltan punto de luz, tomas e interruptores (el listado de CERP se cortó antes) |
| Fontanería y saneamiento | 10 | Sanitarios, tuberías, bajante, colector, arqueta |
| Albañilería | 2 | Tabicón y tabique de ladrillo |
| Pladur | 5 | Tabiques, trasdosado, techos |
| Pintura | 4 | Plástica y esmalte |
| Carpintería | 3 | Puerta de paso, ventana, frente de armario (de madera) |
| **Montaje de cocinas** | 2 | **Solo mueble bajo fregadero.** No hay cocina completa ni encimeras |
| **Muebles de baño** | 2 | **Solo toallero y espejo.** No hay mueble de baño |
| **Viviendas modulares** | **0** | **Ninguna fuente pública legible lo cubre.** PREOC lo nombra, pero su precio no es visible y su licencia lo prohíbe |

## 5. Advertencias que afectan al motor
1. **Antigüedad:** los precios son de **dic-2021 a dic-2022** (más de 3,5 años). No los actualices con un coeficiente inventado. El motor solo admite coeficientes con fuente y fecha: busca uno oficial (p. ej. índice de costes de la construcción del INE) y cárgalo con su fuente.
2. **Qué precio es:** el precio del CSV es la **suma de la descomposición (coste directo)**. En el único caso que pude contrastar con el PDF de la BCCA (una demolición), el total publicado era la suma **más un 13 % de costes indirectos**. **No he verificado esto en cada partida**, así que antes de usarlos como precio de contrata hay que revisarlo contra el PDF original. **No son precios finales al cliente** (sin gastos generales, beneficio ni IVA).
3. **Maquinaria y medios auxiliares:** las fichas no los desglosan; quedan vacíos y no se han estimado.
4. **Dos modalidades:** `precio_unitario` = mano de obra + materiales; `precio_mano_obra` = solo mano de obra. En materiales de gran peso (sanitarios, muebles) la mano de obra es solo la colocación.
5. **Diferencias que quedan sin desglosar:** tabique de ladrillo H/S (0,83 €) y un código BCCA que la ficha no muestra (pintura plástica sobre ladrillo). Están anotadas en `observaciones`.
6. El campo `enlace` apunta a la ficha de CERP donde consulté la partida; el original es la BCCA.
7. **El importador no dejará cargar el CSV** hasta que la fuente «Junta de Andalucía · BCCA» tenga la licencia confirmada en el panel (hoy «pendiente»). Es lo esperado: cargarlo antes saltaría el control.

## 6. Qué necesito de ti
1. Confirmación de licencia: escribir a la Consejería (titular de la BCCA) y/o a CERP pidiendo por escrito el permiso de reutilización con atribución. Cuando la tengas, ponla en «Fuentes».
2. Si quieres cobertura fuera de Andalucía: permiso de Madrid (bdc@madrid.org) y Extremadura; y yo puedo analizar su BC3 si me lo adjuntas aquí (mi entorno no lo descarga).
3. **Tus presupuestos y facturas reales** (ver `CATALOGO_INICIAL_PRECIOS.md`). Para cocinas, muebles de baño y vivienda modular son hoy la única fuente posible.
4. Decidir si pides licencia a CYPE, BEDEC o IVE; hasta entonces no se cargan sus precios. Aunque CYPE sea visible, necesita su autorización escrita y, además, habría que resolver que sus precios no indican fecha ni provincia.