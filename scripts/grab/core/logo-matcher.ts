import zlib from "node:zlib";

/**
 * 解码后的 PNG 原始图像信息
 */
export interface DecodedPng {
  width: number;
  height: number;
  rgba: Buffer;
}

/**
 * 非透明有效区域的外接矩形
 */
export interface AlphaBoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  visiblePixels: number;
}

/**
 * Logo 图片的视觉特征分析结果
 */
export interface LogoAnalysis {
  width: number;
  height: number;
  isWhiteOrGrayscale: boolean;
  bbox: AlphaBoundingBox | null;
  normalizedGrid: Float32Array;
}

/**
 * Paeth 预测器算法（PNG Filter 4）
 */
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * 原生解析 PNG 文件 Buffer 并解码为 RGBA 格式
 * 支持 Color Type 6 (RGBA), 4 (Grayscale+Alpha), 3 (Indexed Palette), 2 (RGB), 0 (Grayscale)
 * 支持普通连续扫描与 Adam7 隔行扫描 (Interlaced PNG)
 */
export function decodePngRgba(buf: Buffer): DecodedPng {
  if (buf.length < 8 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Invalid PNG header signature");
  }

  let pos = 8;
  const idatChunks: Buffer[] = [];
  let plteChunk: Buffer | null = null;
  let trnsChunk: Buffer | null = null;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let interlace = 0;

  while (pos < buf.length) {
    const chunkLength = buf.readUInt32BE(pos);
    const chunkType = buf.toString("ascii", pos + 4, pos + 8);
    const chunkData = buf.subarray(pos + 8, pos + 8 + chunkLength);

    if (chunkType === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      colorType = chunkData[9];
      interlace = chunkData[12];
    } else if (chunkType === "PLTE") {
      plteChunk = chunkData;
    } else if (chunkType === "tRNS") {
      trnsChunk = chunkData;
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }

    pos += 12 + chunkLength;
  }

  if (width === 0 || height === 0 || idatChunks.length === 0) {
    throw new Error("Corrupted or incomplete PNG data");
  }

  const rawDecompressed = zlib.inflateSync(Buffer.concat(idatChunks));

  let bpp = 4;
  if (colorType === 3 || colorType === 0) bpp = 1;
  else if (colorType === 4) bpp = 2;
  else if (colorType === 2) bpp = 3;
  else if (colorType === 6) bpp = 4;

  const passes =
    interlace === 1
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
      : [[0, 0, 1, 1]];

  const rgba = Buffer.alloc(width * height * 4);
  let srcPos = 0;

  for (const [xOrig, yOrig, xSp, ySp] of passes) {
    const passWidth = Math.floor((width - xOrig + xSp - 1) / xSp);
    const passHeight = Math.floor((height - yOrig + ySp - 1) / ySp);
    if (passWidth <= 0 || passHeight <= 0) continue;

    const passStride = passWidth * bpp;
    const prevRow = Buffer.alloc(passStride);
    const currRow = Buffer.alloc(passStride);

    for (let py = 0; py < passHeight; py++) {
      const filter = rawDecompressed[srcPos++];
      for (let i = 0; i < passStride; i++) {
        const curr = rawDecompressed[srcPos++];
        const left = i >= bpp ? currRow[i - bpp] : 0;
        const up = prevRow[i];
        const upleft = i >= bpp ? prevRow[i - bpp] : 0;

        let val = 0;
        if (filter === 0) val = curr;
        else if (filter === 1) val = (curr + left) & 0xff;
        else if (filter === 2) val = (curr + up) & 0xff;
        else if (filter === 3)
          val = (curr + Math.floor((left + up) / 2)) & 0xff;
        else if (filter === 4)
          val = (curr + paethPredictor(left, up, upleft)) & 0xff;

        currRow[i] = val;
      }

      currRow.copy(prevRow);

      const realY = yOrig + py * ySp;
      for (let px = 0; px < passWidth; px++) {
        const realX = xOrig + px * xSp;
        const dstIdx = (realY * width + realX) * 4;
        const srcIdx = px * bpp;

        if (colorType === 6) {
          rgba[dstIdx] = currRow[srcIdx];
          rgba[dstIdx + 1] = currRow[srcIdx + 1];
          rgba[dstIdx + 2] = currRow[srcIdx + 2];
          rgba[dstIdx + 3] = currRow[srcIdx + 3];
        } else if (colorType === 4) {
          const g = currRow[srcIdx];
          const a = currRow[srcIdx + 1];
          rgba[dstIdx] = g;
          rgba[dstIdx + 1] = g;
          rgba[dstIdx + 2] = g;
          rgba[dstIdx + 3] = a;
        } else if (colorType === 3 && plteChunk) {
          const idx = currRow[srcIdx];
          rgba[dstIdx] = plteChunk[idx * 3] ?? 0;
          rgba[dstIdx + 1] = plteChunk[idx * 3 + 1] ?? 0;
          rgba[dstIdx + 2] = plteChunk[idx * 3 + 2] ?? 0;
          rgba[dstIdx + 3] =
            trnsChunk && idx < trnsChunk.length ? trnsChunk[idx] : 255;
        } else if (colorType === 2) {
          rgba[dstIdx] = currRow[srcIdx];
          rgba[dstIdx + 1] = currRow[srcIdx + 1];
          rgba[dstIdx + 2] = currRow[srcIdx + 2];
          rgba[dstIdx + 3] = 255;
        } else if (colorType === 0) {
          const g = currRow[srcIdx];
          rgba[dstIdx] = g;
          rgba[dstIdx + 1] = g;
          rgba[dstIdx + 2] = g;
          rgba[dstIdx + 3] = 255;
        }
      }
    }
  }

  return { width, height, rgba };
}

