Documentación Unificada del Proyecto: Sistema de Alquiler de Herramientas de Construcción
Este documento consolida la Especificación de Requerimientos (v2.0) y el Diseño Técnico del Modelo de Datos (v1.0). Su estructura está optimizada para servir como fuente única de verdad (Single Source of Truth) para el equipo de desarrollo y como contexto de alta precisión para los agentes autónomos de codificación.
Parte 1: Especificación de Requerimientos (v2.0)
1.1 Contexto Geral del Proyecto
El sistema está diseñado para reemplazar el control manuscrito en cuadernos por una solución digital local ágil y robusta.
Aspecto
Detalle Operativo
Implicación Técnica
Usuaria Principal
La dueña del negocio.
Monousuario. No requiere autenticación compleja ni control de accesos jerárquicos avanzados en la fase inicial.
Situación Actual
Control manual en papel/cuaderno.
Interfaz intuitiva y de rápida adopción con validaciones automáticas.
Plataforma
Laptop de uso exclusivamente local.
Solución Single-Device. No requiere infraestructura en la nube ni servidor web. Base de datos embebida SQLite.
Volumen Inicial
Entre 30 y 100 herramientas.
Carga ligera. Indexación estándar elemental. Prioridad en la flexibilidad de los tipos de datos.

1.2 Sistema de Identificación de Herramientas
Se descarta el uso de códigos de barras o etiquetas adhesivas/QR debido al desgaste físico extremo por arrastre, polvo, cemento y humedad en obra. En su lugar, el sistema implementa una segmentación híbrida según la naturaleza del artículo:
A) Ítems Individuales (Maquinaria y Equipos Unitarios)
Son activos únicos, de alto costo, con historial clínico de mantenimiento y estados operativos independientes.
Identificación Física: Placa metálica de aluminio o acero grabada/troquelada a presión y remachada directamente a la carcasa del equipo.
Esquema de Numeración Lineal: Prefijo de Categoría + - + Número Correlativo de dos dígitos.
Código
Categoría de Herramienta
Código
Categoría de Herramienta
RM-NN
Roto Martillo
CP-NN
Compresor
TM-NN
Trompo / Mezcladora
AM-NN
Amoladora
GE-NN
Generador
VB-NN
Vibrador de concreto
CM-NN
Compactadora
ES-NN
Escalera

