# Como Correr QUIZIMA - Guia Completa

## 1. Requisitos Previos

### Para el Backend
- Python 3.11 o superior
- PostgreSQL 16
- MongoDB 7

### Para el Frontend
- Node.js 18 o superior
- npm (viene con Node)
- Expo Go (app en tu celular) o un emulador Android/iOS

### Herramientas utiles
- Git
- pgAdmin 4 (viene con PostgreSQL)
- MongoDB Compass (viene con MongoDB)
- VS Code (recomendado)

---

## 2. Clonar el Repositorio

```bash
git clone <url-del-repo>
cd Proyecto-Quiz-IMA-main
```

---

## 3. Configurar la Base de Datos

### 3.1 Instalar PostgreSQL

1. Descargar desde https://www.postgresql.org/download/windows/
2. Ejecutar el instalador
3. Configuracion:
   - Puerto: 5432 (default)
   - Usuario: postgres
   - Contrasena: 123 (o la que prefieras)
4. Al finalizar, abrir pgAdmin 4

### 3.2 Crear la base de datos PostgreSQL

1. Abrir pgAdmin 4
2. Clic derecho en "Servers" > "Register" > "Server"
3. Pestaña Connection:
   - Host: localhost
   - Port: 5432
   - Username: postgres
   - Password: la que pusiste
4. Clic en "Save"
5. Clic derecho en "Databases" > "Create" > "Database"
6. Nombre: quizima_db
7. Seleccionar la base > clic derecho > "Query Tool"
8. Abrir el archivo `plantilla_postgresql.sql`
9. Copiar y pegar todo en el editor de consultas
10. Clic en "Execute" (F5)
11. Deberias ver los esquemas `seguridad` y `evaluacion`

### 3.3 Instalar MongoDB

1. Descargar MongoDB 7 Community Server desde https://www.mongodb.com/try/download/community
2. Marcar "Install MongoDB Compass"
3. Puerto: 27017 (default)

### 3.4 Crear la base de datos MongoDB

1. Abrir MongoDB Compass
2. Conectarse a mongodb://localhost:27017
3. Clic en "Create Database"
4. Database Name: quiz_base_mongo
5. Collection Name: quices
6. Clic en "Create Database"
7. Dentro de quiz_base_mongo, clic en "+"
8. Collection Name: auditoria
9. Clic en "Create Collection"

Resultado:
```
quiz_base_mongo
├── quices
└── auditoria
```

---

## 4. Configurar Variables de Entorno

Crear el archivo `backend/.env` con el siguiente contenido:

```env
# PostgreSQL
DATABASE_URL=postgresql://postgres:123@localhost:5432/quizima_db

# MongoDB
MONGO_URL=mongodb://localhost:27017/quiz_base_mongo
```

> Si pusiste otra contrasena en PostgreSQL, cambia 123 por la tuya.

---

## 5. Configurar y Correr el Backend

### 5.1 Crear entorno virtual

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
```

### 5.2 Instalar dependencias

```powershell
pip install -r aplicacion/requirements.txt
```

### 5.3 Iniciar el servidor

```powershell
python -m uvicorn aplicacion.main:app --host 0.0.0.0 --port 8000 --reload
```

> **Importante**: `--host 0.0.0.0` hace que el backend acepte conexiones desde otros dispositivos en la red. Sin esto, solo funciona en la misma computadora.

### 5.4 Verificar

Abrir en el navegador: http://localhost:8000

Deberias ver: `{"mensaje":"!El backend esta vivo!","status":"ok"}`

---

## 6. Configurar y Correr el Frontend

### 6.1 Instalar dependencias

```powershell
cd my-app
npm install
```

### 6.2 Iniciar Expo

```powershell
npx expo start
```

### 6.3 Correr en diferentes plataformas

**En tu celular (recomendado para empezar):**
1. Descargar "Expo Go" en tu celular (Google Play o App Store)
2. Escanear el codigo QR que aparece en la terminal
3. La app se abrira en tu celular

**En navegador web:**
```powershell
npx expo start --web
```

**En emulador Android:**
```powershell
npx expo run:android
```

**En emulador iOS (solo Mac):**
```powershell
npx expo run:ios
```

---

## 7. Credenciales por Defecto

### Admin Master
- Email: admin@master.com
- Contrasena: Master123!

### PostgreSQL
- Usuario: postgres
- Contrasena: 123

### MongoDB
- Sin autenticacion (default)

---

## 8. Estructura del Proyecto

```
Proyecto-Quiz-IMA-main/
├── plantillas de BD/          ← Estas instrucciones + plantilla SQL
├── backend/                   ← Servidor Python (FastAPI)
│   └── aplicacion/
│       ├── main.py           ← Punto de entrada
│       ├── conexion_bd.py    ← Conexiones a BD
│       ├── modelos.py        ← Modelos de datos
│       ├── esquemas.py       ← Validaciones
│       ├── dependencias.py   ← Auth JWT
│       ├── requirements.txt  ← Dependencias Python
│       └── rutas/            ← Endpoints de la API
└── my-app/                    ← App movil (Expo/React Native)
    ├── app/                   ← Pantallas
    ├── components/            ← Componentes UI
    ├── utils/                 ← Funciones auxiliares
    ├── types/                 ← Tipos TypeScript
    ├── contexts/              ← Estado global
    └── hooks/                 ← Hooks personalizados
```

---

## 9. Solucion de Problemas

### "No puedo conectar en pgAdmin"
- Verificar que el servicio PostgreSQL este corriendo (Services.msc)
- Revisar que la contrasena sea la correcta

### "No veo las tablas"
- Despues de ejecutar el script SQL, actualizar con F5

### "No puedo conectar en Compass"
- Verificar que el servicio MongoDB este corriendo (Services.msc)

### "Error de contrasena en PostgreSQL"
- Si no recuerdas la contrasena, reinstala PostgreSQL

### "npm no se reconoce"
- Reinstalar Node.js desde https://nodejs.org

### "Expo Go no conecta"
- Asegurate de que el celular y la computadora esten en la misma red WiFi
- Verificar que el backend este corriendo con `--host 0.0.0.0`
- Verificar que no hay un firewall bloqueando el puerto 8000

### "Error de puerto ocupado"
- Matar el proceso que usa el puerto:
  ```powershell
  netstat -ano | findstr :8000
  taskkill /PID <numero> /F
  ```

---

## 10. Comandos Utiles

```powershell
# Backend
cd backend
venv\Scripts\activate                                            # Activar entorno virtual
python -m uvicorn aplicacion.main:app --host 0.0.0.0 --port 8000 --reload # Iniciar servidor

# Frontend
cd my-app
npx expo start                           # Iniciar Expo
npx expo start --clear                   # Limpiar cache
npm install                              # Reinstalar dependencias
```
