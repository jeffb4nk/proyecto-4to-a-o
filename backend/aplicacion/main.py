# ======================================================
# Punto de entrada del backend
# Acá arranca FastAPI, se configura CORS, se montan
# archivos estáticos y se registran todas las rutas.
# ======================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from aplicacion.rutas import rutas_quices, quices_mongo, login, registro, usuarios, auditoria, materias, recuperar
import os

app = FastAPI()

# Al arrancar el servidor creamos los índices de MongoDB
# así las búsquedas por autor_id o código no se arrastran.
@app.on_event("startup")
async def startup_event():
    from aplicacion.conexion_bd import crear_indices_mongodb
    await crear_indices_mongodb()

# Las imágenes que suben los usuarios (portadas de quiz, fotos de perfil)
# se guardan en esta carpeta fuera del código fuente.
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Servimos esas imágenes como archivos estáticos para que
# el frontend las pueda cargar con una URL directa.
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Sin CORS el frontend (React Native en el celular) no podría
# llamar al backend. Dejamos abierto porque la app es cerrada.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"mensaje": "¡El backend está vivo!", "status": "ok"}

# Endpoint para que el frontend (o un health check de Docker)
# verifique si el backend y MongoDB responden.
@app.get("/health")
async def health_check():
    from aplicacion.conexion_bd import coleccion_quices, mongo_client
    
    mongo_status = "ok"
    mongo_error = None
    
    try:
        if mongo_client:
            await mongo_client.admin.command('ping')
        else:
            mongo_status = "error"
            mongo_error = "Cliente MongoDB no inicializado"
    except Exception as e:
        mongo_status = "error"
        mongo_error = str(e)
    
    return {
        "status": "ok" if mongo_status == "ok" else "error",
        "mongo": {
            "status": mongo_status,
            "error": mongo_error,
            "coleccion_quices": "ok" if coleccion_quices is not None else "error"
        }
    }

# Registro de rutas de autenticación
# Login y registro son los únicos endpoints públicos.
app.include_router(login.router)
app.include_router(registro.router)

# Registro de rutas de quices
# Unas manejan sesiones y resultados (PostgreSQL),
# las otras el CRUD de preguntas (MongoDB).
app.include_router(rutas_quices.router)
app.include_router(quices_mongo.router)

# CRUD de usuarios del sistema
app.include_router(usuarios.router)

# Reportes y estadísticas de auditoría
app.include_router(auditoria.router)

# Recuperación de contraseña por preguntas de seguridad
app.include_router(recuperar.router)

# CRUD de materias y asignación de profesores
app.include_router(materias.router)
