export const logger = {
  error: (msg: string) => console.error(`❌ ${msg}`),
  warn: (msg: string) => console.log(`⚠️ ${msg}`),
  info: (msg: string) => console.log(`${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  step: (msg: string) => console.log(`🚀 ${msg}`),
  subDivider: () => console.log("---------------------"),
  summaryDivider: () => console.log("====================="),
  fileError: (file: string, message: string) => {
    logger.info(`文件：${file}`);
    logger.error(`  错误：${message}`);
    logger.subDivider();
  },
};
