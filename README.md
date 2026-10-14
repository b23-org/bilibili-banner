# Bilibili Banner 档案馆

一个围绕 Bilibili Banner 的电子档案与还原项目。

项目收集并整理了 Bilibili 从 2013 年至今的大部分 Banner，结合公开页面、历史快照与逆向分析结果，尽可能复现了不同阶段的视觉表现与交互逻辑。

## 🚀 [在线预览](https://bilibili-banner.dankt.in/)

<div align="center">

![cover-2015-06-27](docs/image/cover-2015-06-27.png)

![cover-2021-04-12](docs/image/cover-2021-04-12.png)

![cover-2022-08-06](docs/image/cover-2022-08-06.png)

</div>

## 🌟 核心特性

- 🕰️ **跨越十年的记录**：收录自 2013 年至今的大部分 Banner，覆盖从静态单图到多图层动态 Banner 的演变过程。
- 🎯 **动态交互还原**：基于逆向分析复现官方动态 Banner 的交互逻辑，包括视差、位移、模糊、转场等核心效果。
- 🕹️ **重现季节互动主题扩展**：重现 2022 年出现的春、夏、秋三个季性节主题 Banner。
- ⚙️ **工程化数据维护**：提供抓取、解析、校验和资源归档工具，方便新增数据并维护现有存档。

## 🛠️ 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 本地开发
pnpm dev

# 3. 构建与预览
pnpm build
pnpm preview
```


## 📥 数据抓取指南

本项目维护了一个 Banner 抓取脚本，使用命令 `pnpm grab` 可自动抓取资源并生成配置。

脚本会从 B 站当前首页和各个分区提取 Banner 的图层数据、预览图、Logo 等资源，下载到本地后同步更新 manifest 配置。抓取产物会保存到 `public/assets/{YYYY}/{MM}/{YYYY-MM-DD}-h{HH}-t{tid}[-preview]`，重复 banner 资源默认会跳过。

### 1. 运行抓取

默认命令会依次抓取首页和所有支持的分区：

```bash
pnpm grab
```

支持的参数：

| 参数                     | 说明                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| 不传                     | 抓取首页和所有分区，并去重跳过已存在的 Banner                            |
| `--tid <id>` / `-t <id>` | 只抓取指定分区，多个分区用逗号分隔（例如 `-t 0,1005`）。0 代表主站首页。 |
| `--force`                | 强制重新抓取对应来源（忽略去重步骤）                                     |
| `-h, --help`             | 显示帮助信息和支持的 tid 列表                                            |

当前支持的分区 id：

| id     | 分区     | id     | 分区     | id     | 分区     | id     | 分区     |
| ------ | -------- | ------ | -------- | ------ | -------- | ------ | -------- |
| `0`    | 主站     | `1001` | 影视     | `1002` | 娱乐     | `1003` | 音乐     |
| `1004` | 舞蹈     | `1005` | 动画     | `1006` | 绘画     | `1007` | 鬼畜     |
| `1008` | 游戏     | `1009` | 资讯     | `1010` | 知识     | `1011` | 人工智能 |
| `1012` | 科技数码 | `1013` | 汽车     | `1014` | 时尚美妆 | `1015` | 家装房产 |
| `1016` | 户外潮流 | `1017` | 健身     | `1018` | 体育运动 | `1019` | 手工     |
| `1020` | 美食     | `1021` | 小剧场   | `1022` | 旅游出行 | `1023` | 三农     |
| `1024` | 动物     | `1025` | 亲子     | `1026` | 健康     | `1027` | 情感     |
| `1028` | 神秘学   | `1029` | vlog     | `1030` | 生活兴趣 | `1031` | 生活经验 |

> [!IMPORTANT]
> 抓取脚本在自动运行完毕后，生成的 Banner 标题（`banner-title`）通常为网页的日期或分区名。在完成抓取后，可**手动编辑** [src/manifest/](src/manifest/) 目录下当前年份的配置文件（例如 [2026.json](src/manifest/2026.json)），修改对应记录的 `name` 属性即可。
> 
> ```diff
>   {
>     "date": "2026-01-09",
>     "refs": [
>       {
> -       "name": "2026-01-09",
> +       "name": "雪林候车",
>         "path": "2026-01-09-h00-t0",
>         "tags": ["split-layer"],
>         "tid": [0]
>       }
>     ]
>   }
> ```

### 2. 数据治理与辅助校验

#### A. Logo 变种审查与归一化治理 (`pnpm clean-logo`)
抓取流水线已完全实现无交互自动化入库。若需对库中的微小变种白色 Logo 进行审查治理，可使用独立的两阶段清洗工具：

```bash
# 阶段一：扫描并生成视觉审查对比报告（支持 -y <YYYY> 指定年份）
pnpm clean-logo

# 阶段二：在编辑器中审阅 .cache/logo-review.md，核对首列标记状态 (0:标杆 / 1:忽略保护 / 2:待替换) 后批量应用
pnpm clean-logo --apply
```

- **状态说明**：
  - `0`：标准标杆 Logo（写入 `logo-rules.json.standards[year]`）；
  - `1`：忽略保护名单（独立节日或定制款，写入 `logo-rules.json.preserve`）；
  - `2`：待替换变种（改写 Manifest 指向该年标杆，追加写入 `variants`，并将冗余切片安全归档至 `.cache/variants-logo/`）。

#### B. 数据完整性与 Schema 校验 (`pnpm check-data`)
```bash
# 执行元数据 JSON Schema 规范性校验
pnpm check-data --manifest-only

# 校验并自动清理冗余字段
pnpm check-data --clean
```

## 🤝 参与贡献

感谢您对本项目的关注！

- **提交流程须知**：**仅限 Bug 修复与纯文档修正可以直接提交 PR**；其余贡献（包括新功能、流程优化等）请先发起 [Issue](https://github.com/b23-org/bilibili-banner/issues) 讨论
- **提交规范**：Git Commit 请遵循英文祈使句格式（例如 `Fix layer parallax translation calculation`）。

更详尽的开发环境配置、规范要求与完整协作流程，请参阅完整的 [贡献指南](.github/CONTRIBUTING.md)。

## ❤️ 鸣谢

- 感谢 [Bilibili][bilibili] 设计师们带来的精美艺术作品
- 早期开发参考：[palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)

## 📄 协议与声明

- 代码部分采用 [MIT License](LICENSE)。
- 项目中的图片、视频及原始设计版权归 [Bilibili][bilibili] 所有。

[bilibili]: https://www.bilibili.com
