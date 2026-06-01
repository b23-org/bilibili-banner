const ASSET_BASE = "/assets/extensions/spring/";

const GUIDE_IMAGES = Array.from({ length: 11 }, (_, i) => ({
  c: `${ASSET_BASE}guide/${i + 1}.png`,
}));

export function showGuide(
  shadowRoot: ShadowRoot,
  scaleFactor: number,
  onComplete: () => void,
  isReviewMode = false,
): void {
  let currentPageIndex = 0;

  const overlayDiv = document.createElement("div");
  overlayDiv.classList.add("full");
  Object.assign(overlayDiv.style, {
    overflow: "hidden",
    zIndex: "1",
  });
  shadowRoot.appendChild(overlayDiv);

  const containerDiv = document.createElement("div");
  containerDiv.classList.add("guide-container");
  Object.assign(containerDiv.style, {
    position: "absolute",
    width: "1920px",
    height: "360px",
    top: "0",
    left: "0",
    background: "rgba(0, 0, 0, 0.1)",
    transformOrigin: "top left",
    transform: `scale(${scaleFactor || 1})`,
  });

  const styleEl = document.createElement("style");
  styleEl.textContent = `
.guide-close {
  position: absolute;
  width: 58px;
  height: 58px;
  top: 28px;
  left: 1132px;
  cursor: pointer;
  background: url(${ASSET_BASE}guide/x.png);
}
.guide-arrow {
  position: absolute;
  width: 40px;
  height: 30px;
  top: 24px;
  left: 160px;
  background: url(${ASSET_BASE}guide/arrow.png);
}
@keyframes arrow_floating {
  from { transform: translateX(0px); }
  to { transform: translateX(5px); }
}
@keyframes arrow_floating_r {
  from { transform: scaleX(-1) translateX(0px); }
  to { transform: scaleX(-1) translateX(-5px); }
}
`;
  containerDiv.appendChild(styleEl);

  const bubbleDiv = document.createElement("div");
  bubbleDiv.classList.add("content-bubble");
  containerDiv.appendChild(bubbleDiv);

  const closeBtn = document.createElement("div");
  closeBtn.classList.add("guide-close");
  containerDiv.appendChild(closeBtn);

  const textImageContainer = document.createElement("div");
  Object.assign(textImageContainer.style, {
    position: "absolute",
    width: "460px",
    height: "200px",
    top: "86px",
    left: "712px",
    display: "flex",
    alignItems: "center",
  });

  const guideImg = document.createElement("img");
  guideImg.src = GUIDE_IMAGES[0].c;
  Object.assign(guideImg.style, {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  });
  textImageContainer.appendChild(guideImg);
  containerDiv.appendChild(textImageContainer);

  const nextOptionBubble = document.createElement("div");
  nextOptionBubble.classList.add("option-bubble");
  Object.assign(nextOptionBubble.style, {
    position: "absolute",
    top: "158px",
    left: "1185px",
  });

  const rightArrow = document.createElement("div");
  rightArrow.classList.add("guide-arrow");
  Object.assign(rightArrow.style, {
    animation: "0.5s linear infinite alternate arrow_floating",
  });

  const nextTextNode = document.createTextNode("怎么办");
  nextOptionBubble.appendChild(nextTextNode);
  nextOptionBubble.appendChild(rightArrow);

  const prevOptionBubble = document.createElement("div");
  prevOptionBubble.classList.add("option-bubble");
  Object.assign(prevOptionBubble.style, {
    position: "absolute",
    top: "245px",
    left: "1186px",
    display: "none",
  });

  const leftArrow = document.createElement("div");
  leftArrow.classList.add("guide-arrow");
  Object.assign(leftArrow.style, {
    transform: "scaleX(-1)",
    animation: "0.5s linear infinite alternate arrow_floating_r",
  });

  const prevTextNode = document.createTextNode("没听清...");
  prevOptionBubble.appendChild(prevTextNode);
  prevOptionBubble.appendChild(leftArrow);

  containerDiv.appendChild(nextOptionBubble);
  containerDiv.appendChild(prevOptionBubble);

  const switchPage = (targetPageIndex: number) => {
    if (targetPageIndex < 0 || targetPageIndex > GUIDE_IMAGES.length) return;

    if (targetPageIndex === GUIDE_IMAGES.length) {
      overlayDiv.parentNode?.removeChild(overlayDiv);
      onComplete?.();
      return;
    }

    if (targetPageIndex === 0) {
      nextTextNode.textContent = "怎么办";
      prevOptionBubble.style.display = "none";
    }
    if (targetPageIndex === 1) {
      prevOptionBubble.style.display = "block";
      nextTextNode.textContent = "嗯嗯";
    }
    if (targetPageIndex === GUIDE_IMAGES.length - 2) {
      nextTextNode.textContent = "嗯嗯";
    }
    if (targetPageIndex === GUIDE_IMAGES.length - 1) {
      nextTextNode.textContent = "OK，来吧";
    }

    currentPageIndex = targetPageIndex;
    guideImg.src = GUIDE_IMAGES[currentPageIndex].c;
  };

  nextOptionBubble.addEventListener("click", () =>
    switchPage(currentPageIndex + 1),
  );
  prevOptionBubble.addEventListener("click", () =>
    switchPage(currentPageIndex - 1),
  );

  closeBtn.addEventListener("click", () => {
    overlayDiv.parentNode?.removeChild(overlayDiv);
    if (!isReviewMode) {
      onComplete?.();
    }
  });

  overlayDiv.appendChild(containerDiv);
}
