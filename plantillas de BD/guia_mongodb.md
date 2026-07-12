# Guía MongoDB — QUIZIMA

## Base de datos

```
Nombre: quiz_base_mongo
```

---

## Colecciones

### 1. `quices` — Documentos de quiz

Almacena los quizzes creados por profesores. Cada documento contiene los metadatos del quiz y un array de preguntas anidadas.

#### Estructura del documento

```json
{
  "_id": ObjectId("..."),
  "metadatos": {
    "titulo": "Evaluación de Matemáticas",
    "tema": "Álgebra básica",
    "materia_id": 5,
    "autor_id": 12,
    "imagen_portada": "data:image/jpeg;base64,...",
    "recompensa_puntos_app": 100,
    "fecha_creacion": ISODate("2026-07-10T14:30:00Z"),
    "modo_juego": "Igual",
    "ponderacion": 100
  },
  "preguntas": [
    {
      "nro_orden": 1,
      "tipo": "opcion_multiple",
      "enunciado": "¿Cuál es el resultado de 2 + 2?",
      "tiempo_limite_segundos": 20,
      "opciones": [
        { "texto": "3", "es_correcta": false },
        { "texto": "4", "es_correcta": true },
        { "texto": "5", "es_correcta": false },
        { "texto": "22", "es_correcta": false }
      ],
      "multimedia": null,
      "puntos_si_es_dificultad": 10,
      "categoria": "Matemáticas"
    }
  ]
}
```

#### Tipos de pregunta (`tipo`)

| Valor en MongoDB | Significado | # Opciones |
|---|---|---|
| `opcion_multiple` | Opción múltiple simple (1 correcta). También usado para Verdadero/Falso (2 opciones). | 2-4 |
| `seleccion_multiple` | Selección múltiple (varias correctas). Puntaje parcial. | 2-4 |
| `completacion` | Completación (texto libre). El estudiante escribe la respuesta. | 1 |

#### Campos de `preguntas[]`

| Campo | Tipo | Descripción |
|---|---|---|
| `nro_orden` | int | Número de la pregunta (1-indexed) |
| `tipo` | string | `opcion_multiple`, `seleccion_multiple`, `completacion` |
| `enunciado` | string | Texto de la pregunta (máx 95 caracteres) |
| `tiempo_limite_segundos` | int | Segundos para responder (5-240) |
| `opciones` | array | Lista de `{ texto, es_correcta }` |
| `multimedia` | object/null | Imagen asociada a la pregunta (opcional) |
| `puntos_si_es_dificultad` | float | Puntaje si el modo juego es "Dificultad" |
| `categoria` | string/null | Categoría temática (opcional) |

---

### 2. `auditoria` — Registros de auditoría

Cada operación importante en el sistema genera un registro de auditoría.

#### Estructura del documento

```json
{
  "_id": ObjectId("..."),
  "tipo_operacion": "usuario",
  "nombre_operacion": "Eliminar usuario",
  "fecha_operacion": ISODate("2026-07-10T15:00:00Z"),
  "usuario": {
    "id": 1,
    "nombre": "Admin",
    "apellido": "Master",
    "email": "admin@master.com",
    "rol": "master"
  },
  "contexto": {
    "ip_address": "192.168.1.10",
    "user_agent": "Mozilla/5.0..."
  },
  "entidad": {
    "tipo": "usuario",
    "id": "12"
  },
  "cambio": {
    "datos_anteriores": {
      "usu_activo": true,
      "usu_nombre": "Juan"
    },
    "datos_nuevos": {
      "usu_activo": false,
      "usu_eliminado": true
    }
  },
  "detalles": "Usuario Juan Pérez eliminado por admin master",
  "resultado": {
    "exito": true,
    "mensaje_error": null
  }
}
```

#### Campos principales

