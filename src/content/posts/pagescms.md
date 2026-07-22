---
title: 开源的文章管理器—PagesCMS
published: 2026-07-22
image: https://d9f.cc.cd/file/1784727885976_image.png
tags:
  - 教程
category: 博客教程
sticky: false
draft: false
---
# PagesCMS原理与使用教程）

**Pages CMS** 是一个轻量级、**基于 Git（Git-based）** 的开源无头内容管理系统（Headless CMS）。它没有传统的独立数据库，而是直接把你的 **GitHub 仓库** 作为数据源。

---

## 一、 Pages CMS 的底层工作原理

Pages CMS 的核心逻辑可以总结为：

> **可视化界面 → GitHub API → 触发 Git Commit → 自动构建部署**

```text

[ 用户在 Pages CMS 后台操作 ]

             │

             ▼ (通过 GitHub OAuth 授权)

[ Pages CMS 调用 GitHub API ]

             │

             ▼ (在你的仓库进行文件读写)

[ 仓库 src/content/posts/ 产生变动 (Commit) ]

             │

             ▼ (Webhooks 自动触发)

[ Vercel / Cloudflare Pages / GitHub Pages ]

             │

             ▼ (执行 astro build)
```  
## 二、 使用教程

### Step 1. 准备配置文件
访问你的 **GitHub 博客仓库**，在仓库根目录下创建一个新文件，命名为 `.pages.yml`。

### Step 2. 连接并配置后台
1. 访问 [Pages CMS 官网](https://pagescms.org/)，使用 **GitHub 账号登录**。
2. 登录后选择你的博客仓库。
3. 首次使用需要配置：点击左侧导航栏的 **Configuration** 选项卡，输入以下 YAML 配置代码并保存  
```yaml
content:
  - name: posts
    label: 文章列表
    type: collection
    path: src/content/posts
    filename: "{slug}.md"
    view:
      fields: [title, published, category, sticky, draft] # 在后台列表中加上 sticky 列，方便一眼看到置顶状态
      search: [title, description, tags, category]
      sort: [published]
      order: desc

    fields:
      - name: title
        label: 文章标题
        type: string
        required: true

      - name: published
        label: 发布时间
        type: date
        options:
          format: yyyy-MM-dd
        required: true

      - name: description
        label: 文章描述
        type: text

      - name: image
        label: 封面图 (图床 URL)
        type: string

      - name: tags
        label: 标签
        type: string
        list: true

      - name: category
        label: 分类
        type: string

      - name: sticky
        label: 是否置顶
        type: boolean
        default: false # 默认不置顶

      - name: draft
        label: 是否草稿
        type: boolean
        default: false

      - name: body
        label: 文章正文
        type: rich-text
```
保存完成后，你就可以像使用动态博客一样，优雅地在网页端撰写和编辑博客了！

其实你现在看到的这篇博文，就是直接用 PagesCMS 编写并发布的
