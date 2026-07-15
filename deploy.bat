@echo off
:: 1. 解决中文乱码问题
chcp 65001 >nul

:: 确保在当前目录下执行
cd /d %~dp0

echo ====================================
echo  开始自动提交 Firefly 博客 ...
echo ====================================

:: 2. 暂存所有更改
git add .

:: 3. 自动生成带时间的提交信息
git commit -m "Update blog: %date% %time%"

:: 4. 推送到远程仓库（这里已经帮你改成了 master ！）
git push origin master

echo ====================================
echo  同步完成！3 秒后窗口自动关闭...
echo ====================================
timeout /t 3 >nul