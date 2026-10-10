import { AssetManager } from "./asset-manager";

export const OFFICIAL_TEXT_FONT =
  'bold 30px "FZLanTYJW", "PingFang SC", "Microsoft YaHei", sans-serif';
export const OFFICIAL_SCORE_FONT = '200px "HighPixel7", sans-serif';

type ShareTextRef = { r1: string; r2: string };

type ShareCardModel = {
  title: string;
  scoreLabelPrefix: string;
  scoreLabelSuffix: string;
  score: string;
  resultLine1: string;
  resultLine2: string[];
  footerUsername: string | null;
  textFont: string;
  scoreFont: string;
};

function sanitizeShareResultLine1(raw: string): string {
  return raw.replace(/<\/?span>|<br\/>|恭喜你|^你/g, "");
}

function splitShareResultLine2(raw: string): string[] {
  const text = raw.replace(/<\/?span>|<br\/>/g, "");
  if (text.length <= 16) {
    return [text];
  }
  const splitIndex = text[14] === "，" ? 13 : 14;
  return [text.slice(0, splitIndex), text.slice(splitIndex)];
}

export function getShareCardModel(
  score: number,
  scoreTextRef: ShareTextRef,
): ShareCardModel {
  return {
    title: "在风叶穿行挑战中",
    scoreLabelPrefix: "2233",
    scoreLabelSuffix: "得分：",
    score: score.toString(),
    resultLine1: sanitizeShareResultLine1(scoreTextRef.r1),
    resultLine2: splitShareResultLine2(scoreTextRef.r2),
    footerUsername: null,
    textFont: OFFICIAL_TEXT_FONT,
    scoreFont: OFFICIAL_SCORE_FONT,
  };
}

