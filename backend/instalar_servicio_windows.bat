@echo off
:: Instala el backend como servicio de Windows usando NSSM
:: Ejecutar este archivo como Administrador

echo ============================================
echo  Instalador de servicio Windows - Backend
echo ============================================
echo.

:: Verificar que se ejecuta como Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Ejecuta este archivo como Administrador
    echo Clic derecho sobre el archivo ^> "Ejecutar como administrador"
    pause
    exit /b 1
)

:: Rutas
set "BACKEND_DIR=%~dp0"
set "UVICORN=%BACKEND_DIR%venv\Scripts\uvicorn.exe"
set "NSSM=%BACKEND_DIR%nssm.exe"
set "SERVICIO=ContableBackend"

:: Verificar NSSM
if not exist "%NSSM%" (
    echo NSSM no encontrado. Descargando...
    powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'"
    powershell -Command "Expand-Archive '%TEMP%\nssm.zip' '%TEMP%\nssm' -Force"
    copy "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "%NSSM%" >nul
    echo NSSM descargado correctamente.
)

:: Detener y eliminar si ya existe
sc query %SERVICIO% >nul 2>&1
if %errorLevel% equ 0 (
    echo Deteniendo servicio existente...
    "%NSSM%" stop %SERVICIO%
    "%NSSM%" remove %SERVICIO% confirm
)

:: Instalar el servicio
echo Instalando servicio %SERVICIO%...
"%NSSM%" install %SERVICIO% "%UVICORN%"
"%NSSM%" set %SERVICIO% AppDirectory "%BACKEND_DIR%"
"%NSSM%" set %SERVICIO% AppParameters "main:app --host 0.0.0.0 --port 8000"
"%NSSM%" set %SERVICIO% DisplayName "Contable Platform Backend"
"%NSSM%" set %SERVICIO% Description "Backend FastAPI para la plataforma contable"
"%NSSM%" set %SERVICIO% Start SERVICE_AUTO_START
"%NSSM%" set %SERVICIO% AppStdout "%BACKEND_DIR%logs\backend.log"
"%NSSM%" set %SERVICIO% AppStderr "%BACKEND_DIR%logs\backend_error.log"
"%NSSM%" set %SERVICIO% AppRotateFiles 1
"%NSSM%" set %SERVICIO% AppRotateBytes 10485760

:: Crear carpeta de logs
if not exist "%BACKEND_DIR%logs" mkdir "%BACKEND_DIR%logs"

:: Iniciar el servicio
echo Iniciando servicio...
"%NSSM%" start %SERVICIO%

echo.
echo ============================================
echo  Servicio instalado correctamente
echo  Nombre: %SERVICIO%
echo  El agente correra todas las noches aunque
echo  no haya sesion abierta en Windows.
echo ============================================
echo.
echo Para ver logs: %BACKEND_DIR%logs\backend.log
echo Para detener:  nssm stop ContableBackend
echo Para desinstalar: nssm remove ContableBackend confirm
echo.
pause
