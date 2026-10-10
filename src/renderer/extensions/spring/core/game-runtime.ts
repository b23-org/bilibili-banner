export const TimeManager = {
  raf: Number.NaN,
  time: 0,
  lastT: 0,
  deltaT: 0,
  _time: 0,
  _lastT: performance.now(),
  _interval: 1000 / 61,
  _deltaT: 0,
  reset(): void {
    this.time = 0;
    this.deltaT = 0;
    this.lastT = 0;
  },
};

type HookStage = "enter" | "leave" | "update";
type Hook = (arg?: string) => void;

export class StateMachine {
  public currentState: string;
  private readonly hooks = new Map<
    string,
    Partial<Record<HookStage, Hook[]>>
  >();
  private readonly conditions = new Map<
    string,
    Array<{ next: string; when: () => boolean }>
  >();

  constructor(states: string[], initialState = states[0]) {
    this.currentState = initialState;
    for (const state of states) {
      this.hooks.set(state, {});
      this.conditions.set(state, []);
    }
  }

  addHook(state: string, stage: HookStage, cb: Hook): void {
    const stateHooks = this.hooks.get(state) ?? {};
    const list = stateHooks[stage] ?? [];
    list.push(cb);
    stateHooks[stage] = list;
    this.hooks.set(state, stateHooks);
  }

  addCondition(
    state: string,
    nextState: string,
    condition: () => boolean,
  ): void {
    const list = this.conditions.get(state) ?? [];
    list.push({ next: nextState, when: condition });
    this.conditions.set(state, list);
  }

  changeState(nextState: string): void {
    if (nextState === this.currentState) return;
    const prev = this.currentState;
    for (const cb of this.hooks.get(prev)?.leave ?? []) cb(nextState);
    this.currentState = nextState;
    for (const cb of this.hooks.get(nextState)?.enter ?? []) cb(prev);
  }

  update(): void {
    for (const condition of this.conditions.get(this.currentState) ?? []) {
      if (condition.when()) {
        this.changeState(condition.next);
        break;
      }
    }
    for (const cb of this.hooks.get(this.currentState)?.update ?? []) cb();
  }
}

export class KeyboardInput {
  readonly keys: Record<string, boolean> = {};
  private readonly keyDownHandlers = new Set<(event: KeyboardEvent) => void>();
  private readonly keyUpHandlers = new Set<(event: KeyboardEvent) => void>();

  constructor(private readonly element: HTMLElement) {
    this.element.tabIndex =
      this.element.tabIndex >= 0 ? this.element.tabIndex : 0;
    this.element.style.outline = "none";

    this.element.addEventListener(
      "keydown",
      (event) => {
        if (!(event.metaKey || event.ctrlKey || event.altKey)) {
          event.preventDefault();
          event.stopPropagation();
        }
        this.keys[event.key] = true;
        for (const handler of this.keyDownHandlers) {
          handler(event);
        }
      },
      { capture: true },
    );

    this.element.addEventListener(
      "keyup",
      (event) => {
        if (!(event.metaKey || event.ctrlKey || event.altKey)) {
          event.preventDefault();
          event.stopPropagation();
        }
        this.keys[event.key] = false;
        for (const handler of this.keyUpHandlers) {
          handler(event);
        }
      },
      { capture: true },
    );
  }

  onKeyDown(cb: (event: KeyboardEvent) => void): () => void {
    this.keyDownHandlers.add(cb);
    return () => this.keyDownHandlers.delete(cb);
  }

  onKeyUp(cb: (event: KeyboardEvent) => void): () => void {
    this.keyUpHandlers.add(cb);
    return () => this.keyUpHandlers.delete(cb);
  }
}