function showLocalShareModal(canvas: HTMLCanvasElement): void {
  if (document.getElementById("spring-share-modal")) return;

  const modal = document.createElement("div");
  modal.id = "spring-share-modal";
  Object.assign(modal.style, {
    position: "fixed",
    width: "100vw",
    height: "100vh",
    top: "0px",
    left: "0px",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: "3000",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  });

  Object.assign(canvas.style, {
    borderRadius: "8px",
    width: "360px",
    height: "468px",
  });
  modal.appendChild(canvas);

  const ctrlContainer = document.createElement("div");
  Object.assign(ctrlContainer.style, {
    marginTop: "30px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  });

  const btnRow = document.createElement("div");
  Object.assign(btnRow.style, {
    display: "flex",
    justifyContent: "center",
  });

  // “保存至本地”按钮
  const saveBtn = document.createElement("div");
  Object.assign(saveBtn.style, {
    width: "76px",
    height: "68px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    cursor: "pointer",
  });

  const svgNS = "http://www.w3.org/2000/svg";
  const saveSvg = document.createElementNS(svgNS, "svg");
  Object.assign(saveSvg.style, { width: "45px", height: "44px" });
  saveSvg.setAttributeNS(null, "viewBox", "0 0 45 44");
  saveSvg.setAttributeNS(null, "width", "45");
  saveSvg.setAttributeNS(null, "height", "44");
  saveSvg.setAttributeNS(null, "fill", "none");
  saveSvg.innerHTML = `
    <path fill-rule="evenodd" clip-rule="evenodd" d="M22.5 0C10.35 0 0.5 9.85 0.5 22C0.5 34.15 10.35 44 22.5 44C34.65 44 44.5 34.15 44.5 22C44.5 9.85 34.65 0 22.5 0Z" fill="#5A62C7"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M29.5723 19.5522H26.8603C26.3483 19.5522 25.9333 19.1372 25.9333 18.6262V14.5152C25.9333 13.7212 25.2843 13.0732 24.4913 13.0732H20.1643C19.3713 13.0732 18.7213 13.7212 18.7213 14.5152V18.6262C18.7213 19.1372 18.3073 19.5522 17.7963 19.5522H15.4273C14.5683 19.5522 14.1733 20.6222 14.8253 21.1812L21.6423 27.0212C22.1353 27.4442 22.8643 27.4442 23.3573 27.0212L30.1753 21.1812C30.8273 20.6222 30.4313 19.5522 29.5723 19.5522Z" fill="white" stroke="white" stroke-width="2"/>
    <path d="M17.5 31H27.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;

  const saveText = document.createElement("div");
  Object.assign(saveText.style, {
    color: "#fff",
    marginTop: "8px",
    fontSize: "14px",
    lineHeight: "16px",
  });
  saveText.innerText = "保存至本地";

  saveBtn.appendChild(saveSvg);
  saveBtn.appendChild(saveText);
  btnRow.appendChild(saveBtn);
  ctrlContainer.appendChild(btnRow);

  // 下载事件
  let isSaving = false;
  saveBtn.onclick = () => {
    if (isSaving) return;
    isSaving = true;
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          isSaving = false;
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "share.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        isSaving = false;
      }, "image/png");
    } catch (e) {
      console.error(e);
      isSaving = false;
    }
  };

  // 右上角 SVG 关闭按钮
  const closeSvg = document.createElementNS(svgNS, "svg");
  Object.assign(closeSvg.style, {
    position: "absolute",
    width: "45px",
    height: "44px",
    top: "-496px",
    transform: "translateX(240px)",
    cursor: "pointer",
  });
  closeSvg.setAttributeNS(null, "viewBox", "0 0 41 40");
  closeSvg.setAttributeNS(null, "width", "41");
  closeSvg.setAttributeNS(null, "height", "40");
  closeSvg.setAttributeNS(null, "fill", "none");
  closeSvg.innerHTML = `
    <circle cx="20.5" cy="20" r="19.75" fill="white" fill-opacity="0.2" stroke="white" stroke-width="0.5"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M19.5104 21.0711L13.9697 15.5303C13.6768 15.2374 13.6768 14.7626 13.9697 14.4697C14.2626 14.1768 14.7374 14.1768 15.0303 14.4697L20.5711 20.0104L26.1118 14.4697C26.4047 14.1768 26.8796 14.1768 27.1725 14.4697C27.4654 14.7626 27.4654 15.2374 27.1725 15.5303L21.6317 21.0711L27.1725 26.6118C27.4654 26.9047 27.4654 27.3796 27.1725 27.6725C26.8796 27.9654 26.4047 27.9654 26.1118 27.6725L20.5711 22.1317L15.0303 27.6725C14.7374 27.9654 14.2626 27.9654 13.9697 27.6725C13.6768 27.3796 13.6768 26.9047 13.9697 26.6118L19.5104 21.0711Z" fill="#FEFEFE"/>
  `;

  const closeModal = () => {
    modal.remove();
  };

  closeSvg.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  ctrlContainer.appendChild(closeSvg);
  modal.appendChild(ctrlContainer);
  document.body.appendChild(modal);
}

export function renderShareCard(
  score: number,
  scoreTextRef: ShareTextRef,
): string {
  const width = 720;
  const height = 935;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. 绘制底色填充
  ctx.fillStyle = "#1a3a2a";
  ctx.fillRect(0, 0, width, height);

  // 2. 绘制高清背景图
  try {
    const bgImg = AssetManager.get<HTMLImageElement>("guideShareBg");
    ctx.drawImage(
      bgImg,
      0,
      0,
      bgImg.naturalWidth,
      bgImg.naturalHeight,
      0,
      0,
      width,
      height,
    );
  } catch (e) {
    console.warn("[SpringExtension] Failed to get share bg image", e);
  }

  const model = getShareCardModel(score, scoreTextRef);

  // 3. 绘制文字 (还原官方分享卡字体与字号)
  ctx.font = model.textFont;
  ctx.fillStyle = "#324232";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 6;

  // 第一行
  ctx.strokeText(model.title, 54, 96);
  ctx.fillText(model.title, 54, 96);

  // 第二行
  ctx.fillStyle = "#ec7100";
  ctx.strokeText(model.scoreLabelPrefix, 54, 140);
  ctx.fillText(model.scoreLabelPrefix, 54, 140);

  const nameWidth = ctx.measureText(model.scoreLabelPrefix).width;
  ctx.fillStyle = "#324232";
  ctx.strokeText(model.scoreLabelSuffix, 54 + nameWidth + 8, 140);
  ctx.fillText(model.scoreLabelSuffix, 54 + nameWidth + 8, 140);

  // 绘制大得分 (官方 200px 巨字)
  ctx.font = model.scoreFont;
  ctx.fillStyle = "#E35200";
  ctx.lineWidth = 10;
  ctx.strokeText(model.score, 54, 360);
  ctx.fillText(model.score, 54, 360);
  ctx.lineWidth = 6;

  // 绘制评价一
  ctx.font = model.textFont;
  ctx.fillStyle = "#324232";
  ctx.strokeText(model.resultLine1, 54, 440);
  ctx.fillText(model.resultLine1, 54, 440);

  // 绘制评价二
  model.resultLine2.forEach((line, index) => {
    const y = 484 + index * 44;
    ctx.strokeText(line, 54, y);
    ctx.fillText(line, 54, y);
  });

  if (model.footerUsername) {
    ctx.strokeText(model.footerUsername, 132, 720);
    ctx.fillText(model.footerUsername, 132, 720);
  }

  // 4. 发送 postMessage
  const dataUrl = canvas.toDataURL("image/png");
  try {
    window.parent.postMessage(
      { type: "spring-share", image: dataUrl, score },
      "*",
    );
  } catch {}

  // 5. 展现官方交互弹窗
  showLocalShareModal(canvas);

  return dataUrl;
}
