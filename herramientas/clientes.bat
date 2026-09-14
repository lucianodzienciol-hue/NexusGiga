@echo off
chcp 65001 >nul
title Nexus - Gestión de clientes (tiendas online)
:inicio
echo ============================================
echo   NEXUS - Clientes online (Cloudflare)
echo ============================================
echo.
set /p WORKER=Worker (Enter = https://nexus-tenants.lucianodzienciol.workers.dev):
if "%WORKER%"=="" set WORKER=https://nexus-tenants.lucianodzienciol.workers.dev
set /p PANEL=PANEL_TOKEN (Enter = usar el guardado):
echo.
echo   1) Listar tiendas
echo   2) Alta (nuevo cliente)
echo   3) Rotar token
echo   4) Suspender
echo   5) Reactivar
echo   6) Verificar
echo   7) Baja
echo   8) Salir
echo.
set /p OP=Opcion:
if "%OP%"=="8" exit /b
if "%OP%"=="1" node "%~dp0clientes.mjs" listar --worker "%WORKER%" --panel-token "%PANEL%" & goto fin
if "%OP%"=="3" set /p SLUG=Slug: & node "%~dp0clientes.mjs" rotar --slug "%SLUG%" --worker "%WORKER%" --panel-token "%PANEL%" & goto fin
if "%OP%"=="4" set /p SLUG=Slug: & node "%~dp0clientes.mjs" suspender --slug "%SLUG%" --worker "%WORKER%" --panel-token "%PANEL%" & goto fin
if "%OP%"=="5" set /p SLUG=Slug: & node "%~dp0clientes.mjs" reactivar --slug "%SLUG%" --worker "%WORKER%" --panel-token "%PANEL%" & goto fin
if "%OP%"=="6" node "%~dp0clientes.mjs" verificar --worker "%WORKER%" --panel-token "%PANEL%" & goto fin
if "%OP%"=="7" goto baja
if "%OP%"=="2" goto alta
goto inicio
:alta
set /p SLUG=Slug (minusculas-guiones):
set /p COMERCIO=Comercio:
set /p CONTACTO=Contacto:
set /p EMAIL=Email:
set /p DOMINIO=Dominio propio (Enter = ninguno):
node "%~dp0clientes.mjs" nuevo --slug "%SLUG%" --comercio "%COMERCIO%" --contacto "%CONTACTO%" --email "%EMAIL%" --dominio "%DOMINIO%" --worker "%WORKER%" --panel-token "%PANEL%"
goto fin
:baja
set /p SLUG=Slug:
set /p BORRA=Borrar datos tambien? (SI = borrar, Enter = solo suspender):
if /i "%BORRA%"=="SI" ( node "%~dp0clientes.mjs" baja --slug "%SLUG%" --borrar-datos --worker "%WORKER%" --panel-token "%PANEL%" ) else ( node "%~dp0clientes.mjs" baja --slug "%SLUG%" --worker "%WORKER%" --panel-token "%PANEL%" )
goto fin
:fin
echo.
pause
cls
goto inicio
