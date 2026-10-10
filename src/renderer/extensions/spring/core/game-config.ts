import type Matter from "matter-js";

export const stageConfig = [
  { time: 0, speed: -0.06, trap: 0.2, lucky: 0.1 },
  { time: 30_000, speed: -0.09, trap: 0.5, lucky: 0.1 },
  { time: 90_000, speed: -0.12, trap: 0.8, lucky: 0.1 },
] as const;

type StageConfigItem = (typeof stageConfig)[number];

export const endEvaluationConfig = {
  showPctText: false,
  timeStage: [70, 50, 30, 15, 0],
  timeText: [
    ["天赋异禀·疾风征服者·被22选中的人？！", "成就达成，进击的22！"],
    ["平平无奇小天才 ┕( ▔, ▔ )┙", "不愧是你，22拯救者！"],
    ["再接再厉，芜湖起飞！", "22必不能轻易认输！", "是时候展现真正的技术了！"],
    ["就这，绝对不是我 (°ー°〃)", "是意外啦，22绝不会轻易狗带！"],
    [
      "身残志坚，答应22不要放弃治疗！",
      "这河狸吗？<br/>o(一＿一+)o  ",
      "是什么糊住了22的眼睛？是风！ ",
      "落地成盒，虾仁猪心 (ノへ￣、)",
    ],
  ],
  scorePercent: [0, 0, 0, 0, 0],
  scoreStage: [70, 50, 30, 15, 0],
  scoreText: [
    ["你就是春日之风本风！"],
    ["离起飞只差一点点。"],
    ["再试一次会更好。"],
    ["手感正在恢复。"],
    ["22相信你可以。"],
  ],
};

class GameConfigClass {
  duration = 0;
  private _score = 0;
  scoreEl: HTMLDivElement | null = null;
  luckyDuration = 10_000;
  baseSpeed: number = stageConfig[0].speed;
  bonusSpeed = 0;
  translateSpeed = 0;
  private stageIndex = 0;
  stage: StageConfigItem = stageConfig[0];

  get score(): number {
    return this._score;
  }

  set score(value: number) {
    this._score = value;
    if (!this.scoreEl) return;
    this.scoreEl.innerHTML = "";
    for (const digit of value.toString()) {
      const digitEl = document.createElement("div");
      digitEl.className = "number";
      digitEl.style.backgroundPosition = `-${24 * Number(digit)}px 0px`;
      this.scoreEl.appendChild(digitEl);
    }
  }

  reset(): void {
    this.duration = 0;
    this.score = 0;
    this.baseSpeed = stageConfig[0].speed;
    this.bonusSpeed = 0;
    this.translateSpeed = 0;
    this.stageIndex = 0;
    this.stage = stageConfig[0];
  }

  updateStage(): void {
    let nextIndex = 0;
    for (let i = 0; i < stageConfig.length; i += 1) {
      if (this.duration >= stageConfig[i].time) nextIndex = i;
    }
    if (nextIndex !== this.stageIndex) {
      this.stageIndex = nextIndex;
      this.stage = stageConfig[nextIndex];
      this.baseSpeed = stageConfig[nextIndex].speed;
    }
  }
}

export const GameConfig = new GameConfigClass();

export const physicsConfig: { engine: Matter.Engine | null } = { engine: null };
