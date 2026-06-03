@echo off
title Nexus POS - Terminal Unificada
echo =================================================================
echo        NEXUS POS - SISTEMA UNIFICADO
echo =================================================================
echo   Admin POS:   http://localhost:3010
echo   Tienda Web:  http://localhost:3010/web
echo =================================================================
echo.

cd /d "%~dp0"

if not exist package.json (
    echo [ERROR] No se encontro 'package.json'. Ejecute desde la carpeta extraida.
    pause
    exit /b
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado. Descarguelo en https://nodejs.org/
    pause
    exit /b
)

if not exist node_modules (
    echo [INFO] Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo al instalar dependencias.
        pause
        exit /b
    )
)

echo [INFO] Iniciando servidor (Puerto 3010)...
set NODE_ENV=development
set PORT=3010

call npm run dev

echo.
echo [ALERTA] Servidor detenido.
echo.
pause

