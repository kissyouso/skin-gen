@echo off
chcp 65001 >nul
title Gerador de Imagens de VIP
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto semnode

if not exist "node_modules\skia-canvas" goto instalar
if not exist "node_modules\tsx" goto instalar
goto rodar

:instalar
echo Instalando dependencias pela primeira vez, aguarde...
call npm install --no-audit --no-fund
if not exist "node_modules\skia-canvas" goto falhou
if not exist "node_modules\tsx" goto falhou
echo.
echo Dependencias instaladas!
echo.

:rodar
call npm start
echo.
pause
exit /b 0

:semnode
echo [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e abra de novo.
pause
exit /b 1

:falhou
echo.
echo [ERRO] Nao foi possivel instalar skia-canvas/tsx. Veja a mensagem acima.
echo Verifique a internet e tente de novo. Se persistir, apague a pasta node_modules.
pause
exit /b 1