En el Sistema: Al registrar o devolver un alquiler, la usuaria digita directamente el código físico (Ej: RM-02) o lo selecciona de una lista filtrada, agilizando la atención sin depender de lecturas ópticas.
B) Ítems a Granel (Materiales en Volumen)
Materiales en cantidades masivas e idénticos entre sí. Es inviable e innecesario asignarles una numeración individual.
Identificación: Registro por categoría, condición física de desgaste y control de stock cuantitativo.
Diferenciación Crítica: Las tablas se subdividen estrictamente en Nuevas y Usadas, aplicando tarifas comerciales y de mora diferenciadas según la lista de precios vigente.
1.3 Módulos del MVP y Requerimientos Detallados
1. Catálogo e Inventario
Registro, edición y baja lógica de ítems individuales y lotes a granel.
Gestión dinámica de estados para individuales (disponible, alquilado, mantenimiento, malogrado).
Control de stock para granel mediante balance de unidades (cantidad_total, cantidad_disponible, alquiladas, perdidas_danadas).
2. Gestión de Clientes
Registro de datos personales mínimos: Nombre, Teléfono, Dirección y Email.
Identificación mediante DNI (para personas naturales) y RUC (con miras a soporte de empresas).
Módulo de Lista Negra para alertar visualmente si el cliente cuenta con antecedentes de morosidad o destrucción de equipos.
3. Flujo de Contratos y Alquileres
Creación de contratos combinando múltiples herramientas individuales y materiales a granel en una misma transacción.
Registro mixto de garantías en mostrador: Retención física del DNI del cliente + cobro de un Depósito en Efectivo/Garantía Monetaria.
Cálculo Automático de Tarifas: Procesamiento basado en la fórmula:
$$\text{Costo Total} = \text{Días de Alquiler} \times \text{Tarifa Diaria}$$
Captura y almacenamiento local de la firma digitalizada del cliente en el contrato.
Retorno y Liquidación: Checklist de inspección física en mostrador (bien, dañado, no devuelto) con cálculo inmediato de mora parametrizada por herramienta en caso de retraso.
4. Control de Caja y Métodos de Pago
Registro obligatorio del método de pago empleado en cada transacción.
Soporte nativo para: Efectivo, Yape y Plin.
Emisión exclusiva de comprobantes de control interno simplificado (Sin conexión SUNAT en la Fase 1).
5. Reportes Estadísticos Integrados
Visualización consolidada de ingresos financieros por períodos (Día, Semana, Mes).
Identificación de los activos más rentables (Herramientas con mayor frecuencia de alquiler).
Monitoreo de pérdidas operativas (Equipos estancados en mantenimiento o declarados malogrados).
Alertas tempranas de devoluciones pendientes y listado de clientes deudores.
Parte 2: Especificación Técnica del Modelo de Datos (v1.0)
2.1 Arquitectura de la Base de Datos
El almacenamiento de datos se estructurará sobre SQLite, utilizando restricciones nativas (CHECK constraints) para asegurar la consistencia ante la falta de tipos ENUM nativos.
Fragmento de código
erDiagram
    CATEGORIA_HERRAMIENTA ||--o{ HERRAMIENTA : "agrupa"
    HERRAMIENTA ||--o{ DETALLE_CONTRATO : "aparece en"
    ITEM_GRANEL ||--o{ DETALLE_CONTRATO : "aparece en"
    CLIENTE ||--o{ CONTRATO : "firma"
    CONTRATO ||--o{ DETALLE_CONTRATO : "contiene"
    CONTRATO ||--o{ PAGO : "recibe"
    HERRAMIENTA ||--o{ MANTENIMIENTO : "registra"
    USUARIO ||--o{ CONTRATO : "procesa"


2.2 Diccionario de Datos Detallado
2.2.1 Tabla: CATEGORIA_HERRAMIENTA
Gobernará los prefijos alfanuméricos de dos letras mayúsculas grabados en las herramientas.
SQL
CREATE TABLE CATEGORIA_HERRAMIENTA (
    id TEXT PRIMARY KEY NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT
);


2.2.2 Tabla: HERRAMIENTA
Almacena de forma unívoca las máquinas individuales remachadas con placas metálicas.
SQL
CREATE TABLE HERRAMIENTA (
    id TEXT PRIMARY KEY NOT NULL,
    id_categoria TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio_dia REAL NOT NULL CHECK (precio_dia >= 0),
    mora_dia REAL NOT NULL CHECK (mora_dia >= 0),
    valor_reposicion REAL CHECK (valor_reposicion >= 0),
    estado TEXT NOT NULL CHECK (estado IN ('disponible', 'alquilado', 'mantenimiento', 'malogrado')),
    fecha_adquisicion TEXT,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    FOREIGN KEY (id_categoria) REFERENCES CATEGORIA_HERRAMIENTA(id)
);


2.2.3 Tabla: ITEM_GRANEL
Catálogo y control cuantitativo estricto del stock de materiales masivos.
SQL
CREATE TABLE ITEM_GRANEL (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    condicion TEXT NOT NULL CHECK (condicion IN ('nuevo', 'usado')),
    precio_dia REAL NOT NULL CHECK (precio_dia >= 0),
    mora_dia REAL NOT NULL CHECK (mora_dia >= 0),
    cantidad_total INTEGER NOT NULL CHECK (cantidad_total >= 0),
    cantidad_disponible INTEGER NOT NULL CHECK (cantidad_disponible >= 0 AND cantidad_disponible <= cantidad_total),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);


2.2.4 Tabla: CLIENTE
Soporta personas naturales y jurídicas, incluyendo banderas de riesgo transaccional.
SQL
CREATE TABLE CLIENTE (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona', 'empresa')),
    nombre TEXT NOT NULL,
    dni TEXT UNIQUE CHECK (dni IS NULL OR (length(dni) = 8 AND typeof(CAST(dni AS INTEGER)) = 'integer')),
    ruc TEXT UNIQUE CHECK (ruc IS NULL OR (length(ruc) = 11 AND typeof(CAST(ruc AS INTEGER)) = 'integer')),
    telefono TEXT,
    direccion TEXT,
    email TEXT,
    en_lista_negra INTEGER NOT NULL DEFAULT 0 CHECK (en_lista_negra IN (0, 1)),
    notas_riesgo TEXT,
    fecha_registro TEXT NOT NULL DEFAULT CURRENT_DATE,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    CHECK (
        (tipo = 'persona' AND dni NOT NULL AND ruc IS NULL) OR 
        (tipo = 'empresa' AND ruc NOT NULL)
    )
);


2.2.5 Tabla: CONTRATO
Cabecera que gobierna la temporalidad, responsabilidades y resguardo de las garantías del alquiler.
SQL
CREATE TABLE CONTRATO (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_salida TEXT NOT NULL,
    fecha_devolucion_pactada TEXT NOT NULL,
    fecha_devolucion_real TEXT,
    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'atrasado', 'devuelto', 'cancelado')),
    deposito_dni INTEGER NOT NULL DEFAULT 0 CHECK (deposito_dni IN (0, 1)),
    deposito_monto REAL NOT NULL DEFAULT 0 CHECK (deposito_monto >= 0),
    firma_digital_path TEXT,
    notas TEXT,
    FOREIGN KEY (id_cliente) REFERENCES CLIENTE(id),
    FOREIGN KEY (id_usuario) REFERENCES USUARIO(id)
);


2.2.6 Tabla: DETALLE_CONTRATO
Línea detallada del contrato. Actúa de forma polimórfica aislando los precios históricos de alquiler.
SQL
CREATE TABLE DETALLE_CONTRATO (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_contrato INTEGER NOT NULL,
    tipo_item TEXT NOT NULL CHECK (tipo_item IN ('individual', 'granel')),
    id_herramienta TEXT,
    id_item_granel INTEGER,
    cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_dia_aplicado REAL NOT NULL CHECK (precio_dia_aplicado >= 0),
    mora_dia_aplicada REAL NOT NULL CHECK (mora_dia_aplicada >= 0),
    estado_devolucion TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_devolucion IN ('pendiente', 'bien', 'dañado', 'no devuelto')),
    FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id),
    FOREIGN KEY (id_herramienta) REFERENCES HERRAMIENTA(id),
    FOREIGN KEY (id_item_granel) REFERENCES ITEM_GRANEL(id),
    CHECK (
        (tipo_item = 'individual' AND id_herramienta NOT NULL AND id_item_granel IS NULL AND cantidad = 1) OR
        (tipo_item = 'granel' AND id_item_granel NOT NULL AND id_herramienta IS NULL)
    )
);


2.2.7 Tabla: PAGO
Auditoría y desglose minucioso de flujos monetarios internos.
SQL
CREATE TABLE PAGO (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_contrato INTEGER NOT NULL,
    monto REAL NOT NULL CHECK (monto >= 0),
    fecha_pago TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'yape', 'plin')),
    tipo TEXT NOT NULL CHECK (tipo IN ('adelanto', 'saldo', 'mora', 'deposito', 'devolucion_deposito')),
    comprobante TEXT NOT NULL DEFAULT 'recibo interno' CHECK (comprobante IN ('recibo interno', 'boleta_sunat', 'factura_sunat')),
    notas TEXT,
    FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id)
);


2.2.8 Tabla: MANTENIMIENTO
Bitácora de costes operativos de reparación para el cálculo de rentabilidad neta.
SQL
CREATE TABLE MANTENIMIENTO (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_herramienta TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT,
    descripcion TEXT NOT NULL,
    costo REAL CHECK (costo >= 0),
    tipo TEXT NOT NULL CHECK (tipo IN ('preventivo', 'correctivo')),
    FOREIGN KEY (id_herramienta) REFERENCES HERRAMIENTA(id)
);


2.2.9 Tabla: USUARIO
Tabla preparada para entornos multiusuario. Contraseñas hasheadas obligatoriamente.
SQL
CREATE TABLE USUARIO (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'admin' CHECK (rol IN ('admin', 'empleado')),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);


2.2.10 Tabla: CONFIGURACION
Estructura llave-valor para evitar la inyección de constantes directas en el código (hardcoding).
SQL
CREATE TABLE CONFIGURACION (
    clave TEXT PRIMARY KEY NOT NULL,
    valor TEXT NOT NULL,
    descripcion TEXT
);


2.3 Reglas de Integridad y Lógica del Negocio (Para Controladores)
Los agentes de desarrollo y programadores deben implementar las siguientes reglas a nivel de software:
Exclusividad Transaccional: Ninguna herramienta individualizada puede ser asignada a un contrato si su estado actual en la base de datos es distinto de disponible.
Mitigación de Sobrevuelos de Stock: Las disminuciones de inventario a granel deben ser calculadas de forma atómica en el motor SQLite para evitar inconsistencias concurrentes:
SQL
UPDATE ITEM_GRANEL SET cantidad_disponible = cantidad_disponible - :cantidad WHERE id = :id_item_granel;




3.  **Persistencia Estática de Precios (Snapshots):** Al insertar registros en `DETALLE_CONTRATO`, los valores de `precio_dia_aplicado` y `mora_dia_aplicada` se copian del catálogo general en ese instante exacto[cite: 1]. Cambios de tarifas posteriores no deben alterar los contratos vigentes o históricos[cite: 1].
4.  **Cálculo Matemático Matemático de Penalización:** Si la entrega física ocurre después de la fecha límite establecida (`fecha_devolucion_real > fecha_devolucion_pactada`), se calcula la mora por cada línea rezagada aplicando la siguiente fórmula en el backend[cite: 1]:
    $$\text{Mora por Ítem} = (\text{Días de Atraso} \times \text{mora\_dia\_aplicada} \times \text{cantidad})$$
5.  **Rutina Automática de Apertura:** Cada vez que el software es inicializado, debe ejecutar un barrido sobre los contratos en estado `activo` cuya `fecha_devolucion_pactada` sea menor que la fecha actual del sistema, mutando su estado automáticamente a `atrasado`[cite: 1].

---

### 2.4 Campos TBD y Extensiones Futuras (Fase 2)
El modelo cuenta con campos nativos durmientes preparados para activarse sin alterar la arquitectura de datos básica[cite: 1]:
*   `CLIENTE.ruc` / `CLIENTE.tipo = 'empresa'`: Habilitado para cuando el negocio empiece a alquilar formalmente a constructoras jurídicas[cite: 1].
*   `PAGO.comprobante = 'boleta_sunat' | 'factura_sunat'`: Preparado para recibir los hashes y estados de una pasarela de facturación electrónica de la SUNAT[cite: 1].
*   **Módulo de Combos e Imágenes:** Estructuras pensadas para almacenar rutas de fotografías de los DNI y plantillas de kits predefinidos de herramientas[cite: 1].



Etapa 4: Arquitectura y Stack Tecnológico
Para que este sistema funcione de manera impecable en una laptop de uso local , sin necesidad de depender de internet ni de servidores externos , y estructurado de forma que los agentes de IA no se confundan al programar, la arquitectura ideal es un Monolito Local Desacoplado.
Aprovechando la base del modelo de datos de la etapa anterior, aquí está el plano técnico de la arquitectura.
4.1 El Stack Tecnológico Propuesto
Para garantizar velocidad en la terminal, un rendimiento óptimo en entornos Linux y una compatibilidad total con herramientas de desarrollo asistido por IA, la combinación más sólida es:
Capa
Tecnología
Justificación Técnica
Frontend (Interfaz)
React + Vite + Tailwind CSS
Los agentes de IA generan componentes React con Tailwind de forma sumamente precisa. Vite ofrece un recargo en caliente instantáneo en local.
Contenedor de Escritorio
Electron
Envuelve la app web para que funcione como una aplicación nativa de escritorio en la laptop. Permite gestionar ventanas y el sistema de archivos local fácilmente.
Backend y Lógica
Node.js (IPC) + SQLite
En lugar de levantar un servidor web local pesado, Electron se comunica directamente con el proceso principal de Node.js mediante canales IPC (Inter-Process Communication).
Base de Datos
better-sqlite3
La librería de SQLite más rápida para Node.js. Ejecuta las consultas de forma sincrónica y bloqueante en hilos secundarios, ideal para la baja carga de 30-100 herramientas.

4.2 Diagrama de Arquitectura Local (Flujo de Datos)
El flujo de control dentro de la laptop no usará peticiones HTTP (fetch/axios), sino eventos del sistema para eliminar la latencia y la necesidad de puertos de red abiertos:
[ Capa de Presentación: React UI ]
               │  ▲
               │  │  Canales IPC de Electron (Seguro y Aislado)
               ▼  │
[ Capa de Control: Proceso Principal Node.js ] ──► [ Almacenamiento Local ]
               │  ▲                                    (Fotos DNI / Firmas) 
               ▼  │  Consultas SQL Directas
[ Capa de Datos: better-sqlite3 + DB ] 

4.3 Estructura de Directorios (Diseñada para Agentes de IA)
Para que los agentes especializados (workers) puedan trabajar en paralelo sin pisarse el código ni generar conflictos de fusión (merge) en Git, dividiremos el proyecto bajo el principio de Separación de Responsabilidades:
Plaintext
sistema-alquiler/
├── src/
│   ├── main/                 # Proceso Principal de Electron (Backend)
│   │   ├── db/               # Conexión, migraciones e inicialización de SQLite 
│   │   ├── services/         # Controladores lógicos (Lógica de contratos, cajas, moras) [cite: 77, 79]
│   │   └── ipcHandlers.js    # Enrutador de eventos que expone funciones a la UI
│   │
│   ├── renderer/             # Interfaz de Usuario (Frontend React)
│   │   ├── components/       # Elementos reutilizables (Botones, Tablas, Modales)
│   │   ├── views/            # Pantallas completas (Inventario, Clientes, Mostrador) [cite: 57, 60, 61]
│   │   ├── hooks/            # Funciones para invocar los canales IPC de Electron
│   │   └── index.html
│   │
│   └── preload.js            # Puente seguro entre la UI y el sistema operativo
├── package.json
└── tailwind.config.js

4.4 Decisiones Críticas de Arquitectura
Seguridad y Contexto Operativo Local: Al no existir API expuesta a la red, la aplicación es inmune a ataques web externos. Toda la seguridad recae en el cifrado local de base de datos si fuera necesario a futuro.
Persistencia de Archivos Estáticos: Las firmas digitales digitalizadas y eventuales fotografías se guardarán en una carpeta oculta dentro del directorio de datos de la aplicación (AppData o .config/), almacenando únicamente la ruta relativa del archivo de imagen en la tabla CONTRATO.
Estrategia de Copias de Seguridad: Se programará un servicio en Node.js que realice una copia física del archivo base_datos.db hacia la ruta parametrizada en la tabla CONFIGURACION (como una memoria USB externa o una carpeta sincronizada con Google Drive de forma nativa por el sistema operativo) al cerrar la aplicación.
Con la arquitectura y el stack definidos, el terreno está completamente nivelado para preparar el despliegue del equipo de desarrollo artificial.

