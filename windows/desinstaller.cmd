@echo off
rem Retire sonar pour Windows de Claude Desktop. Double-cliquer.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sonar.ps1" desinstaller
pause
