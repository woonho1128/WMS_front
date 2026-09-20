import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { AtRule, Plugin as PostcssPlugin } from "postcss";

/**
 * 화면 폭 규칙을 **패널 폭 규칙으로도** 복사한다.
 *
 * 절반으로 보기(SplitView)를 켜면 창은 1900px 인데 화면 하나는 800px 짜리 칸에 들어간다.
 * 그런데 각 페이지의 `@media (max-width: …)` 는 창 크기를 보므로 걸리지 않고,
 * 1200px 용 3단 레이아웃이 800px 안에서 찌그러진다(글자가 한 자씩 세로로 쌓이는 등).
 *
 * 그래서 빌드할 때 폭 조건만 있는 `@media` 를 `@container pane (…)` 로 한 벌 더 만든다.
 * `pane` 컨테이너는 `.wms-pane-body`(wms-shell.css) 하나뿐이라,
 * **분할 패널 안에서는 그 폭이 곧 창 폭처럼 동작**한다 — 페이지가 이미 가지고 있는
 * 좁은 화면 레이아웃(이미 375·768·1024 에서 점검한 그 규칙)을 그대로 쓴다.
 *
 * 패널 밖에서는 `pane` 컨테이너가 없어 복사본이 걸리지 않으므로, 기존 화면은 그대로다.
 */
const WIDTH_ONLY =
  /^(?:screen\s+and\s+)?\(\s*(?:max|min)-width\s*:[^)]+\)(?:\s+and\s+\(\s*(?:max|min)-width\s*:[^)]+\))*$/i;

const paneContainerQueries = (): PostcssPlugin => ({
  postcssPlugin: "wms-pane-container-queries",
  OnceExit(root) {
    const sources: AtRule[] = [];
    root.walkAtRules("media", (rule) => {
      if (WIDTH_ONLY.test(rule.params.trim())) sources.push(rule);
    });
    sources.forEach((rule) => {
      const clone = rule.clone({
        name: "container",
        params: `pane ${rule.params.trim().replace(/^screen\s+and\s+/i, "")}`
      });
      rule.after(clone);
    });
  }
});
paneContainerQueries.postcss = true;

export default defineConfig({
  base: "/WMS_front/",
  plugins: [react()],
  css: {
    postcss: {
      plugins: [paneContainerQueries()]
    }
  },
  server: {
    port: 5173
  }
});
