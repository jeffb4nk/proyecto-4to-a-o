# Guia de Instalacion de Bases de Datos - QuizIMA

## Requisitos

- **PostgreSQL 16** - https://www.postgresql.org/download/windows/
- **pgAdmin 4** (viene incluido con PostgreSQL)
- **MongoDB 7** + **MongoDB Compass** - https://www.mongodb.com/try/download/community

---

## 1. Instalar PostgreSQL

1. Descarga el instalador desde [postgresql.org](https://www.postgresql.org/download/windows/)
2. Ejecuta el instalador
3. Durante la instalacion:
   - Puerto: **5432** (default)
   - Superuser: **postgres**
   - Contrasena: **123** (o la que prefieras)
   - Demas opciones: default
4. Al finalizar, busca **pgAdmin 4** en el menu de inicio

## 2. Instalar MongoDB

1. Descarga **MongoDB 7 Community Server** desde [mongodb.com](https://www.mongodb.com/try/download/community)
2. Durante la instalacion, marca la opcion **"Install MongoDB Compass"**
3. Puerto: **27017** (default)

---

## 3. Crear la base de datos en pgAdmin

1. Abre **pgAdmin 4** desde el menu de inicio
2. En el panel izquierdo, da clic derecho en **"Servers"** > **"Register"** > **"Server..."**
3. En la pestana **General**, pon un nombre (ej: "QuizIMA Local")
4. En la pestana **Connection**:
   - Host: `localhost`
   - Port: `5432`
   - Username: `postgres`
   - Password: `123` (la que pusiste al instalar)
   - Marca **"Save password"**
5. Clic en **"Save"**
6. Ahora en el panel izquierdo, expande tu servidor > clic derecho en **"Databases"** > **"Create"** > **"Database..."**
7. Pon de nombre: `quizima_db` y clic en **"Save"**
8. Selecciona la base `quizima_db` > clic derecho > **"Query Tool"**
9. Abre el archivo `plantilla_postgresql.sql` (esta en esta misma carpeta)
10. Copia todo el contenido y pegalo en el editor de consultas
11. Clic en el boton **"Execute"** (triangulo o F5)
12. En el panel izquierdo, expande `quizima_db` > **"Schemas"** > deberias ver `seguridad` y `evaluacion`

---

## 4. Crear la base de datos en MongoDB Compass

1. Abre **MongoDB Compass**
2. Conectate a `mongodb://localhost:27017` (default)
3. Clic en el boton **"Create Database"**
4. Database Name: `quiz_base_mongo`
5. Collection Name: `quices`
6. Clic en **"Create Database"**
7. Ahora, dentro de `quiz_base_mongo`, clic en el icono **"+"** (Create Collection)
8. Collection Name: `auditoria`
9. Clic en **"Create Collection"**
10. En el panel izquierdo deberias ver:
    ```
    quiz_base_mongo
    ├── quices
    └── auditoria
    ```

---

## 5. Configurar el archivo .env

Abre el archivo `backend\.env` y asegurate que tenga esto:

```env
# PostgreSQL
DATABASE_URL=postgresql://postgres:123@localhost:5432/quizima_db

# MongoDB
MONGO_URL=mongodb://localhost:27017/quiz_base_mongo
```

> Si pusiste otra contrasena al instalar PostgreSQL, cambia `123` por la tuya.

---

## 6. Verificar que funciona

### Probar PostgreSQL (pgAdmin)

1. En pgAdmin, expande `quizima_db` > **"Schemas"** > **"seguridad"** > **"Tables"**
2. Deberias ver: `tbl_roles`, `tbl_usuarios`, `tbl_preguntas_seguridad`, etc.
3. Clic derecho en `tbl_roles` > **"View/Edit Data"** > **"All Rows"**
4. Deberias ver 3 filas: `alumno`, `profesor`, `master`

### Probar MongoDB (Compass)

1. En Compass, haz clic en la coleccion `quices`
2. Deberia aparecer la pestana **"Documents"** (vacia por ahora)
3. Haz clic en **"Indexes"** para ver los indices de la coleccion

### Probar el backend

Abre una terminal (PowerShell o cmd) y ejecuta:

```powershell
cd backend
pip install -r aplicacion/requirements.txt
python -m uvicorn aplicacion.servidor:app --host 0.0.0.0 --port 8000 --reload
```

Si ves algo como `Uvicorn running on http://0.0.0.0:8000`, todo esta funcionando.

---

## Solucion de problemas

**"No puedo conectar en pgAdmin"** - Verifica que el servicio `postgresql-x64-16` este corriendo (Services.msc). Revisa que la contrasena sea la correcta.

**"No veo las tablas en pgAdmin"** - Despues de ejecutar el script, actualiza con F5 o clic derecho > **"Refresh"**.

**"No puedo conectar en Compass"** - Verifica que el servicio `MongoDB` este corriendo (Services.msc).

**"Error de contrasena en PostgreSQL"** - Si no recuerdas la contrasena, reinstala PostgreSQL o busca en internet como resetear la contrasena de postgres.
