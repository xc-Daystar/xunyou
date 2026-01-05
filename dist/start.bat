@echo off
title 界园游龙小助手 - 启动脚本
echo.
echo ========================================
echo   界园游龙小助手 - 通宝投率计算器
echo ========================================
echo.
echo 正在尝试启动应用...
echo.

REM 检查是否存在Python
python --version >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo 找到Python，使用Python启动服务器...
    echo 请在浏览器中访问: http://localhost:8000
    echo.
    echo 按 Ctrl+C 停止服务器
    python -m http.server 8000
    goto :end
)

REM 检查是否存在Node.js
node --version >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo 找到Node.js，使用Node.js启动服务器...
    echo.
    echo 按 Ctrl+C 停止服务器
    npx serve . -p 8000
    goto :end
)

REM 如果都没有，尝试直接打开HTML文件
echo 未找到Python或Node.js，尝试直接在浏览器中打开...
echo.
echo 请确保您的系统有默认浏览器
start "" index.html
echo 应用已尝试在浏览器中打开
timeout /t 3 >nul

:end
echo.
pause