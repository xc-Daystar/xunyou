@echo off
chcp 65001 >nul
echo 正在启动通宝计算器...
echo.
echo 启动后请访问: http://localhost:3000
echo 按 Ctrl+C 可停止服务器
echo.
npm run dev
pause
