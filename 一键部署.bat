@echo off
chcp 65001 >nul
cd /d %~dp0

echo ====================================
echo  开始自动提交 Firefly 博客 ...
echo ====================================

:: 1. 标记构建平台（站点信息卡片会显示这个名字）
set FIREFLY_BUILD_PLATFORM=Cloudflare Pages

:: 2. 构建最新内容（失败则终止，避免部署旧版）
echo 正在构建...
call pnpm build
if errorlevel 1 (
    echo 构建失败！已终止部署，请检查报错。
    pause
    exit /b 1
)

:: 3. 暂存所有更改（含构建生成的变更）
git add .

:: 4. 自动生成提交信息（修复了百分号和空格问题）
git commit -m "Update blog: %date% %time%"

:: 5. 无论有没有新提交，都强制执行一次推送，把之前攒着的提交也送上去！
echo 正在推送到 GitHub...
git push origin master

:: 6. 部署到 Cloudflare Pages（xane.eu.cc 实际生效的部署）
echo 正在部署到 Cloudflare Pages...
call npx wrangler pages deploy dist --project-name=firefly-blog --branch=master --commit-dirty=true

echo ====================================
echo  同步完成！3 秒后窗口自动关闭...
echo ====================================
timeout /t 3 >nul
