---
title: "Firefly CMS：为博客打造的开源内容管理后台"
published: 2026-09-30
draft: false
description: "把自己用的博客后台开源了：部署在 Cloudflare Pages 上的内容管理器，密码登录、服务端持有 GitHub Token、发布即提交自动部署，支持文章 / 说说 / 友链管理与图床上传。"
image: https://d9f.cc.cd/file/1790765239813_image.png
tags:
  - 开源
  - Cloudflare
  - CMS
  - 博客
category: 博客教程
---

之前写过一篇 [PagesCMS 的原理与使用](/posts/pagescms/)，用了一段时间后，还是决定给自己写一个后台。原因很简单：PagesCMS 虽然好用，但它是一个通用产品——需要 GitHub OAuth 授权、界面是英文的、编辑表单要自己一个个字段配置，而且部署在别人的服务上，总感觉隔了一层。

于是就有了 **Firefly CMS**——一个完全按自己博客定制的开源内容管理后台，现在把代码整理好发布出来了。

**⭐ 开源地址：[https://github.com/VTESLEK/firefly-cms](https://github.com/VTESLEK/firefly-cms)**

::github{repo="VTESLEK/firefly-cms"}

![Firefly CMS 登录页](https://d9f.cc.cd/file/1790765403749_image.png)

## 它是什么

一句话：**部署在你自己 Cloudflare Pages 上的博客后台，浏览器里写内容，服务端提交到 GitHub 仓库，博客自动重新部署。**

整个链路是这样的：

```text
[ 浏览器：CMS 后台 ]
        │  密码登录（HMAC 签名令牌）
        ▼
[ Cloudflare Pages Functions ] ──── 图片上传 ───► [ 图床（CloudFlare-ImgBed）]
        │  持有 GitHub Token（仅服务端）
        ▼
[ GitHub Contents API：提交 Markdown / JSON ]
        │  commit 触发
        ▼
[ 博客 GitHub Actions 自动构建部署 ]
```

全程没有一个数据库：文章是 Markdown 文件，友链是 JSON 文件，都直接落在你的博客仓库里。数据在你手里，后台挂了随时可以换，仓库本身永远是最完整的备份。

![工作台](https://d9f.cc.cd/file/1790765239813_image.png)

## 功能一览

### 文章管理

- Markdown 编辑器，加粗 / 标题 / 引用 / 代码 / 链接一键插入
- **拖拽、粘贴、选择三种方式插图**，图片自动上传到图床并插入正文
- 完整的发布设置：Slug、发布 / 更新日期、分类、标签、摘要、封面图
- 草稿、置顶、允许评论开关
- 工具栏带字数统计，保存后 1-3 分钟博客自动更新

![文章编辑器](https://d9f.cc.cd/file/1790765511982_image.png)

### 说说管理

从后台直接发布说说，支持 Markdown 和配图（拖入即可），发布时间默认当前东八区时间，列表里可以随时编辑和删除。

![说说管理](https://d9f.cc.cd/file/1790765543721_image.png)

### 友链管理

可视化增删改友链：名称、地址、头像、标签、描述、权重排序、启用停用。本地先改，点「保存全部更改」一次性提交。

![友链管理](https://d9f.cc.cd/file/1790765563260_image.png)

### 界面定制

内置了主题设置抽屉：明暗模式、系统主色（8 种）、界面圆角，选择保存在本地。整体是 Art Design Pro 风格，多标签页 + 面包屑 + 可折叠侧边栏的布局。

![主题设置](https://d9f.cc.cd/file/1790765630147_image.png)

## 技术上几个值得说的点

**1. 无构建、无框架工程化**

前端就是 `public/` 下几个静态文件：Vue 3 + Element Plus 全部以 IIFE 形式 vendor 到本地，没有 npm build、没有打包器。克隆下来就是最终产物，部署即用，也方便想改样式的人直接上手改。

**2. Token 全程不进浏览器**

这是整个项目最核心的设计。GitHub Token 只存在于 Cloudflare 服务端的环境变量里，前端只拿到一个 HMAC-SHA256 签名的无状态令牌（密码参与签名、带 30 天有效期、改密码即全部失效）。所有 GitHub 请求都由 Pages Functions 中转，抓包也看不到任何敏感凭据。

**3. 图床上传走服务端代理**

图片上传不直连图床，而是经过 `/api/imgbed/upload` 由 Functions 代理：接口地址和 Token 同样在服务端环境变量注入，前端永远只知道最终返回的外链。目前对接的是 CloudFlare-ImgBed v2（Sanyue ImgHub），换图床只需要改一个文件。

**4. 鉴权无状态，零存储**

没有会话表、没有 KV：令牌本身就是「密码 + 有效期」的 HMAC 签名，服务端验签即可，改密码后旧令牌自然全部失效。

## 部署一个自己的

前提：你的博客是 Git 仓库托管在 GitHub 上（Astro / Hexo / Hugo / VuePress 均可，CMS 只负责往仓库写文件）。

**方式一：Wrangler CLI（推荐）**

```bash
npm install
npx wrangler login
npx wrangler pages project create firefly-cms --production-branch main
npx wrangler pages deploy
```

**方式二：推到 GitHub 后在 CF Dashboard 连接仓库**，构建命令留空、输出目录填 `public`。

然后设置环境变量（两边都需要）：

| 变量 | 说明 |
| ---- | ---- |
| `ACCESS_PASSWORD` | 访问密码，建议 16 位以上随机串 |
| `GITHUB_TOKEN` | GitHub Fine-grained PAT，只授权博客仓库、Contents 读写 |
| `GITHUB_OWNER` | GitHub 用户名 |
| `GITHUB_REPO` | 博客仓库名 |
| `GITHUB_BRANCH` | 博客分支，默认 master，可不设 |
| `IMGHUB_BASE` | 图床地址（不带尾斜杠），不配则上传功能不可用 |
| `IMGHUB_TOKEN` | 图床 API Token（需 upload 权限） |

GitHub Token 的创建入口：GitHub → Settings → Developer settings → **Fine-grained tokens**，Repository access 只勾选博客仓库，Permissions 里给 **Contents → Read and write** 即可。

## 安全设计小结

- GitHub Token 与图床 Token 仅存于服务端环境变量，前端不可见
- 令牌 = HMAC-SHA256(密码, 有效期)，30 天过期，改密码即全部失效
- 页面已设置 `noindex, nofollow`，不会被搜索引擎收录
- 建议访问密码使用长随机串，并只在可信设备上保存

## 最后

从 PagesCMS 迁过来之后，写说说和改文章的频率明显变高了——因为打开后台就能写，写完就发。这也是做这个项目最大的感受：**当发布内容的路径足够短时，你才会更愿意表达。**

如果对你有帮助，欢迎去仓库点个 Star，也欢迎提 Issue 和 PR：**[VTESLEK/firefly-cms](https://github.com/VTESLEK/firefly-cms)**