/**
 * 提取 Logo 的视觉特征（判断白度、计算有效 Bounding Box、生成归一化网格）
 * 归一化网格尺寸固定为 48x24（适配大多数 Logo 约 2:1 的横向比例）
 */
export function analyzeLogoImage(
  pngBuf: Buffer,
  gridWidth = 48,
  gridHeight = 24,
): LogoAnalysis {
  const { width, height, rgba } = decodePngRgba(pngBuf);

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let visibleCount = 0;
  let saturatedCount = 0;
  let darkCount = 0;
  let totalBrightness = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = rgba[idx + 3];

      // 仅考虑可见度 > 25 的像素
      if (a > 25) {
        visibleCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        if (maxC - minC > 20) {
          saturatedCount++;
        }
        const lum = (r + g + b) / 3;
        if (lum < 150) {
          darkCount++;
        }
        totalBrightness += lum;
      }
    }
  }

  const bbox: AlphaBoundingBox | null =
    visibleCount > 0
      ? {
          minX,
          maxX,
          minY,
          maxY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          visiblePixels: visibleCount,
        }
      : null;

  // 长宽比检测：标准 Bilibili 双电视及文字 Logo 长宽比稳定收敛在 2.0 ~ 2.45，
  // 超出此范围通常附带了横排副标题额外文字 (AR > 2.5) 或竖向装饰/角标 (AR < 2.0)
  const ar = bbox && bbox.height > 0 ? bbox.width / bbox.height : 0;
  const isStandardAspectRatio = ar >= 2.0 && ar <= 2.45;

  // 判定是否属于标准通用白色 Logo：
  // 1. 存在足够数量的可见像素 (> 50)
  // 2. 有彩色像素占比极低 (< 5%)
  // 3. 暗色/阴影像素占比极低 (< 5%，直接排除黑色投影、边框及深色描边等变种)
  // 4. 有效轮廓长宽比符合标准纯 Logo 比例 (2.0 ~ 2.45，直接排除附带横排/竖排额外内容的变种)
  // 5. 平均亮度偏高 (> 160)
  const isWhiteOrGrayscale =
    visibleCount > 50 &&
    saturatedCount / visibleCount < 0.05 &&
    darkCount / visibleCount < 0.05 &&
    isStandardAspectRatio &&
    totalBrightness / visibleCount > 160;

  const normalizedGrid = new Float32Array(gridWidth * gridHeight);

  if (bbox && bbox.width > 0 && bbox.height > 0) {
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const sx = Math.floor(bbox.minX + (gx / gridWidth) * bbox.width);
        const sy = Math.floor(bbox.minY + (gy / gridHeight) * bbox.height);
        const a = rgba[(sy * width + sx) * 4 + 3];
        normalizedGrid[gy * gridWidth + gx] = a / 255;
      }
    }
  }

  return {
    width,
    height,
    isWhiteOrGrayscale,
    bbox,
    normalizedGrid,
  };
}

