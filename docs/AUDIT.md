# Revisión de la primera versión

Fecha: **12 de noviembre de 2026**. Proyecto: **campaign-preflight**.

La revisión se centró en fiabilidad del flujo local, conservación del trabajo durante la sesión, accesibilidad de formularios y resultados, y proporcionalidad de la arquitectura. Se inspeccionaron los componentes, el motor de reglas, el CSV, la configuración y la documentación. Se implementaron las correcciones y se verificó la versión resultante.

Las líneas citadas a continuación corresponden al código **antes de esta revisión**. Su propósito es identificar la evidencia original; los cambios han desplazado esas ubicaciones.

## Hallazgos y correcciones

### 1. Recuperación del trabajo — prioridad media

**Antes:** `src/App.tsx`, líneas 86–98, 251–254 y 425–430: cargar ejemplos, vaciar, iniciar revisión y restablecer reglas sobrescribían la sesión sin recuperación. Un clic accidental podía borrar enlaces o configuración que aún no se habían exportado.

**Después:** un único paso de **Deshacer** en memoria recupera los enlaces, las reglas y el informe anteriores. La siguiente edición descarta ese paso; una nueva acción de reemplazo lo sustituye. No introduce persistencia ni diálogos de confirmación. La recuperación y el estado de exportación se comprobaron en navegador y están cubiertos por pruebas de App.

### 2. Identificación de errores — prioridad media

**Antes:** `src/components/RulesEditor.tsx`, líneas 79–100, 121–128 y 161–170: los errores aparecían en un resumen al final, sin asociación programática con cada campo. `src/App.tsx`, líneas 239, 267 y 357–379: el aviso del límite de caracteres estaba separado de la entrada y no desactivaba el botón.

**Después:** `validateRuleFields` entrega errores por campo. La interfaz los muestra junto al control y utiliza `aria-invalid` y `aria-describedby`. Los errores del lote también se muestran junto al textarea; superar 500 enlaces o 1.000.000 de caracteres bloquea el botón. Superar 8.192 caracteres por URL rechaza el lote al analizar y devuelve el foco a la entrada. El texto pegado se conserva.

La identificación textual de errores y su relación con los controles se apoya en la guía de [W3C sobre identificación de errores](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html). La solución mejora esa relación sin afirmar que este cambio por sí solo acredita conformidad completa.

### 3. Edición de identificadores exactos — prioridad baja

**Antes:** `src/components/RulesEditor.tsx`, líneas 79–100 y 121–128: medios, campaña y dominios no desactivaban corrección ortográfica, autocorrección ni autocapitalización. Las ayudas del teclado podían cambiar valores que se comparan de forma exacta.

**Después:** esos campos desactivan las tres ayudas. La campaña esperada vacía desactiva su regla; un valor compuesto únicamente por espacios genera un error de configuración. Las comparaciones siguen respetando el valor introducido, incluidas las mayúsculas.

### 4. Foco y controles — prioridad media

**Antes:** `src/styles.css`, líneas 51–55 y 641–644: el estilo de una tarjeta seleccionada prevalecía sobre el foco general. Las filas completas, líneas 690–692 y 766–772, podían recortar un contorno exterior. Algunos controles auxiliares tenían superficies pequeñas.

**Después:** el foco cuenta con estilos específicos, distinguibles de la selección, y contornos interiores donde el contenedor los podía recortar. Los controles de edición, ejemplos, filtros y recuperación se amplían a 44 px de alto en móvil. Los campos usan texto de 16 px en pantallas pequeñas. En navegador se midieron 44 px en ejemplos, filtros, nueva revisión, vaciar, revisar, exportar y ajustar reglas. Tab y Enter conservan un contorno azul de 3 px en la tarjeta seleccionada.

Se tomó como referencia la guía de [tamaño mínimo de objetivos de W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), que contempla tamaño y excepciones por espaciado. La elección de 44 px en móvil es una decisión de usabilidad; no se deduce un incumplimiento únicamente del tamaño visual de un icono.

### 5. Texto largo en errores — prioridad media

**Antes:** `src/components/RulesEditor.tsx`, líneas 166–167, mostraba el dominio inválido literal. `src/styles.css`, líneas 992–1001, no permitía encoger los hijos del aviso ni partir tokens largos, con riesgo de ensanchar la página.

**Después:** avisos, errores y sus hijos permiten ajuste y salto de texto. Se comprobó en navegador un dominio inválido largo a **320 px de ancho**, con mensaje junto al campo y sin desbordamiento horizontal.

### 6. Coherencia del estado — prioridad baja

**Antes:** `src/App.tsx`, líneas 31–43 y 64–67: informe, huella y versión se actualizaban por separado. La huella serializaba toda la entrada y la configuración en cada render. Cambiar separadores u orden de una lista podía marcar el informe como antiguo aunque conservase las mismas reglas.

