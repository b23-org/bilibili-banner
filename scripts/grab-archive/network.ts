import fs from "node:fs";
import path from "node:path";
import { Impit } from "impit";
import { PROJECT_ROOT } from "../grab-shared/fs-utils";

const impit = new Impit({ browser: "firefox" });

const PROJECT_ENV_FILE = path.resolve(PROJECT_ROOT, ".env");

export type DestType = "document" | "image" | "script" | "style" | "json";

// ===== 模块级私有状态 =====
let activeCookie: string | null = null;

let currentTimeout = 5000;
const TIMEOUT_INCREMENT = 2000;
const MAX_TIMEOUT = 11000;

// ===== Cookie 管理 =====
function resolveCookie(): string {
  const inlineCookie = process.env.WAYBACK_COOKIE?.trim();
  if (inlineCookie) return inlineCookie;

  if (fs.existsSync(PROJECT_ENV_FILE)) {
    process.loadEnvFile(PROJECT_ENV_FILE);
  }

  const cookie = process.env.WAYBACK_COOKIE?.trim();
  if (cookie) return cookie;

  console.warn(
    "⚠️ 警告: 未找到 WAYBACK_COOKIE 环境变量。请求可能会被 Wayback Machine 拦截。\n" +
      "请在根目录 .env 中配置 WAYBACK_COOKIE='cf_clearance=xxx; ...'",
  );
  return "";
}

function mergeCookies(
  envCookie: string,
  setCookies: string[] | undefined,
): string {
  const cookieMap = new Map<string, string>();
  const parse = (str: string) => {
    for (const pair of str.split(";")) {
      const [key, ...values] = pair.trim().split("=");
      if (key) {
        cookieMap.set(key, values.join("="));
      }
    }
  };

  if (envCookie) parse(envCookie);
  if (setCookies) {
    for (const sc of setCookies) {
      const firstPart = sc.split(";")[0];
      parse(firstPart);
    }
  }

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ===== 公开 API =====

export async function initWaybackSession(url: string): Promise<void> {
  console.log("🔍 正在初始化会话以获取最新 Cookie...");
  const res = await impit.fetch(url, {
    headers: buildHeaders("document"),
    redirect: "follow",
  });

  const envCookie = resolveCookie();
  const setCookies = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  activeCookie = mergeCookies(envCookie, setCookies);
  console.log("✅ 会话 Cookie 已更新并整合");
}

export function buildHeaders(
  dest: DestType,
  sourceUrl?: string,
): Record<string, string> {
  const isWayback = sourceUrl?.includes("web.archive.org");

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Accept-Language":
      "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    DNT: "1",
    "Sec-GPC": "1",
    TE: "trailers",
  };

  if (isWayback) {
    const cookie = activeCookie || resolveCookie();
    if (cookie) headers.Cookie = cookie;
    if (sourceUrl) headers.Referer = sourceUrl;
  }

  switch (dest) {
    case "document":
      headers.Accept =
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
      headers["Sec-Fetch-Dest"] = "document";
      headers["Sec-Fetch-Mode"] = "navigate";
      headers["Sec-Fetch-Site"] = "none";
      headers["Sec-Fetch-User"] = "?1";
      headers["Upgrade-Insecure-Requests"] = "1";
      break;
    case "style":
      headers.Accept = "text/css,*/*;q=0.1";
      headers["Sec-Fetch-Dest"] = "style";
      headers["Sec-Fetch-Mode"] = "no-cors";
      headers["Sec-Fetch-Site"] = "same-origin";
      break;
    case "script":
      headers.Accept = "*/*";
      headers["Sec-Fetch-Dest"] = "script";
      headers["Sec-Fetch-Mode"] = "no-cors";
      headers["Sec-Fetch-Site"] = "same-origin";
      break;
    case "image":
      headers.Accept =
        "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5";
      headers["Sec-Fetch-Dest"] = "image";
      headers["Sec-Fetch-Mode"] = "no-cors";
      headers["Sec-Fetch-Site"] = "same-origin";
      break;
    case "json":
      headers.Accept = "application/json, text/plain, */*";
      headers["X-Pywb-Requested-With"] = "XMLHttpRequest";
      headers["Sec-Fetch-Dest"] = "empty";
      headers["Sec-Fetch-Mode"] = "cors";
      headers["Sec-Fetch-Site"] = "same-origin";
      break;
  }

  return headers;
}

export async function waybackFetch(
  url: string,
  headers: Record<string, string>,
  responseType?: "text" | "buffer",
): Promise<{ body: unknown }> {
  while (true) {
    try {
      const res = await impit.fetch(url, {
        headers,
        signal: AbortSignal.timeout(currentTimeout),
      });

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
      }

      const body =
        responseType === "buffer"
          ? Buffer.from(await res.arrayBuffer())
          : await res.text();

      return { body };
    } catch (error: unknown) {
      const err = error as { name?: string; code?: string; type?: string };
      const isTimeout =
        err.name === "TimeoutError" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ESOCKETTIMEDOUT" ||
        err.type === "request-timeout";

      if (isTimeout && currentTimeout < MAX_TIMEOUT) {
        currentTimeout = Math.min(
          currentTimeout + TIMEOUT_INCREMENT,
          MAX_TIMEOUT,
        );
        console.warn(
          `⚠️ 请求超时，正在增加超时阈值至 ${currentTimeout / 1000}s 并重试...`,
        );
        continue;
      }
      throw error;
    }
  }
}
