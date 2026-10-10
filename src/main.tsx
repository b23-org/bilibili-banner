import { render } from "preact";
import { App } from "./App";
import { initUrlSync } from "./state/urlSync";
import "./styles/global.css";

// 1. 初始化 URL 参数与 Signals 状态同步（必须在渲染前执行）
initUrlSync();

// 2. 挂载 Preact 应用至 #app
render(<App />, document.getElementById("app")!);
