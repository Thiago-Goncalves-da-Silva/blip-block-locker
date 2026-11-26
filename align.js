/**
 * Blip Block Locker — align.js
 * ----------------------------
 * Guias de alinhamento: enquanto você arrasta um bloco no canvas do Builder,
 * mostra linhas indicando se ele está alinhado com o bloco mais próximo.
 *
 *   - Linha VERDE contínua  → alinhado exatamente (borda ou centro).
 *   - Linha ROSA tracejada + "Npx" → quase alinhado (até TOL px de distância).
 *
 * Eixo vertical (mesmo X): esquerda, centro e direita.
 * Eixo horizontal (mesmo Y): topo, centro e base.
 *
 * Só desenha por cima do canvas (overlay com pointer-events:none); não altera
 * a posição dos blocos. Blocos travados pelo content.js não mostram guias.
 * Liga/desliga pela popup (chrome.storage.local, chave "blipAlignEnabled").
 */

(() => {
  "use strict";

  if (window.__blipAlignLoaded) return;
  window.__blipAlignLoaded = true;

  // -------------------------------------------------------------------------
  // Configuração
  // -------------------------------------------------------------------------

  const KEY_ALIGN = "blipAlignEnabled";   // boolean — padrão: ligado
  const TOL = 8;                          // px do canvas para mostrar a guia
  const PAD = 12;                         // quanto a linha passa dos blocos
  const COLOR_OK = "#19a35a";             // alinhado
  const COLOR_NEAR = "#ff2d8a";           // quase alinhado
  const NODE_SELECTOR = "builder-node.diagram-node";
  const LOCKED_CLASS = "blip-locker-locked"; // definida em content.js

  const X_KEYS = ["l", "cx", "r"];
  const Y_KEYS = ["t", "cy", "b"];

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  let enabled = true;
  let overlay = null;
  let dragging = null;
  let raf = 0;

  const getContainer = () => document.getElementById("diagramContainer");

  /** Zoom atual do canvas (o container usa transform: scale()). */
  function getScale() {
    const c = getContainer();
    const m = c && getComputedStyle(c).transform.match(/matrix\(([^,]+)/);
    return m ? parseFloat(m[1]) || 1 : 1;
  }

  /** Caixa do bloco em coordenadas do canvas (independe do zoom/scroll). */
  function box(node) {
    const l = node.offsetLeft, t = node.offsetTop;
    const w = node.offsetWidth, h = node.offsetHeight;
    return { node, l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
  }

  function isLocked(node) {
    return node.classList.contains(LOCKED_CLASS) || !!node.querySelector("." + LOCKED_CLASS);
  }

  // -------------------------------------------------------------------------
  // Overlay e desenho
  // -------------------------------------------------------------------------

  function ensureOverlay() {
    const c = getContainer();
    if (!c) return null;
    if (!overlay || overlay.parentElement !== c) {
      overlay = document.createElement("div");
      overlay.id = "blip-align-overlay";
      overlay.style.cssText =
        "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:99999;";
      c.appendChild(overlay);
    }
    return overlay;
  }

  function clear() {
    if (overlay) overlay.innerHTML = "";
  }

  function drawLine(x1, y1, x2, y2, exact, s) {
    const el = document.createElement("div");
    const th = Math.max(1, 1.5 / s);
    const style = exact ? "solid" : "dashed";
    const color = exact ? COLOR_OK : COLOR_NEAR;
    el.style.cssText = x1 === x2
      ? `position:absolute;left:${x1 - th / 2}px;top:${y1}px;height:${y2 - y1}px;width:0;border-left:${th}px ${style} ${color};`
      : `position:absolute;top:${y1 - th / 2}px;left:${x1}px;width:${x2 - x1}px;height:0;border-top:${th}px ${style} ${color};`;
    overlay.appendChild(el);
  }

  function drawLabel(x, y, text, s) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${1 / s});` +
      `background:${COLOR_NEAR};color:#fff;font:600 11px/1 sans-serif;padding:3px 5px;` +
      "border-radius:4px;white-space:nowrap;";
    overlay.appendChild(el);
  }

  function drawOutline(b, exact, s) {
    const el = document.createElement("div");
    const th = Math.max(1, 1.5 / s);
    const color = (exact ? COLOR_OK : COLOR_NEAR) + "66";
    el.style.cssText =
      `position:absolute;left:${b.l}px;top:${b.t}px;width:${b.r - b.l}px;height:${b.b - b.t}px;` +
      `outline:${th}px solid ${color};border-radius:8px;`;
    overlay.appendChild(el);
  }

  // -------------------------------------------------------------------------
  // Cálculo do alinhamento
  // -------------------------------------------------------------------------

  /**
   * Melhor alinhamento num eixo: menor diferença; em empate, o bloco mais perto.
   * Retorna { diff, value } ou null se nada estiver dentro de TOL.
   */
  function bestMatch(d, others, keys, distance) {
    let best = null;
    for (const o of others) {
      const dist = distance(d, o);
      for (const k1 of keys) {
        for (const k2 of keys) {
          const diff = Math.abs(o[k2] - d[k1]);
          if (diff > TOL) continue;
          if (!best || diff < best.diff - 0.5 || (Math.abs(diff - best.diff) <= 0.5 && dist < best.dist)) {
            best = { diff, dist, value: o[k2] };
          }
        }
      }
    }
    return best;
  }

  /** Blocos que têm alguma borda/centro exatamente nessa coordenada. */
  const sharing = (others, keys, value) =>
    others.filter((o) => keys.some((k) => Math.abs(o[k] - value) < 0.5));

  function render(node) {
    if (!ensureOverlay()) return;
    clear();

    const d = box(node);
    const others = [...getContainer().querySelectorAll(NODE_SELECTOR)]
      .filter((n) => n !== node && n.offsetParent)
      .map(box);
    const s = getScale();

    // Linha vertical (mesmo X)
    const vx = bestMatch(d, others, X_KEYS, (a, o) => Math.abs(a.cy - o.cy));
    if (vx) {
      const exact = vx.diff < 0.5;
      const group = sharing(others, X_KEYS, vx.value);
      const top = Math.min(d.t, ...group.map((o) => o.t)) - PAD;
      const bottom = Math.max(d.b, ...group.map((o) => o.b)) + PAD;
      drawLine(vx.value, top, vx.value, bottom, exact, s);
      group.forEach((o) => drawOutline(o, exact, s));
      if (!exact) drawLabel(vx.value, d.t - 14 / s, `${Math.round(vx.diff)}px`, s);
    }

    // Linha horizontal (mesmo Y)
    const hy = bestMatch(d, others, Y_KEYS, (a, o) => Math.abs(a.cx - o.cx));
    if (hy) {
      const exact = hy.diff < 0.5;
      const group = sharing(others, Y_KEYS, hy.value);
      const left = Math.min(d.l, ...group.map((o) => o.l)) - PAD;
      const right = Math.max(d.r, ...group.map((o) => o.r)) + PAD;
      drawLine(left, hy.value, right, hy.value, exact, s);
      group.forEach((o) => drawOutline(o, exact, s));
      if (!exact) drawLabel(d.l - 22 / s, hy.value, `${Math.round(hy.diff)}px`, s);
    }
  }

  // -------------------------------------------------------------------------
  // Eventos de arraste
  // -------------------------------------------------------------------------

  function onDown(event) {
    if (!enabled || event.button !== 0) return;
    const c = getContainer();
    const node = event.target.closest && event.target.closest(NODE_SELECTOR);
    if (!c || !node || !c.contains(node) || isLocked(node)) return;
    dragging = node;
  }

  function onMove() {
    if (!dragging) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => dragging && render(dragging));
  }

  function onUp() {
    dragging = null;
    cancelAnimationFrame(raf);
    clear();
  }

  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("mouseup", onUp, true);
  window.addEventListener("blur", onUp);

  // -------------------------------------------------------------------------
  // Estado / persistência
  // -------------------------------------------------------------------------

  chrome.storage.local.get(KEY_ALIGN, (data) => {
    enabled = data[KEY_ALIGN] !== false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(KEY_ALIGN in changes)) return;
    enabled = changes[KEY_ALIGN].newValue !== false;
    if (!enabled) onUp();
  });
})();
