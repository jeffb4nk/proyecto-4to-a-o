# ======================================================
# Esquemas Pydantic para los quices en MongoDB
# Separo estos esquemas de los de PostgreSQL porque
# los quices son documentos anidados (preguntas dentro
# del mismo documento) y se validan diferente.
# ======================================================

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from bson import ObjectId


# Cada opción de respuesta de una pregunta
class Respuesta(BaseModel):
    texto: str
    es_correcta: bool = False


# Una pregunta dentro del quiz
# El tipo puede ser: opcion_multiple, seleccion_multiple o completacion
class Pregunta(BaseModel):
    nro_orden: int
    tipo: str
    categoria: Optional[str] = None
    enunciado: str
    multimedia: Optional[dict] = None
    puntos_si_es_dificultad: float = 10.0
    tiempo_limite_segundos: int = 20
    opciones: List[Respuesta]


# Información general del quiz: título, autor, materia, etc.
class MetadatosQuiz(BaseModel):
    titulo: str
    tema: Optional[str] = None
    materia_id: Optional[int] = None
    recompensa_puntos_app: int = 0
    imagen_portada: Optional[str] = None
    autor_id: int
    fecha_creacion: datetime = Field(default_factory=datetime.utcnow)
    modo_juego: Optional[str] = None
    ponderacion: Optional[int] = None


# Esquema principal para crear un quiz en MongoDB
class QuizCrear(BaseModel):
    metadatos: MetadatosQuiz
    preguntas: List[Pregunta]


# Lo que devolvemos al consultar un quiz
# Convertimos el ObjectId a string para que sea JSON serializable
class QuizRespuesta(QuizCrear):
    id: str = Field(alias="_id")
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}
