import os
import motor.motor_asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
from pathlib import Path

# El .env está en la carpeta backend, un nivel arriba de aplicacion/
# Si no existe, load_dotenv() busca en el directorio actual por defecto
env_path = Path(__file__).resolve().parents[1] / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=str(env_path))
else:
    load_dotenv()

# --- CONFIGURACIÓN POSTGRESQL (SQLAlchemy) ---
DATABASE_URL = os.getenv("DATABASE_URL")

# pool_pre_ping revive conexiones caidas automaticamente
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Cada peticion http usa su propia sesion, no se comparten
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base para modelos
Base = declarative_base()

# --- CONFIGURACIÓN MONGODB (Motor) ---
# Motor es async, necesario para no bloquear el event loop de FastAPI
MONGO_URL = os.getenv("MONGO_URL")
mongo_client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)

# Sincronizado con tus nombres: base de datos y colección
db_mongo = mongo_client.quiz_base_mongo 
coleccion_quices = db_mongo.quices 
coleccion_auditoria = db_mongo.auditoria 

async def crear_indices_mongodb():
    """Crea índices necesarios en MongoDB para optimizar consultas de auditoría.
    Debe llamarse al iniciar la aplicación."""
    try:
        # Indices compuestos para las consultas mas frecuentes de auditoria
        await coleccion_auditoria.create_index(
            [("usuario.id", 1), ("fecha_operacion", -1)],
            background=True
        )
        await coleccion_auditoria.create_index(
            [("entidad.tipo", 1), ("fecha_operacion", -1)],
            background=True
        )
        await coleccion_auditoria.create_index(
            [("tipo_operacion", 1), ("fecha_operacion", -1)],
            background=True
        )
        # Los quices se buscan por autor casi siempre
        await coleccion_quices.create_index(
            [("metadatos.autor_id", 1)],
            background=True
        )
        print("[OK] Índices de MongoDB creados/verificados")
    except Exception as e:
        # Si no se pueden crear, no es critico, solo mas lentas las consultas
        print(f"[WARN] No se pudieron crear índices MongoDB: {e}")

# Cada ruta recibe una sesion nueva y se cierra sola al terminar
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

print("[OK] Conexiones a Postgres y MongoDB (quiz_base_mongo/quices) listas.")