| Campo | Tipo | Descripción |
|---|---|---|
| `tipo_operacion` | string | `usuario`, `quiz`, `sesion`, `materia`, `auth`, `sistema` |
| `nombre_operacion` | string | Descripción legible: `"Crear usuario"`, `"Inicio sesión"`, etc. |
| `fecha_operacion` | ISODate | Marca de tiempo |
| `usuario` | object | Quien realizó la operación (id, nombre, apellido, email, rol) |
| `contexto` | object | IP y user-agent |
| `entidad` | object | Tipo e ID del recurso afectado |
| `cambio` | object | Datos anteriores y nuevos (solo en modificaciones) |
| `detalles` | string | Texto descriptivo adicional |
| `resultado` | object | `{ exito: bool, mensaje_error: string\|null }` |

---

## Índices recomendados

Crea estos índices en `mongosh` para optimizar las consultas:

```javascript
// Conectar a la base de datos
use quiz_base_mongo;

// Índice para auditoría por usuario + fecha
db.auditoria.createIndex(
  { "usuario.id": 1, "fecha_operacion": -1 },
  { background: true }
);

// Índice para auditoría por tipo de entidad + fecha
db.auditoria.createIndex(
  { "entidad.tipo": 1, "fecha_operacion": -1 },
  { background: true }
);

// Índice para auditoría por tipo de operación + fecha
db.auditoria.createIndex(
  { "tipo_operacion": 1, "fecha_operacion": -1 },
  { background: true }
);

// Índice para búsqueda de quices por autor
db.quices.createIndex(
  { "metadatos.autor_id": 1 },
  { background: true }
);
```

---

## Cómo crear desde cero (mongosh)

```javascript
// 1. Conectarse: mongosh mongodb://localhost:27018

// 2. Crear/Usar base de datos (se crea automáticamente al insertar)
use quiz_base_mongo;

// 3. Crear colecciones (opcional, se crean solas al insertar)
db.createCollection("quices");
db.createCollection("auditoria");

// 4. Crear índices (ver sección de arriba)

// 5. Insertar un quiz de prueba
db.quices.insertOne({
  metadatos: {
    titulo: "Quiz de prueba",
    tema: "General",
    materia_id: 1,
    autor_id: 1,
    recompensa_puntos_app: 50,
    fecha_creacion: new Date(),
    modo_juego: "Igual",
    ponderacion: 100
  },
  preguntas: [
    {
      nro_orden: 1,
      tipo: "opcion_multiple",
      enunciado: "¿Cuál es la capital de Francia?",
      tiempo_limite_segundos: 20,
      opciones: [
        { texto: "Londres", es_correcta: false },
        { texto: "París", es_correcta: true },
        { texto: "Berlín", es_correcta: false },
        { texto: "Madrid", es_correcta: false }
      ],
      multimedia: null,
      puntos_si_es_dificultad: 10,
      categoria: "Geografía"
    }
  ]
});

// 6. Verificar
db.quices.find().pretty();
db.auditoria.find().pretty();
```

---

## Cómo crear desde MongoDB Compass

1. Abre Compass y conecta a `mongodb://localhost:27018`
2. Crea la base de datos: botón **Create Database** → nombre `quiz_base_mongo`
3. Crea la colección `quices`
4. Crea la colección `auditoria`
5. Ve a la pestaña **Indexes** de cada colección y agrega los índices de la sección de arriba
6. Para insertar datos de prueba, usa la pestaña **Add Data** → **Insert Document** con el JSON de ejemplo

---

## Notas importantes

- **`opcion_multiple`** también se usa para preguntas de Verdadero/Falso (solo tienen 2 opciones: "Verdadero" y "Falso")
- El campo `_id` de los quizzes se guarda como string (`ses_id_mongo_quiz`) en la tabla `evaluacion.tbl_sesiones` de PostgreSQL
- La auditoría solo se crea desde el backend; no necesita inserciones manuales
- El backend crea los índices automáticamente al iniciar (`conexion_bd.py:crear_indices_mongodb()`), pero es buena práctica tenerlos desde el inicio
