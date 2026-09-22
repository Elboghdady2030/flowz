import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("reply cards use local sharp typography and safe viewport gutters", () => {
  assert.match(css, /@font-face\s*{[^}]*Noto Sans Arabic[^}]*noto-sans-arabic\.woff2/s);
  assert.match(css, /@font-face\s*{[^}]*Noto Sans Arabic[^}]*noto-sans-arabic-latin\.woff2/s);
  assert.match(css, /--safe-x:\s*clamp\(40px, 6vw, 128px\)/);
  assert.match(css, /--safe-x:\s*clamp\(28px, 5vw, 64px\)/);
  assert.match(css, /--mobile-gutter:\s*24px/);
  assert.match(html, /styles\.css\?v=23/);
});

test("reply-card animation avoids rasterizing depth and blur effects", () => {
  const animation = css.match(/@keyframes message-rise\s*{([\s\S]*?)\n}/)?.[1] || "";
  assert.ok(animation, "message-rise keyframes should exist");
  assert.doesNotMatch(animation, /translate3d|scale\(|rotate\(|filter:|blur\(/);
  assert.match(animation, /translateY\(/);

  const flowCard = css.match(/\.flow-card\s*{([^}]*)}/)?.[1] || "";
  assert.match(flowCard, /filter:\s*none/);
  assert.match(flowCard, /will-change:\s*transform, opacity/);
});
