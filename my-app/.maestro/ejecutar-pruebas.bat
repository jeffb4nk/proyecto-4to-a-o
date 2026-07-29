@echo off
echo ============================================
echo  QUIZIMA - Suite de pruebas de login
echo ============================================
echo.
echo Prerrequisitos:
echo 1. App instalada (com.quizima.app)
echo 2. Celular conectado por USB con depuracion activa
echo 3. Backend corriendo
echo.
echo Pruebas disponibles:
echo   01-validaciones-login     - Validaciones del formulario
echo   02-login-admin            - Login como administrador
echo   03-registro-estudiante    - Registro de nuevo estudiante
echo   04-login-estudiante       - Login como estudiante registrado
echo   05-recuperar-contrasena   - Recuperacion de contrasena
echo   suite-completa           - Todas las pruebas en orden
echo.
echo ============================================
echo.

set /p opcion="Que prueba ejecutar? (1-5 / all): "

if "%opcion%"=="1" call maestro test .maestro\01-validaciones-login.yaml
if "%opcion%"=="2" call maestro test .maestro\02-login-admin.yaml
if "%opcion%"=="3" call maestro test .maestro\03-registro-estudiante.yaml
if "%opcion%"=="4" call maestro test .maestro\04-login-estudiante.yaml
if "%opcion%"=="5" call maestro test .maestro\05-recuperar-contrasena.yaml
if "%opcion%"=="all" call maestro test .maestro\suite-completa.yaml

if errorlevel 1 (
    echo.
    echo Error al ejecutar la prueba.
    pause
    exit /b 1
)

echo.
echo Prueba completada.
pause
