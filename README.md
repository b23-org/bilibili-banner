# Bilibili Banner 档案馆

一个围绕 Bilibili 首页 Banner 的历史档案与还原项目。

项目收集并整理了 2013 年至今的大部分首页 Banner，结合公开页面、历史快照与逆向分析结果，尽可能复现不同阶段的视觉表现与交互逻辑。

## 🚀 [在线预览](https://bilibili-banner.dankt.in/)

<div align="center">

![cover-2015-06-27](docs/image/cover-2015-06-27.png)

![cover-2021-04-12](docs/image/cover-2021-04-12.png)

![cover-2022-08-06](docs/image/cover-2022-08-06.png)

</div>

## 🌟 核心特性

- 🕰️ **跨越十年的记录**：收录自 2013 年至今的大部分首页 Banner，覆盖从静态单图到多图层动态 Banner 的演变过程。
- 🎯 **动态交互还原**：基于逆向分析复现官方动态 Banner 的交互逻辑，包括视差、位移、模糊、转场等核心效果。
- 🕹️ **重现季节主题扩展**：重现 2022 年出现的春、夏、秋三个季性节主题网页互动小游戏和扩展。
- ⚙️ **工程化数据维护**：提供抓取、解析、校验和资源归档工具，方便新增数据并维护现有存档。

## 🛠️ 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 本地开发

```bash
pnpm dev
```

### 3. 构建与预览

```bash
pnpm build
pnpm preview
```

## 📥 数据抓取指南

本项目提供了用于抓取当前最新 Banner 以及从 [Wayback Machine][Wayback-Machine] 抓取历史快照 Banner 的工具脚本。

抓取脚本会自动提取 Banner 的图层数据、预览图、Logo 等数据，并将图片等资源下载到本地，同时自动生成 `data.json` 并将其注册到项目 `manifest` 中。

抓取后的数据和资源会自动归档到 `public/assets/{YYYY}/{YYYY-MM-DD}[-*]` 目录中。

> [!IMPORTANT]
> 抓取脚本在自动运行完毕后，生成的 Banner 标题（`banner-title`）通常为网页的日期。因此在完成抓取后，**请务必手动编辑** [src/data/banner/](src/data/banner/) 目录下对应记录所在年份的配置文件（例如 [2026.json](src/data/banner/2026.json)），修改对应记录的 `name` 属性。
> ```diff
>   {
>     "date": "2026-01-09",
>     "refs": [
>       {
> +       "name": "雪林候车",
> -       "name": "2026-01-09",
>         "path": "2026-01-09-h00-t0",
>         "tags": ["split-layer"],
>         "tid": [0]
>       }
>     ]
>   }
> ```

### 1. 抓取当前最新 Banner

用于抓取当前 B 站主页的最新 Banner 资源和配置。

**运行命令**：

```bash
pnpm grab
```

### 2. 抓取历史 Banner 快照

用于从 [Wayback Machine][Wayback-Machine] 抓取特定历史时期的 B 站 Banner。由于 Wayback Machine 的防爬机制，运行此脚本前必须配置 Cookie 以缓解反爬限制。

#### 前置准备

1. 在项目根目录下手动创建一个 `.env` 文件。
2. 使用浏览器访问 Wayback Machine 上的 B 站历史快照（例如：`https://web.archive.org/web/20211116120000/https://www.bilibili.com/`）。
3. 按 `F12` 打开浏览器开发者工具，从“网络 (Network)”面板中复制任意发往 `web.archive.org` 的请求头中的 `Cookie` 字段。
4. 将复制的 Cookie 写入 `.env` 文件，配置为环境变量 `WAYBACK_COOKIE`，格式如下：
   ```env
   WAYBACK_COOKIE="donation-identifier==xxxx; <其他cookie内容>"
   ```

#### 运行命令

在项目根目录下运行脚本，并传入对应的解析模式与快照 URL：

```bash
pnpm tsx scripts/grab-archive -m <mode> -u <url>
```

#### 参数说明

- `-m, --mode`: 指定解析模式。必须为以下支持的模式之一：
  - `pic-2013-css-v1`
  - `pic-2015-css-v2`
  - `pic-2016-js`
  - `pic-2019-html`
  - `split-2022-html`
  - `split-2022-api`
- `-u, --url`: Wayback Machine 上的 B 站快照 URL，例如：`https://web.archive.org/web/20220101000000/https://www.bilibili.com/`

### 3. 数据管理与辅助校验

数据抓取完成后，可以使用以下命令对数据进行规范校验和清理：

| 命令                       | 说明                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| `pnpm data generate`       | 基于 TypeScript 类型定义自动生成对应的 JSON Schemas                        |
| `pnpm data validate`       | 校验 `public/assets` 中所有 Banner 的 `data.json` 配置是否符合 Schema 规范 |
| `pnpm data check-assets`   | 检查 `public/assets` 下资源引用的完整性（检查是否存在缺失或冗余资源）      |
| `pnpm data check-manifest` | 检查 Banner 配置的 tags 合法性以及配置与实际物理目录一致性                 |
| `pnpm data clean`          | 自动清理 `public/assets` 目录下的空目录                                    |

## ❤️ 鸣谢

- 感谢 [Bilibili][bilibili] 设计师们带来的精美艺术作品
- 早期开发参考：[palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)

## 📄 协议与声明

- 代码部分采用 [MIT License](LICENSE)。
- 项目中的图片、视频及原始设计版权归 [Bilibili][bilibili] 所有。

[bilibili]: https://www.bilibili.com
[Wayback-Machine]: https://web.archive.org/

