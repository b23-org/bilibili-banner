import type { GrabEvent, Reporter } from "./types";

/**
 * 创建终端交互式的进度渲染器
 * 负责格式化控制台输出，统一处理 ANSI 转义码与行级刷新
 */
export function createTerminalReporter(): Reporter {
  return (event: GrabEvent) => {
    switch (event.type) {
      case "fetch:start": {
        process.stdout.write(`\x1b[K正在请求 [${event.regionName}] 数据...\r`);
        break;
      }
      case "fetch:done": {
        // 请求完成，等待后续事件刷新
        break;
      }
      case "fetch:skip": {
        process.stdout.write("\x1b[K");
        console.log(
          `\x1b[90m- [${event.regionName}] 跳过: ${event.reason}\x1b[0m`,
        );
        break;
      }
      case "fetch:error": {
        process.stdout.write("\x1b[K");
        console.warn(
          `\x1b[33m⚠️ 请求 [${event.regionName}] 失败: ${event.error.message}\x1b[0m`,
        );
        break;
      }
      case "download:start": {
        console.log(
          `\x1b[36m▶ 开始下载:\x1b[0m ${event.displayName} (共 ${event.totalFiles} 个资源)`,
        );
        break;
      }
      case "download:progress": {
        process.stdout.write(
          `\x1b[K  正在下载 ${event.displayName}: [${event.doneFiles}/${event.totalFiles}]\r`,
        );
        break;
      }
      case "download:done": {
        process.stdout.write("\x1b[K");
        console.log(`\x1b[32m✔ 下载完成:\x1b[0m ${event.displayName}`);
        break;
      }
      case "download:error": {
        process.stdout.write("\x1b[K");
        console.error(
          `\x1b[31m✖ 下载出错 [${event.displayName}]: ${event.error.message}\x1b[0m`,
        );
        break;
      }
      case "publish:start": {
        console.log(`\x1b[34m⇪ 正在发布:\x1b[0m ${event.displayName}`);
        break;
      }
      case "publish:done": {
        console.log(`\x1b[32m✔ 发布成功:\x1b[0m ${event.displayName}`);
        break;
      }
      case "pipeline:stage-separator": {
        console.log("=====================");
        break;
      }
      case "index:cache-hit": {
        console.log(
          `\x1b[32m✔ 已从缓存加载去重索引，共包含 ${event.fileCount} 个历史资源文件名\x1b[0m`,
        );
        break;
      }
      case "index:fallback-scan": {
        console.log(`\x1b[33mℹ 触发全盘扫描生成索引: ${event.reason}\x1b[0m`);
        break;
      }
      case "extensions:detected": {
        console.log(
          `\x07\x1b[33m\n================================\n⚠️ 检测到扩展字段 extensions: [${event.keys.join(", ")}]\n已保存到 .cache/extensions/ 目录\n请手动检查是否需要特殊代码适配\n================================\x1b[0m`,
        );
        break;
      }
      case "pipeline:summary": {
        process.stdout.write("\x1b[K");
        const { result } = event;
        console.log("\n----------------------------------------");
        console.log(
          `抓取完成统计: 获取到 ${result.fetchedCount} 个 Banner 快照，其中新数据 ${result.newCount} 个，跳过重复 ${result.skippedCount} 个，成功发布 ${result.publishedCount} 个。`,
        );
        console.log("----------------------------------------\n");
        break;
      }
    }
  };
}

/**
 * 创建静默无副作用的空报告器（供单元测试或静默模式使用）
 */
export function createSilentReporter(): Reporter {
  return () => {};
}
