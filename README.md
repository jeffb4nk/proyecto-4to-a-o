# QUIZIMA

<div align="center">

![React Native](https://img.shields.io/badge/React%20Native-0.81.5-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-54-000020?style=for-the-badge&logo=expo&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.135.3-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

**Plataforma educativa de creación y gestión de quizzes interactivos estilo Kahoot**

[Características](#-características) • [Instalación](#-instalación) • [Estructura](#-estructura) • [API](#-api) • [Contribuir](#-contribuir)

</div>

---

## Visión General

QUIZIMA es una aplicación móvil multiplataforma diseñada para el entorno educativo que permite a los profesores crear quizzes interactivos y a los estudiantes presentarlos en tiempo real, similar a Kahoot. El sistema incluye funcionalidad offline, sistema de logros, auditoría completa y gestión por roles.

## Características

### Para Profesores
- **Creador de Quizzes** con 4 tipos de preguntas: opción múltiple, verdadero/falso, selección múltiple y completación
- **6 plantillas predefinidas** para crear quizzes rápidamente
- **Gestión de sesiones** con códigos de acceso de 6 dígitos
- **Reportes detallados** con estadísticas y exportación a PDF
- **Modos de juego**: Clásico (igual ponderación) o Dificultad (ponderación variable)

### Para Estudiantes
- **Pantalla de juego estilo Kahoot** con temporizador visual y feedback inmediato
- **Funcionalidad offline** - completa quizzes sin conexión y sincroniza automáticamente
- **Sistema de logros** con 5 logros desbloqueables
- **Ranking en tiempo real** y podio de resultados

### Administración
- **Panel de administración** con gestión de usuarios y materias
- **Sistema de auditoría** completo con registro de acciones
- **Roles**: Alumno, Profesor y Master (admin)

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Expo)                       │
│              React Native + TypeScript                   │
├─────────────────────────────────────────────────────────┤
│                    REST API                              │
├─────────────────────────────────────────────────────────┤
│              Backend (FastAPI/Python)                    │
├─────────────────────────────────────────────────────────┤
│         PostgreSQL          │          MongoDB           │
│    (Datos relacionales)     │    (Quizzes y auditoría)   │
└─────────────────────────────────────────────────────────┘
```

## Instalación

### Prerrequisitos
- Node.js 18+ y npm/yarn
- Python 3.10+
- PostgreSQL 14+
- MongoDB 6+

### Frontend

```bash
cd my-app
npm install
npm start
```

### Backend

```bash
cd backend/aplicacion
pip install -r requirements.txt
uvicorn servidor:app --reload --host 0.0.0.0 --port 8000
```

### Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# PostgreSQL
DATABASE_URL=postgresql://usuario:password@localhost:5432/quizima

# MongoDB
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=quiz_base_mongo

# JWT
JWT_SECRET=tu_secreto_aqui
```

## Estructura del Proyecto

```
Proyecto-Quiz-IMA-main/
├── backend/
│   ├── aplicacion/
│   │   ├── main.py              # Punto de entrada FastAPI
│   │   ├── modelos.py           # Modelos SQLAlchemy
│   │   ├── esquemas.py          # Schemas Pydantic
│   │   ├── conexion_bd.py       # Conexiones DB
│   │   └── rutas/               # Endpoints API
│   └── migrations/              # Migraciones SQL
├── my-app/                      # Frontend Expo
│   ├── app/                     # Pantallas (file-based routing)
│   │   ├── profesor/            # Vistas del profesor
│   │   ├── estudiante/          # Vistas del estudiante
│   │   ├── admin/               # Panel de administración
│   │   └── login/               # Autenticación
│   ├── components/              # Componentes UI reutilizables
│   ├── contexts/                # Estado global (UserContext)
│   ├── utils/                   # Utilidades y API client
│   ├── types/                   # Definiciones TypeScript
│   └── constants/               # Colores, estilos, tipografía
└── plantillas de BD/            # Scripts SQL y MongoDB
```

## API Endpoints

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/login` | Iniciar sesión |
| POST | `/auth/registro` | Registrar usuario |

### Quizzes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/quices/` | Listar quizzes |
| POST | `/quices/` | Crear quiz |
| PUT | `/quices/{id}` | Actualizar quiz |
| DELETE | `/quices/{id}` | Eliminar quiz |

### Sesiones
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/sesiones/crear-asignada` | Crear sesión de quiz |
| POST | `/sesiones/unirse` | Unirse con código |
| GET | `/sesiones/obtener-quiz/{id}` | Obtener quiz de sesión |
| POST | `/sesiones/resultado` | Guardar resultado |

### Usuarios y Materias
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/usuarios/` | Listar usuarios |
| GET | `/materias/` | Listar materias |
| GET | `/auditoria/` | Consultar auditoría |

## Tipos de Pregunta

| Tipo | Descripción | Opciones |
|------|-------------|----------|
| Quiz | Opción múltiple simple | 2-4 opciones, 1 correcta |
| Verdadero/Falso | Solo V o F | 2 opciones |
| Selección Múltiple | Varias correctas | 3-4 opciones, 2+ correctas |
| Completación | Escribir respuesta | Texto libre |

## Sistema de Puntuación

- **Modo Igual**: Todas las preguntas valen lo mismo
- **Modo Dificultad**: Cada pregunta tiene su propio peso
- **Escala configurable**: 10, 20 o 100 puntos por sesión
- **Selección múltiple**: Puntuación parcial proporcional

## Logros

| Logro | Requisito |
|-------|-----------|
| Primer Quiz | Completar tu primer quiz |
| Puntuación Perfecta | Obtener 100% en un quiz |
| Velocista | Completar un quiz en menos de 60 segundos |
| Maestro del Quiz | Completar 10 quizzes |
| Cinco Quizzes | Completar 5 quizzes |

## Testing

```bash
# Frontend - Tests Maestro
cd my-app
npm run test:login
npm run test:registro
npm run test:recuperar

# Backend - Tests Python
cd backend
python -m pytest tests/
```

## Tecnologías

### Frontend
- **React Native** 0.81.5 con **Expo** SDK 54
- **TypeScript** 5.9 para tipado estático
- **Expo Router** 6 para navegación file-based
- **expo-secure-store** para almacenamiento seguro
- **@react-native-community/netinfo** para detección de red

### Backend
- **FastAPI** 0.135.3 como framework ASGI
- **SQLAlchemy** 2.0 ORM para PostgreSQL
- **Motor** 3.7 para MongoDB async
- **python-jose** para JWT
- **bcrypt** para hashing de contraseñas
- **reportlab** para generación de PDFs

### Bases de Datos
- **PostgreSQL**: Usuarios, roles, materias, sesiones, resultados, logros
- **MongoDB**: Quizzes (preguntas+metadatos), registros de auditoría

## Contribuir

1. Forke el proyecto
2. Cree una rama para su feature (`git checkout -b feature/nueva-feature`)
3. Haga commit de sus cambios (`git commit -m 'Agregar nueva feature'`)
4. Push a la rama (`git push origin feature/nueva-feature`)
5. Abra un Pull Request

## Licencia

Proyecto educativo - Todos los derechos reservados

## Contacto

Desarrollado por el equipo QuizIMA

---

<div align="center">

Hecho con ❤️ para la educación

</div>
