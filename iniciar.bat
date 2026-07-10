@echo off
echo Iniciando Plataforma Contable...

cd /d "%~dp0backend"
start "Backend API" cmd /k "venv\Scripts\uvicorn main:app --port 8000 --reload"

timeout /t 3 /nobreak > nul

cd /d "%~dp0frontend"
start "Frontend" cmd /k "npm run dev"

timeout /t 4 /nobreak > nul

echo.
echo ====================================
echo  Plataforma Contable iniciada
echo  Abri: http://localhost:5173
echo ====================================
start http://localhost:5173/logout