/**
 * 计算两个 Logo 归一化轮廓的形状交并比（Soft IoU）
 * 如果两者并非白色 Logo 或有效轮廓长宽比差异过大，直接返回 0
 */
export function calculateLogoSimilarity(
  a: LogoAnalysis,
  b: LogoAnalysis,
): number {
  if (!a.isWhiteOrGrayscale || !b.isWhiteOrGrayscale) return 0;
  if (!a.bbox || !b.bbox) return 0;

  // 长宽比差异过滤（若长宽比偏差过大，例如 2:1 与 1:1，必然不是同一款文字样式）
  const arA = a.bbox.width / a.bbox.height;
  const arB = b.bbox.width / b.bbox.height;
  if (Math.abs(arA - arB) > 0.45) return 0;

  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.normalizedGrid.length; i++) {
    const va = a.normalizedGrid[i];
    const vb = b.normalizedGrid[i];
    inter += Math.min(va, vb);
    union += Math.max(va, vb);
  }

  return union === 0 ? 1 : inter / union;
}

/**
 * 便捷判定两张图片 Buffer 是否属于高度相似的白色 Logo
 */
export function areLogosVisuallySimilar(
  candidateBuf: Buffer,
  standardBuf: Buffer,
  threshold = 0.85,
): {
  isSimilar: boolean;
  similarity: number;
  candidateAnalysis: LogoAnalysis;
  standardAnalysis: LogoAnalysis;
} {
  const candidateAnalysis = analyzeLogoImage(candidateBuf);
  const standardAnalysis = analyzeLogoImage(standardBuf);

  const similarity = calculateLogoSimilarity(
    candidateAnalysis,
    standardAnalysis,
  );
  return {
    isSimilar: similarity >= threshold,
    similarity,
    candidateAnalysis,
    standardAnalysis,
  };
}

/**
 * 提取 Logo 的画布大小、BBox 大小及偏离中心距离（px）
 */
export interface LogoGeometryDiagnostic {
  canvasWidth: number;
  canvasHeight: number;
  bboxWidth: number;
  bboxHeight: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  deltaCenterX: number; // 正值表示偏右，负值表示偏左
  deltaCenterY: number; // 正值表示偏下，负值表示偏上
}

export function getLogoGeometry(
  analysis: LogoAnalysis,
): LogoGeometryDiagnostic | null {
  if (!analysis.bbox) return null;
  const bbox = analysis.bbox;
  const canvasCenterX = analysis.width / 2;
  const canvasCenterY = analysis.height / 2;
  const bboxCenterX = (bbox.minX + bbox.maxX) / 2;
  const bboxCenterY = (bbox.minY + bbox.maxY) / 2;

  return {
    canvasWidth: analysis.width,
    canvasHeight: analysis.height,
    bboxWidth: bbox.width,
    bboxHeight: bbox.height,
    minX: bbox.minX,
    minY: bbox.minY,
    maxX: bbox.maxX,
    maxY: bbox.maxY,
    deltaCenterX: Number((bboxCenterX - canvasCenterX).toFixed(1)),
    deltaCenterY: Number((bboxCenterY - canvasCenterY).toFixed(1)),
  };
}

/**
 * 终端交互提问函数：严格仅接收 'y' 或 'n'，其余输入循环提示直至合法
 */
export async function promptConfirmLogoReplacement(
  promptText: string,
): Promise<boolean> {
  // 若当前终端不支持交互（非 TTY，例如 CI/CD 或脚本管道），默认安全回退为不替换，防止进程死锁挂起
  if (!process.stdin.isTTY) {
    console.log("[非交互终端] 自动跳过交互确认，保持默认不替换。");
    return false;
  }

  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    let isResolved = false;

    rl.on("close", () => {
      if (!isResolved) {
        isResolved = true;
        resolve(false);
      }
    });

    function ask() {
      rl.question(promptText, (answer) => {
        const cleaned = answer.trim().toLowerCase();
        if (cleaned === "y") {
          isResolved = true;
          rl.close();
          resolve(true);
        } else if (cleaned === "n") {
          isResolved = true;
          rl.close();
          resolve(false);
        } else {
          console.log("⚠️ 无效输入，仅接收 'y' 或 'n'，请重新输入。");
          ask();
        }
      });
    }
    ask();
  });
}
