@echo off
rem Installe sonar pour Windows (extension de Claude Desktop). Double-cliquer.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sonar.ps1" installer
pause
