import { endEvaluationConfig } from "../core/game-config";

const ASSET_BASE = "/assets/extensions/spring/";

const evaluationResultCache: { r1: string; r2: string } = {
  r1: "",
  r2: "",
};

export type GameDomElements = {
  bannerGame: HTMLDivElement;
  root: ShadowRoot;
  canvas: HTMLCanvasElement;
  scoreEl: HTMLDivElement;
  endContainer: HTMLDivElement;
  restartEl: HTMLDivElement;
  shareEl: HTMLDivElement;
  viewGuideEl: HTMLDivElement;
  closeEl: HTMLDivElement;
  endCover: HTMLDivElement;
  updateEndScore: (score: number) => void;
  scoreTextRef: { r1: string; r2: string };
};

export function createGameElements(bannerHost: HTMLElement): GameDomElements {
  const initialHeight = bannerHost.clientWidth / (16 / 3);

  const bannerGameDiv = document.createElement("div");
  bannerGameDiv.className = "banner-game";
  Object.assign(bannerGameDiv.style, {
    width: "100%",
    height: `${initialHeight}px`,
    position: "absolute",
    top: "0",
    left: "0",
    userSelect: "none",
    fontFamily: "Vonwaon, sans-serif",
    letterSpacing: "1px",
    textRendering: "geometricPrecision",
  });

  const shadowRoot = bannerGameDiv.attachShadow({ mode: "open" });

  const styleElement = document.createElement("style");
  styleElement.textContent = `
canvas {
  width: 100%;
  height: ${initialHeight}px;
  position: absolute;
  top: 0;
  left: 0;
  cursor: default;
}
.full {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  image-rendering: pixelated;
}
.score {
  position: absolute;
  color: #fff;
  top: 48px;
  right: 24px;
  text-shadow: 3px 3px #000;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 240px;
  height: 32px;
  transform: scale(1.5);
  transform-origin: right;
}
.number {
  width: 24px;
  height: 32px;
  background-image: url(${ASSET_BASE}sprite/bird/numbers.png);
  background-repeat: no-repeat;
  background-size: 240px 32px;
  image-rendering: pixelated;
}
.content-bubble {
  position: absolute;
  width: 650px;
  height: 314px;
  top: 24px;
  left: 634px;
  background: url(${ASSET_BASE}guide/bubble.png);
  background-repeat: no-repeat;
  background-size: cover;
}
.option-bubble {
  width: 220px;
  height: 80px;
  background: url(${ASSET_BASE}guide/bubble_option.png);
  background-repeat: no-repeat;
  background-size: cover;
  cursor: pointer;
  text-align: center;
  font-size: 24px;
  line-height: 24px;
  color: rgb(89, 164, 87);
  box-sizing: border-box;
  padding-top: 28px;
  padding-right: 28px;
  transition: 0.3s;
}
.option-bubble:hover {
  transform: translateY(-5px);
}
.end-content-left {
  position: absolute;
  width: 220px;
  height: 160px;
  top: 80px;
  left: 70px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  padding-left: 20px;
}
.end-content-right {
  position: absolute;
  width: 220px;
  height: 160px;
  top: 80px;
  left: 310px;
  font-size: 24px;
  color: rgb(116, 167, 166);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.end-content-right span {
  color: #a4d341;
  letter-spacing: -3px;
  margin-right: 3px;
}
.end-option-icon {
  position: absolute;
  width: 36px;
  height: 36px;
  top: 20px;
  left: 160px;
  background-size: 100%;
  background-repeat: no-repeat;
  background-position: center;
}
`;
  shadowRoot.appendChild(styleElement);

  const canvasElement = document.createElement("canvas");
  canvasElement.width = 1920;
  canvasElement.height = 360;
  shadowRoot.appendChild(canvasElement);

  const endCoverElement = document.createElement("div");
  endCoverElement.classList.add("full");
  Object.assign(endCoverElement.style, {
    display: "none",
    opacity: "0",
    transition: "opacity 0.5s",
    backgroundImage: `url(${ASSET_BASE}guide/end_cover.png)`,
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
  });
  shadowRoot.appendChild(endCoverElement);

  const endContainerDiv = document.createElement("div");
  Object.assign(endContainerDiv.style, {
    position: "absolute",
    width: "1920px",
    height: "360px",
    top: "0",
    left: "0",
    transformOrigin: "top left",
    transform: `scale(${bannerHost.clientWidth / 1920 || 1})`,
  });

  const contentBubbleDiv = document.createElement("div");
  contentBubbleDiv.classList.add("content-bubble");
  endContainerDiv.appendChild(contentBubbleDiv);

  const leftContentDiv = document.createElement("div");
  leftContentDiv.classList.add("end-content-left");

  const labelHoldOn = document.createElement("div");
  labelHoldOn.textContent = "坚持了";
  Object.assign(labelHoldOn.style, {
    fontSize: "24px",
    lineHeight: "24px",
    marginBottom: "8px",
    color: "#74a7a6",
  });
  leftContentDiv.appendChild(labelHoldOn);

  const secondLabel = document.createElement("div");
  secondLabel.textContent = "秒";
  Object.assign(secondLabel.style, {
    fontSize: "24px",
    lineHeight: "24px",
    marginBottom: "8px",
    color: "#74a7a6",
  });

  const scoreSpan = document.createElement("span");
  Object.assign(scoreSpan.style, {
    fontSize: "72px",
    lineHeight: "72px",
    color: "#a4d341",
    position: "relative",
    bottom: "-10px",
    left: "-5px",
    letterSpacing: "-10px",
    marginRight: "5px",
  });
  secondLabel.insertBefore(scoreSpan, secondLabel.firstChild);
  leftContentDiv.appendChild(secondLabel);
  contentBubbleDiv.appendChild(leftContentDiv);

  const rightContentDiv = document.createElement("div");
  rightContentDiv.classList.add("end-content-right");

  const rankEvaluationText = document.createElement("div");
  rankEvaluationText.style.marginBottom = "20px";

  const funnyEvaluationText = document.createElement("div");
  rightContentDiv.appendChild(rankEvaluationText);
  rightContentDiv.appendChild(funnyEvaluationText);
  contentBubbleDiv.appendChild(rightContentDiv);

  const optionsConfig = [
    { y: 10, text: "再来一次！(按Z)", icon: "" },
    { y: 97, text: "分享结果", icon: `${ASSET_BASE}guide/share.png` },
    { y: 185, text: "回看教程", icon: `${ASSET_BASE}guide/book.png` },
    { y: 273, text: "退出", icon: `${ASSET_BASE}guide/exit.png` },
  ];

  const optionButtons = optionsConfig.map((item, index) => {
    const btn = document.createElement("div");
    btn.classList.add("option-bubble");
    Object.assign(btn.style, {
      position: "absolute",
      top: `${item.y}px`,
      left: "1186px",
    });
    btn.textContent = item.text;

    if (index === 0) {
      btn.style.paddingRight = "0px";
      btn.style.paddingLeft = "16px";
    } else {
      const icon = document.createElement("div");
      icon.classList.add("end-option-icon");
      icon.style.backgroundImage = `url(${item.icon})`;
      btn.appendChild(icon);
    }

    endContainerDiv.appendChild(btn);
    return btn;
  });

  endCoverElement.appendChild(endContainerDiv);

  const scoreContainerDiv = document.createElement("div");
  scoreContainerDiv.classList.add("score");
  shadowRoot.appendChild(scoreContainerDiv);

  const getStageIndex = (
    score: number,
    stageList: readonly number[],
  ): number => {
    for (let i = 0; i < endEvaluationConfig.scorePercent.length; i++) {
      if (score >= stageList[i]) return i;
    }
    return endEvaluationConfig.scorePercent.length - 1;
  };

  return {
    bannerGame: bannerGameDiv,
    root: shadowRoot,
    canvas: canvasElement,
    scoreEl: scoreContainerDiv,
    endContainer: endContainerDiv,
    restartEl: optionButtons[0],
    shareEl: optionButtons[1],
    viewGuideEl: optionButtons[2],
    closeEl: optionButtons[3],
    endCover: endCoverElement,

    updateEndScore: (finalScore: number) => {
      scoreSpan.textContent = finalScore.toString();

      if (endEvaluationConfig.showPctText) {
        const idx = getStageIndex(finalScore, endEvaluationConfig.scoreStage);
        const randIdx = Math.floor(
          Math.random() * endEvaluationConfig.scoreText[idx].length,
        );
        evaluationResultCache.r1 = `你超过了<span>${endEvaluationConfig.scorePercent[idx]}%</span><br/>的玩家！`;
        evaluationResultCache.r2 = endEvaluationConfig.scoreText[idx][randIdx];
      } else {
        const idx = getStageIndex(finalScore, endEvaluationConfig.timeStage);
        const randIdx = Math.floor(
          Math.random() * endEvaluationConfig.timeText[idx].length,
        );
        evaluationResultCache.r1 = `恭喜你坚持了<span>${finalScore}</span>秒！`;
        evaluationResultCache.r2 = endEvaluationConfig.timeText[idx][randIdx];
      }

      rankEvaluationText.innerHTML = evaluationResultCache.r1;
      funnyEvaluationText.innerHTML = evaluationResultCache.r2;
    },

    scoreTextRef: evaluationResultCache,
  };
}