**Después:** el informe, su entrada, firma de reglas y versión se guardan como una revisión conjunta. `src/state/settings.ts` transforma los campos editables y calcula la firma de las reglas efectivas. Los cálculos dependientes de entradas se memorizan. Un cambio efectivo exige reanalizar; los cambios de orden o formato de las listas que no modifican sus valores no invalidan el informe. Las pruebas de App cubren esta integridad.

## Resultados y lotes grandes

La búsqueda incluye la URL, destino, valores UTM decodificados y textos de los hallazgos. Se normaliza Unicode a NFC y se compara sin distinguir mayúsculas: un término legible puede encontrar un valor que en la URL aparezca codificado. Se comprobó en navegador que `invierno 2026` encuentra una URL con `%20`. Esta normalización afecta a la búsqueda; no cambia los valores originales ni las reglas de coincidencia de campaña.

El informe se divide en páginas de **50 enlaces**. Cambiar de búsqueda o filtro vuelve a la primera página; cambiar de página devuelve el foco y el desplazamiento al comienzo de la lista. Cada fila tiene un nombre accesible con línea, destino, campaña, fuente, medio y estado. Fuente y medio también se muestran en móvil. Los controles de detalle solo referencian el panel cuando existe.

La exportación sigue usando el informe completo. Se verificó en navegador un lote de **121 enlaces**: la tercera página muestra 101–121. Con la búsqueda `pieza-121` activa, el CSV descargado conservó **121 filas de resultados** y la última línea original 121. La página y los filtros no recortan el archivo.

## Fiabilidad del motor y del CSV

La revisión del dominio añadió detección de Unicode incompleto y UTF-8 dañada en nombres de parámetros o valores UTM. Conserva la URL original y explica cuándo la decodificación del navegador produciría un carácter de sustitución. No obliga a utilizar UTF-8 en rutas ni en valores de otros parámetros.

El detector de fragmentos distingue los UTM de una ruta de aplicación, como `#/oferta?utm_source=boletin`, de un `?` incluido en el valor de otro parámetro. Los UTM del fragmento siguen sin contar como parámetros de consulta.

Si la campaña es obligatoria y también tiene un valor esperado, su ausencia produce un solo hallazgo con una sugerencia concreta. Una campaña esperada exige el parámetro aunque no esté marcado como obligatorio.

El CSV conserva su formato y sus protecciones. Se ampliaron las regresiones para campos que podrían interpretarse como fórmulas y para valores UTM repetidos representados como una lista JSON dentro de la celda.

## Conclusión de arquitectura

La arquitectura sigue siendo adecuada para esta versión: analizador y exportador puros en TypeScript, estado local en React, CSS propio y herramientas de desarrollo con Vite y Vitest. El motor no conoce componentes ni realiza peticiones para comprobar URLs y reglas.

La cohesión del estado se mejoró sin añadir un gestor global. Agrupar datos que cambian juntos sigue la [guía oficial de estructura del estado de React](https://react.dev/learn/choosing-the-state-structure). React Testing Library y jsdom añaden comprobaciones de comportamiento a la suite existente; no forman parte del código que ejecuta el usuario en producción.

No hay una necesidad actual de backend, base de datos, autenticación, IA, servicios externos ni persistencia. Deshacer pertenece a la sesión de la pestaña. La disponibilidad de páginas y las redirecciones siguen reservadas para otra versión y requerirán decidir cómo consultar destinos y proteger cualquier servidor frente a SSRF.

El CSS y sus puntos de adaptación se mantienen. Una reescritura visual completa no era necesaria para corregir los problemas encontrados.

## Evidencia de validación

- **91 pruebas superadas:** 77 del dominio y CSV, 8 de App y 6 de ReportView.
- **`npm run check` superado:** pruebas, comprobación TypeScript y compilación de producción.
- **`npm audit`: cero vulnerabilidades conocidas** en la comprobación final.
- **Navegador, 320 y 390 px:** sin desbordamiento horizontal; dominio inválido largo, Deshacer y exportación comprobados. Controles móviles medidos y foco de teclado verificado.
- **Lote de 121 enlaces:** paginación 101–121, foco y desplazamiento al comienzo de resultados, y CSV completo incluso con búsqueda activa.
- Compilación: JavaScript **81,86 kB gzip** y CSS **10,15 kB gzip**, con fuentes locales separadas.

El resumen de ejecución y los límites se conservan en [`STATUS.md`](../STATUS.md). Las capturas tras la revisión están en [escritorio](audit-desktop.jpg) y [móvil](audit-mobile.jpg).

Esta revisión aplica criterios concretos de accesibilidad al código y al flujo. No constituye una certificación general de conformidad WCAG ni sustituye pruebas con distintas tecnologías de asistencia.
