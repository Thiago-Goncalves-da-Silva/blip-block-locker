/**
 * Blip Block Locker — content.js
 * --------------------------------
 * Injetado em portal.blip.ai. "Trava" a MOVIMENTAÇÃO dos blocos do canvas do
 * BLiP Builder (SPA Angular + custom elements <bds-grid>), SEM impedir o
 * clique/seleção — você continua podendo abrir o bloco e ver os dados.
 *
 * Dois modos de travamento, combinados:
 *   - GLOBAL: liga/desliga pela popup; trava todos os blocos.
 *   - INDIVIDUAL: cada bloco ganha um cadeado clicável (🔓/🔒) no canto.
 *   Um bloco está efetivamente travado se (global ligado) OU (cadeado fechado).
 *
 * Como o clique continua funcionando:
 *   Não cancelamos o pointerdown/mousedown (é ele que seleciona/abre o bloco).
 *   Ao pressionar sobre um bloco travado, instalamos um "engolidor" de eventos
 *   de movimento (pointermove/mousemove/touchmove) na FASE DE CAPTURA, que
 *   roda antes da lib de arraste do Builder e impede o reposicionamento.
 *   Ao soltar (pointerup), removemos o engolidor. Um clique puro (sem mover)
 *   não dispara nenhum move, então a seleção/abertura ocorre normalmente.
 *
 * Persistência: chrome.storage.local, sincronizado em tempo real via
 * chrome.storage.onChanged (a popup grava, o content reage).
 */

