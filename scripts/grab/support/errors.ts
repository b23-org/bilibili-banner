/** 所有 grab 流程错误的基类 */
export class GrabError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GrabError";
  }
}

/** 网络请求阶段错误 */
export class FetchError extends GrabError {
  constructor(
    readonly regionName: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`抓取 [${regionName}] 出错: ${message}`, options);
    this.name = "FetchError";
  }
}

/** 数据提取与语法解析阶段错误 */
export class ParseError extends GrabError {
  constructor(message: string, options?: ErrorOptions) {
    super(`数据解析失败: ${message}`, options);
    this.name = "ParseError";
  }
}

/** 资源下载阶段错误 */
export class DownloadError extends GrabError {
  constructor(
    readonly sourceUrl: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`下载资源失败 [${sourceUrl}]: ${message}`, options);
    this.name = "DownloadError";
  }
}

/** 资源发布与清单同步阶段错误 */
export class PublishError extends GrabError {
  constructor(
    readonly dirName: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`发布资源 [${dirName}] 失败: ${message}`, options);
    this.name = "PublishError";
  }
}
