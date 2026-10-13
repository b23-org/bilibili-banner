> 欢迎您参与 Bilibili Banner 档案馆项目的开发与维护！下面是参与贡献的指南，以供参考。ヾ(ﾟ∀ﾟゞ)

# 贡献指南

## 0. 提交 Issue 与 PR 规则

在开始编写代码前，请了解以下原则：

- **提交前请先检索**：在提出问题或建议前，请先在 [Issues 列表中](https://github.com/b23-org/bilibili-banner/issues) 检索，避免重复提交。
- **可以直接提交 PR 的情形**：
  - **Bug 修复**
  - **文档修正与完善**
- **其他情况请先发起 [Issue](https://github.com/b23-org/bilibili-banner/issues) 讨论**


## 1. Fork 仓库并克隆到本地

1. 点击仓库右上角的 **Fork** 按钮，将本仓库 Fork 到您的个人 GitHub 账号下。
2. 将您 Fork 的仓库克隆到本地：

```bash
git clone https://github.com/{YOUR_USERNAME}/bilibili-banner.git
cd bilibili-banner
```


## 2. 准备开发环境

本项目基于 Node.js、TypeScript、Preact 及 Vite 构建，并使用 Biome 作为代码格式化与 Linter 工具。

### 运行时与包管理器

- **Node.js**：建议使用 Node.js `22` / `24` 及以上版本。
- **pnpm**：推荐使用 `pnpm` 作为包管理器。

### 安装依赖

在项目根目录下运行以下命令安装依赖：

```bash
pnpm install
```


## 3. 本地开发与调试

### 启动开发服务器

```bash
pnpm dev
```

启动后可在浏览器中实时预览页面交互与效果。

### 数据抓取与校验工具

若涉及 Banner 数据与资源处理，可使用以下辅助工具：

```bash
# 抓取当前主站或分区的 Banner 数据
pnpm grab

# 校验数据规范并自动清理格式
pnpm check-data --clean
```


## 4. 创建特性分支

在开发新功能或修复问题前，请从最新的 `main` 分支创建独立的开发分支：

```bash
git checkout -b <branch-name>
```

> [!NOTE]
> 请始终保持本地的 `main` 分支与官方仓库同步，避免直接在 `main` 分支上进行开发。


## 5. 代码质量检查

在提交代码前，请确保通过以下检查（本项目 GitHub Actions CI 会自动运行这些检查）：

```bash
# 1. 运行 Biome 格式化与代码静态检查
pnpm lint

# 2. 运行 TypeScript 类型检查
pnpm typecheck

# 3. 运行单元测试
pnpm test
```


## 6. Commit 提交规范

本项目遵循清晰、规范的 Git Commit 消息风格：

### 标题格式

```text
<description>
```

### 编写规则

- **使用英文编写**：保持专业且技术精准，严禁生硬直译。
- **动词原形开头**：使用祈使句（如 `Add`, `Fix`, `Update`, `Refactor`, `Improve`）。
- **首字母大写**。
- **结尾不加句号**。
- **描述已完成的变更**，而非计划或设想。

### 示例

- `Fix layer parallax translation calculation on resize`
- `Add seasonal interactive banner support for 2022 autumn`

### 多子任务正文（可选）

仅当单次提交包含多个**关联性不强且实质不同**的子任务时，允许在标题下方添加正文要点列表：

```text
<description>

- <point 1>
- <point 2>
```

- 正文要点需使用英文编写，保持精炼直接。
- **要点首字母不要求大写**，结尾不加句号。


## 7. 提交 Pull Request

1. 将代码推送到您 Fork 的远程分支：

```bash
git push origin <branch-name>
```

2. 访问 GitHub 仓库页面，点击 **Compare & pull request** 按钮。
3. 目标分支选择 `b23-org/bilibili-banner` 的 `main` 分支。
4. 填写 PR 标题与描述，并遵循以下最佳实践：
   - **保持单一聚焦（Atomic PR）**：一个 PR 仅处理一个独立问题或特性，避免混杂不相关的改动，便于 Review 和回滚。
   - **附带效果预览**：若改动涉及**动画交互、图层渲染或视觉样式**，请务必在 PR 描述中附带**前后对比截图、GIF 或录屏**，以便维护者直观评估效果。
   - **关联对应 Issue**：说明变动背景与改动细节。若已有关联 Issue，请在正文中通过 `Closes #123` 或 `Fixes #123` 自动关联。
5. 等待 CI 检查与维护者 Review。如果收到变更建议（Change Request），在本地修改后再次提交并推送至同一分支即可。
