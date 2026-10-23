@echo off
chcp 65001 >nul
title Instalador da F.R.I.D.A.Y
set "PASTA=%USERPROFILE%\FRIDAY"

echo.
echo   ===  F.R.I.D.A.Y  ===
echo   Instalando em %PASTA%
echo.

where node >nul 2>nul || goto semnode
where git >nul 2>nul || goto semgit

if exist "%PASTA%\.git" (
  echo Atualizando o projeto...
  cd /d "%PASTA%" && git pull || goto erro
) else (
  echo Baixando o projeto do GitHub...
  git clone https://github.com/Harlezinhuu/F.R.I.D.A.Y.-by-Harle.git "%PASTA%" || goto erro
)
cd /d "%PASTA%"

echo.
echo Instalando as dependencias (pode levar alguns minutos)...
call npm install || goto erro

echo.
echo Baixando o reconhecedor da palavra "Friday" (~40 MB)...
call npm run modelo || echo   Aviso: nao deu para baixar o modelo. A FRIDAY funciona sem ele, acordando com qualquer fala.

if not exist ".env" copy ".env.example" ".env" >nul
findstr /r /c:"^GEMINI_API_KEY=..*" ".env" >nul 2>nul && goto rodar

echo.
echo ------------------------------------------------------------
echo  Falta so a sua chave do Gemini.
echo  1. Pegue uma chave gratis em https://aistudio.google.com/apikey
echo  2. No Bloco de Notas que vai abrir, cole depois de GEMINI_API_KEY=
echo  3. Salve (Ctrl+S), feche o Bloco de Notas e volte aqui.
echo ------------------------------------------------------------
start /wait notepad ".env"

:rodar
echo.
echo Iniciando a FRIDAY... Diga "Friday" para chamar.
echo Ctrl+Alt+Espaco silencia. Para fechar, use o icone na bandeja ou feche esta janela.
call npm run dev
goto fim

:semnode
echo O Node.js nao esta instalado.
choice /c SN /m "Instalar agora pelo winget"
if errorlevel 2 goto fim
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo Pronto. Feche esta janela e abra o instalador de novo.
pause
goto fim

:semgit
echo O Git nao esta instalado.
choice /c SN /m "Instalar agora pelo winget"
if errorlevel 2 goto fim
winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
echo.
echo Pronto. Feche esta janela e abra o instalador de novo.
pause
goto fim

:erro
echo.
echo Algo deu errado. Copie a mensagem acima e mande para o Claude.
pause

:fim
