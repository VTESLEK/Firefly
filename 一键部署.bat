@echo off
chcp 65001 >nul
cd /d %~dp0

echo ====================================
echo  开始自动提交 Firefly 博客 ...
echo ====================================

:: 2. 暂存所有更改
git add .

:: 3. 自动生成提交信息（修复了百分号和空格问题）
git commit -m "Update blog: %date% %time%"

:: 4. 无论有没有新提交，都强制执行一次推送，把之前攒着的提交也送上去！
echo 正在推送到 GitHub...
git push origin master

echo ====================================
echo  同步完成！3 秒后窗口自动关闭...
echo ====================================
timeout /t 3 >nul