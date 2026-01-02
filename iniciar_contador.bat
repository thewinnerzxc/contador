@echo off
cd /d "%~dp0"
call node generate-config.js
start "" "node_modules\electron\dist\electron.exe" .
exit
