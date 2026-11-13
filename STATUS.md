# Estado de campaign-preflight

Versión: **0.1.0**. Auditoría de la aplicación: **12 de noviembre de 2026**. Verificación del repositorio: **13 de noviembre de 2026**.

## Objetivo de esta entrega

Primera versión local e independiente para revisar lotes de enlaces de marketing, configurar reglas de UTM y destinos, explicar hallazgos y exportar el informe a CSV. El código está publicado en la rama `main` del repositorio público [TommyHavana/campaign-preflight](https://github.com/TommyHavana/campaign-preflight). La aplicación se ejecuta en local.

## Alcance de la versión

- Interfaz de revisión, configuración de reglas y guía UTM en español.
- Entrada de una URL por línea y ejemplos ficticios correctos, incorrectos y mixtos.
- Validación de URLs HTTP/HTTPS y UTM obligatorios, vacíos, duplicados, mayúsculas, espacios, codificación dañada y parámetros en fragmentos.
- Reglas de medios permitidos, dominios exactos, subdominios opcionales y campaña esperada.
- Resultados con estados, explicaciones y sugerencias, búsqueda por valores UTM decodificados, filtros y paginación de 50 enlaces.
- Informe desactualizado al modificar entradas o reglas efectivas; exportación bloqueada hasta reanalizar.
- Deshacer de un nivel en memoria para vaciar, iniciar revisión, cargar ejemplos y restablecer reglas.
- Errores junto a los campos, asociación accesible, foco de teclado y controles ampliados en móvil.
- Exportación del informe completo a CSV con escape de campos y neutralización de fórmulas.
- Límites de 500 enlaces, 8.192 caracteres por URL y 1.000.000 de caracteres de entrada.
- Motor de reglas y exportador desacoplados de React, con pruebas automatizadas.
- Documentación de producto, arquitectura y ejecución en `README.md`.

## Verificación de esta entrega

**Versión local revisada y verificada el 12 de noviembre de 2026.** Los cambios y su fundamento están documentados en [`docs/AUDIT.md`](docs/AUDIT.md).

| Comprobación                          | Resultado                                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instalación desde `package-lock.json` | `npm ci` repetido correctamente tras la auditoría, incluidas las dependencias de desarrollo para probar la interfaz.                                                                               |
| Pruebas automatizadas                 | **91 pruebas superadas**: 77 del dominio y CSV, 8 de App y 6 de ReportView, en cuatro archivos.                                                                                                    |
| Tipos y compilación                   | `npm run check` superado tras la auditoría: pruebas, TypeScript y compilación de producción.                                                                                                       |
| Dependencias                          | `npm audit`: cero vulnerabilidades conocidas en la comprobación final.                                                                                                                             |
| Servidor de desarrollo                | Respuesta HTTP 200 en `127.0.0.1:5173`.                                                                                                                                                            |
| Compilación de producción local       | `npm run preview -- --port 4174` verificado en el navegador, sin errores ni avisos de consola. El puerto 4173 estaba ocupado por otro proceso, que no se modificó.                                 |
| Lote ficticio inicial                 | 6 enlaces: 2 sin hallazgos, 2 con avisos y 2 con errores; 4 hallazgos en total.                                                                                                                    |
| Reglas y reanálisis                   | Configuración inválida de dominio detectada; dominio autorizado, campaña esperada y HTTPS aplicados. Restauración de reglas comprobada.                                                            |
| Integridad del informe                | Cambiar enlaces o reglas efectivas bloquea el CSV hasta reanalizar. Deshacer recupera el trabajo previo y su estado de exportación; comportamiento comprobado en navegador y pruebas.              |
| Resultados y exportación              | Filtros, búsqueda, detalle desplegable y estado vacío comprobados. CSV descargado con el filtro de errores activo: contiene las 6 líneas originales, incluidos los enlaces correctos, y BOM UTF-8. |
| Diseño adaptable                      | Revisado en escritorio a 1280 y 1440 px y móvil a 390 y 320 px; sin desbordamiento horizontal de la página.                                                                                        |
| Navegación y foco                     | Nueva revisión enfoca la entrada; analizar enfoca el informe; cambiar de sección vuelve al inicio del contenido.                                                                                   |
| Lotes largos                          | Lote de 121 enlaces comprobado en móvil de 320 px: la tercera página muestra los enlaces 101–121 y devuelve el foco y el desplazamiento al comienzo de la lista.                                   |
| Exportación completa                  | CSV real descargado con la búsqueda `pieza-121` activa: 121 filas de resultados y última línea original 121. Búsqueda y paginación no recortan el archivo.                                         |
| Errores y texto largo                 | Dominio inválido largo comprobado a 320 px: mensaje junto al campo y sin desbordamiento horizontal.                                                                                                |
| Accesibilidad y móvil                 | Verificado sin desbordamiento a 320 y 390 px. Ejemplos, filtros y acciones principales medidos a 44 px de alto; Tab y Enter conservan foco azul de 3 px en una tarjeta seleccionada.               |
| Búsqueda decodificada                 | La búsqueda `invierno 2026` encuentra en navegador un valor escrito con `%20` en la URL. Las pruebas cubren también normalización Unicode NFC.                                                     |
| Tamaño de compilación                 | JavaScript: 81,86 kB gzip. CSS: 10,15 kB gzip. Las fuentes se sirven como recursos locales separados.                                                                                              |

Entorno de verificación: Node.js **26.8.1**, npm **11.19.0**. El recorrido de interfaz se realizó en el navegador integrado. Las pruebas automatizadas cubren el motor de reglas, el exportador y los flujos de App y ReportView mediante React Testing Library y jsdom.

Evidencia visual de la versión inicial: [escritorio](docs/preview-desktop.jpg) y [móvil](docs/preview-mobile.jpg). Evidencia tras la auditoría: [escritorio](docs/audit-desktop.jpg) y [móvil](docs/audit-mobile.jpg).

Los límites rechazan el lote con una explicación y conservan la entrada. Los errores de UTF-8 en UTM ya no pasan inadvertidos; el detector de fragmentos distingue un separador de ruta de un `?` dentro de un valor. La campaña obligatoria y la esperada comparten un único hallazgo cuando falta el parámetro; una campaña esperada compuesta solo por espacios es una configuración inválida.

Para repetir las comprobaciones automatizadas:

```bash
npm ci
npm run check
npm run format:check
```

Para utilizar el proyecto, ejecuta `npm run dev` en esta carpeta y abre `http://127.0.0.1:5173`. Detén el servidor con `Ctrl+C` cuando termines.

## Límites conocidos

- Se revisa la URL proporcionada; no se visita la página ni se sigue su cadena de redirecciones.
- «Sin hallazgos» significa que pasa las reglas activas. No confirma disponibilidad, contenido, medición ni conversión.
- No se comprueban códigos HTTP, DNS, certificados, tiempos de carga ni etiquetas de analítica.
- No hay guardado de enlaces o reglas al recargar. Deshacer conserva solo un reemplazo durante la sesión; una edición posterior descarta esa recuperación. El usuario puede descargar el CSV.
- Las convenciones configurables no representan una especificación universal de todas las plataformas de analítica.
- Los archivos exportados contienen los datos que el usuario incluyó en los enlaces.

## Próximo trabajo posible

1. Diseñar comprobaciones de disponibilidad y redirecciones, con límites de tiempo y protección SSRF si requieren un servidor.
2. Añadir perfiles de reglas persistentes de forma optativa.
3. Evaluar importación de CSV y comparación entre informes según el uso real del producto.

El 13 de noviembre se repitieron `npm ci`, `npm run check`, `npm run format:check` y `npm audit` para verificar el código publicado: pasaron las 91 pruebas, el chequeo de tipos, la compilación y el formato. npm no comunicó vulnerabilidades conocidas. El aviso de instalación de `fsevents` sobre su script opcional no impidió estas comprobaciones. No se desplegó la aplicación ni se añadió una licencia.
