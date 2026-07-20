@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "release\win-unpacked\店财通.exe" (
  start "" "release\win-unpacked\店财通.exe"
  exit /b 0
)
if exist "店财通.exe" (
  start "" "店财通.exe"
  exit /b 0
)
if exist "release\win-unpacked\电商财务经营助手.exe" (
  start "" "release\win-unpacked\电商财务经营助手.exe"
  exit /b 0
)
if exist "电商财务经营助手.exe" (
  start "" "电商财务经营助手.exe"
  exit /b 0
)

echo 未找到可执行文件。请解压便携版后双击「店财通.exe」，
echo 或在源码目录执行: npm run build:dir
pause
