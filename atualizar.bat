@echo off
chcp 65001 >nul
title Atualizando a F.R.I.D.A.Y
cd /d "%~dp0"

echo.
echo   ===  F.R.I.D.A.Y  ===
echo   Atualizando...
echo.
rem Da tempo da FRIDAY fechar antes de mexer nos arquivos
timeout /t 3 /nobreak >nul

git pull || goto erro
call npm install || goto erro
call npm run build || goto erro
if not exist "resources\models\rostos\faceres.bin" call npm run modelo
if not exist "resources\models\maos\hand_landmarker.task" call npm run modelo

echo.
echo Pronto! Abrindo a FRIDAY...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b

:erro
echo.
echo Algo deu errado. Copie a mensagem acima e mande para o Claude.
pause