(() => {
  "use strict";

  if (window.__blipBlockLockerLoaded) return;
  window.__blipBlockLockerLoaded = true;

  // -------------------------------------------------------------------------
  // Configuração
  // -------------------------------------------------------------------------

  const KEY_GLOBAL = "blipLockEnabled";   // boolean — trava global
  const KEY_BLOCKS = "blipLockedBlocks";  // string[] — ids travados individualmente

  /**
   * Seletores dos blocos no canvas. Cada bloco é um <bds-grid> com:
   *   - id começando em "builder-node-block-<uuid>"
   *   - classe "builder-node-container" (ou "...-subflow")
   */
  const BLOCK_SELECTORS = [
    "bds-grid[id^='builder-node-block-']",
    ".builder-node-container",
    ".builder-node-container-subflow"
  ];
  const BLOCK_SELECTOR = BLOCK_SELECTORS.join(",");

  const LOCKED_CLASS = "blip-locker-locked";   // borda azul (travado de fato)
  const TRACKED_CLASS = "blip-locker-tracked"; // position:relative p/ ancorar o cadeado
  const BADGE_CLASS = "blip-locker-badge";

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  let globalLock = false;
  let lockedIds = new Set();
  let observer = null;

  function getBlockId(block) {
    return block && block.id ? block.id : null;
  }

  /** Um bloco está efetivamente travado se o global estiver ligado ou o cadeado dele fechado. */
  function isBlockLocked(block) {
    if (globalLock) return true;
    const id = getBlockId(block);
    return id ? lockedIds.has(id) : false;
  }

  /** Retorna o bloco que contém o nó alvo, ou null. */
  function findBlockAncestor(node) {
    if (!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el && el.closest ? el.closest(BLOCK_SELECTOR) : null;
  }

  // -------------------------------------------------------------------------
  // Estilos
  // -------------------------------------------------------------------------

  function injectStyles() {
    if (document.getElementById("blip-locker-styles")) return;
    const style = document.createElement("style");
    style.id = "blip-locker-styles";
    style.textContent = `
      .${TRACKED_CLASS} { position: relative !important; }

      .${LOCKED_CLASS} {
        outline: 2px dashed #1968f0 !important;
        outline-offset: 2px;
        border-radius: 6px;
        /* impede arraste/scroll por toque, mas permite clique */
        touch-action: none !important;
      }

      .${BADGE_CLASS} {
        position: absolute;
        top: -12px;
        right: -10px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        line-height: 1;
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,.25);
        cursor: pointer;
        z-index: 30;
        opacity: 0.5;
        user-select: none;
        transition: opacity .12s ease, transform .12s ease;
      }
      .${BADGE_CLASS}:hover { opacity: 1; transform: scale(1.12); }
      .${BADGE_CLASS}.locked { opacity: 1; border-color: #1968f0; background: #eaf1fe; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // -------------------------------------------------------------------------
  // Bloqueio do movimento (sem bloquear o clique)
  // -------------------------------------------------------------------------

  function swallowMove(event) {
    // Impede que a lib de arraste do Builder reposicione o bloco.
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function installMoveSwallow() {
    const moves = ["pointermove", "mousemove", "touchmove"];
    const ups = ["pointerup", "mouseup", "touchend", "touchcancel", "pointercancel"];

    moves.forEach((t) =>
      document.addEventListener(t, swallowMove, { capture: true, passive: false })
    );

    const cleanup = () => {
      moves.forEach((t) => document.removeEventListener(t, swallowMove, true));
      ups.forEach((t) => document.removeEventListener(t, cleanup, true));
    };
    ups.forEach((t) => document.addEventListener(t, cleanup, { capture: true }));
  }

  function onPointerDown(event) {
    // Botão direito (menu de contexto) não inicia arraste — ignora.
    if (event.button === 2) return;
    const block = findBlockAncestor(event.target);
    if (!block || !isBlockLocked(block)) return;
    // NÃO cancelamos o pointerdown: o clique/seleção precisa acontecer.
    // Apenas passamos a engolir os eventos de movimento até soltar.
    installMoveSwallow();
  }

  function onDragStart(event) {
    // Bloqueia o drag nativo (HTML5) em blocos travados.
    const block = findBlockAncestor(event.target);
    if (block && isBlockLocked(block)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function installGuards() {
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
    document.addEventListener("mousedown", onPointerDown, { capture: true, passive: false });
    document.addEventListener("touchstart", onPointerDown, { capture: true, passive: false });
    document.addEventListener("dragstart", onDragStart, { capture: true });
  }

  // -------------------------------------------------------------------------
  // Cadeado individual por bloco
  // -------------------------------------------------------------------------

  function stopAll(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  /** Alterna o cadeado individual de um bloco e persiste. */
  function toggleIndividual(block) {
    const id = getBlockId(block);
    if (!id) return;
    chrome.storage.local.get(KEY_BLOCKS, (data) => {
      const list = Array.isArray(data[KEY_BLOCKS]) ? data[KEY_BLOCKS] : [];
      const set = new Set(list);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      chrome.storage.local.set({ [KEY_BLOCKS]: Array.from(set) });
      // O onChanged cuida de re-renderizar.
    });
  }

  /** Garante que o bloco tenha um cadeado clicável e o mantém atualizado. */
  function ensureBadge(block) {
    block.classList.add(TRACKED_CLASS);
    let badge = block.querySelector(`:scope > .${BADGE_CLASS}`);
    if (!badge) {
      badge = document.createElement("div");
      badge.className = BADGE_CLASS;
      badge.title = "Travar/destravar movimentação deste bloco";
      // Impede que o clique no cadeado abra/mova o bloco.
      ["pointerdown", "mousedown", "touchstart"].forEach((t) =>
        badge.addEventListener(t, stopAll, { capture: true })
      );
      badge.addEventListener(
        "click",
        (e) => {
          stopAll(e);
          toggleIndividual(block);
        },
        { capture: true }
      );
      block.appendChild(badge);
    }
    updateBadge(block, badge);
  }

  function updateBadge(block, badge) {
    badge = badge || block.querySelector(`:scope > .${BADGE_CLASS}`);
    if (!badge) return;
    const locked = isBlockLocked(block);
    badge.textContent = locked ? "🔒" : "🔓";
    badge.classList.toggle("locked", locked);
    // Quando o global está ligado, o cadeado individual fica "informativo".
    badge.style.opacity = globalLock ? "0.85" : "";
  }

  // -------------------------------------------------------------------------
  // Render — aplica classes/cadeados a todos os blocos atuais
  // -------------------------------------------------------------------------

  function renderAll() {
    document.querySelectorAll(BLOCK_SELECTOR).forEach((block) => {
      ensureBadge(block);
      block.classList.toggle(LOCKED_CLASS, isBlockLocked(block));
    });
  }

  // -------------------------------------------------------------------------
  // MutationObserver — blocos renderizados dinamicamente
  // -------------------------------------------------------------------------

  function processNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches && node.matches(BLOCK_SELECTOR)) {
      ensureBadge(node);
      node.classList.toggle(LOCKED_CLASS, isBlockLocked(node));
    }
    if (node.querySelectorAll) {
      node.querySelectorAll(BLOCK_SELECTOR).forEach((block) => {
        ensureBadge(block);
        block.classList.toggle(LOCKED_CLASS, isBlockLocked(block));
      });
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(processNode);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // -------------------------------------------------------------------------
  // Estado / persistência
  // -------------------------------------------------------------------------

  function loadState() {
    chrome.storage.local.get([KEY_GLOBAL, KEY_BLOCKS], (data) => {
      globalLock = !!data[KEY_GLOBAL];
      lockedIds = new Set(Array.isArray(data[KEY_BLOCKS]) ? data[KEY_BLOCKS] : []);
      renderAll();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    if (KEY_GLOBAL in changes) {
      globalLock = !!changes[KEY_GLOBAL].newValue;
      changed = true;
    }
    if (KEY_BLOCKS in changes) {
      const v = changes[KEY_BLOCKS].newValue;
      lockedIds = new Set(Array.isArray(v) ? v : []);
      changed = true;
    }
    if (changed) renderAll();
  });

  // -------------------------------------------------------------------------
  // Inicialização
  // -------------------------------------------------------------------------

  injectStyles();
  installGuards();
  startObserver();
  loadState();
})();
