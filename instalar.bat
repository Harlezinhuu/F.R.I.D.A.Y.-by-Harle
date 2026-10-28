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

:chave
findstr /r /c:"^GEMINI_API_KEY=..*" ".env" >nul 2>nul && goto rodar
echo.
echo ------------------------------------------------------------
echo  Falta so a sua chave do Gemini.
echo  1. Pegue uma chave gratis em https://aistudio.google.com/apikey
echo  2. No Bloco de Notas que vai abrir, cole a chave LOGO DEPOIS
echo     de GEMINI_API_KEY=  (na mesma linha, sem espaco)
echo  3. Aperte Ctrl+S para SALVAR. Fechar sem salvar nao grava a chave.
echo ------------------------------------------------------------
notepad ".env"
echo.
echo Depois de salvar, volte aqui e aperte qualquer tecla.
pause >nul
findstr /r /c:"^GEMINI_API_KEY=..*" ".env" >nul 2>nul && goto rodar
echo.
echo A chave ainda nao foi salva no arquivo. Vamos tentar de novo.
goto chave

:rodar
echo.
echo Montando a FRIDAY (pode levar um minuto)...
call npm run build || goto erro

echo.
echo Criando o atalho "F.R.I.D.A.Y" no Menu Iniciar...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Programs')+'\F.R.I.D.A.Y.lnk'); $s.TargetPath='%PASTA%\node_modules\electron\dist\electron.exe'; $s.Arguments='\"%PASTA%\"'; $s.WorkingDirectory='%PASTA%'; $s.IconLocation='%PASTA%\resources\icon.ico'; $s.Description='F.R.I.D.A.Y'; $s.Save()" >nul 2>nul

echo.
echo Abrindo a FRIDAY... Diga "Friday" para chamar.
echo A partir de agora ela abre sozinha quando o Windows ligar (da para desligar no icone da bandeja).
echo Para atualizar depois: icone da bandeja ^> Atualizar a FRIDAY.
start "" "%PASTA%\node_modules\electron\dist\electron.exe" "%PASTA%"
timeout /t 5 >nul
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
