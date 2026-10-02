export function run(): void {
  console.log(`
🛠️  Banner 数据管理工具

可用命令:
  validate        生成 JSON Schema 并校验所有 BannerConfig 配置
  check-assets    检查资源文件的引用完整性 (缺失/多余)
  check-manifest  检查 Banner 配置合法性及与物理目录一致性
  clean           清理 public/assets 下的空目录
  help            显示此帮助信息

用法: pnpm data <command>
`);
}
