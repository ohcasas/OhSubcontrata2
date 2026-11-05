# Catálogo inicial de precios · 3B Conecta

Estado: **preparado, sin ningún precio cargado.** No se ha inventado ni estimado ningún importe, y no se ha accedido a CYPE, BEDEC ni IVE.

## 1. Qué ya existe (no se ha tocado)
El motor de precios está en las migraciones 0070 y 0071 y en la pestaña «Precios» del panel de administración: fuentes con control de licencia, importador CSV, ámbito territorial (municipio → provincia → comunidad → nacional) y las dos modalidades. Las tablas nacen vacías. Sin referencias, el cálculo marca «revisión manual».

## 2. Ficheros nuevos (`docs/precios/`)
| Fichero | Para qué |
|---|---|
| `partidas_catalogo_inicial.csv` | 124 partidas en 15 capítulos, con unidad y oficio. **Solo la lista, sin precios.** Es una propuesta genérica para vivienda modular y reforma, **no sale de obras reales de OH Casas** (no tengo acceso a ellas). Hay que revisarla con tus obras. |
| `plantilla_referencias_precios.csv` | Plantilla definitiva de importación: las 20 columnas exactas que lee el importador del panel (separador `;`, UTF-8). Lleva una fila de ejemplo que el importador rechaza a propósito (no tiene precio): bórrala. |

## 3. Cómo se rellenan las dos modalidades
El motor calcula las dos a la vez, solo con lo que la fuente indica (no reparte ni estima):
- **Mano de obra + materiales:** `precio_unitario` (total de la partida).
- **Solo mano de obra:** `precio_mano_obra`.
Una fila sin desglose solo sirve para la modalidad total. Otros componentes opcionales: materiales, maquinaria, medios auxiliares, transporte, otros (su suma no puede superar el precio unitario).
Cada fila lleva lugar (`ambito_tipo` + `ambito_valor`), `fecha_precio` (cuándo era vigente) y `fecha_consulta` (cuándo lo obtuviste), enlace y alcance (qué incluye y qué no).

## 4. Clasificación de fuentes
«Consultable» = se puede mirar. «Descargable» = hay fichero. «Licencia pendiente» = no está confirmado que se puedan guardar sus precios en nuestra base. El panel **no deja importar** de una fuente hasta que se confirma la licencia.

| Fuente | Consultable | Descargable | Licencia (estado en el sistema) | Qué hacer |
|---|---|---|---|---|
| Presupuesto o factura real de OH / subcontratas | Sí (internas) | Sí | **Permitida** (son de 3B o de sus proveedores) | **Fuente principal.** Cárgalas tú. |
| Tarifa de proveedor | Sí | Según proveedor | **Permitida** | Pide la tarifa al proveedor por escrito. |
| Generador de precios CYPE | Sí (web) | Sin exportación pública | **Restringida** | Solo con autorización escrita de CYPE. |
| BEDEC / ITeC | Sí (cupo gratis) | BC3 con suscripción | **Restringida** | Solo lo que tengas licenciado. |
| IVE (Valencia) | Sí | BC3 con licencia | **Restringida** | Confirmar con el IVE. |
| Comunidad de Madrid · Base de precios | Sí | Sí: BC3 y PDF, según su documento de uso | **Pendiente.** Ese documento no indica condiciones de reutilización | Escribir a bdc@madrid.org |
| Junta de Extremadura | Sí | BC3, Presto y PDF (según fuente secundaria) | **Pendiente** (no pude abrir su página) | Confirmar condiciones |
| Junta de Andalucía (BCCA) | Sí | Por confirmar | **Pendiente** | Confirmar condiciones |
| Xunta de Galicia (BDCG), Gobierno Vasco, Generalitat Valenciana | Sí | Por confirmar | **Pendiente** | Confirmar condiciones |
| Castilla y León (ICCL) | Sí | Por confirmar | **Pendiente**; posible edición antigua (2015) | Probablemente no vigente |

Esta tabla recoge lo que hay en el sistema y lo poco que he podido comprobar. **No sustituye a leer las condiciones de cada fuente**: no he verificado ninguna licencia por mí mismo. Una fuente pública gratuita no implica permiso para copiarla en un sistema compartido.

## 5. Qué tienes que aportar tú
1. **Obras reales de OH Casas** (idealmente las últimas 12–24 meses): presupuestos, certificaciones o facturas con precio por partida, **unidad, fecha y lugar**. Es la base más fiable y no tiene problema de licencia.
2. **Revisión de `partidas_catalogo_inicial.csv`:** quita las que no uséis, añade las que falten, ajusta el alcance. Rellenar la columna `estado`.
3. **Presupuestos de profesionales autorizados** por oficio (al menos de los oficios más usados) con permiso para usar los precios, o su tarifa por escrito.
4. **Decidir qué fuentes públicas pides** y escribir a su organismo para confirmar la licencia. Si te la dan, guárdalo en «Fuentes» (estado de licencia, URL, fecha de revisión).
5. **Territorio:** en qué provincias trabajáis de verdad, para empezar por ahí la cobertura. El informe de cobertura del panel dice dónde faltan referencias.
6. **Quién valida los precios** antes de que se muestren a clientes (el cálculo guardado exige aprobación explícita, pero hay que nombrar a la persona).

## 6. Cómo cargar (cuando haya datos)
1. Panel → Precios → **Fuentes:** comprueba que la fuente existe y su licencia está confirmada.
2. **Referencias → Importar CSV** con la plantilla rellena. El importador muestra un resumen, descarta repetidas y filas con error, y lo anota en «Importaciones CSV».
3. Revisa la **cobertura territorial** y haz un cálculo de prueba antes de usarlo en una obra real.

## 7. Pendiente
- Datos reales (punto 5): sin ellos no se puede cargar ni un precio.
- Confirmación de licencias de las fuentes públicas.
- Nada de esto se aplica en producción sin tu autorización.