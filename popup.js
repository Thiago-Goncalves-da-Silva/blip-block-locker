/**
 * Blip Block Locker — popup.js
 * ----------------------------
 * Controla a trava GLOBAL e exibe/limpa as travas INDIVIDUAIS.
 * Tudo é gravado em chrome.storage.local; o content.js observa e aplica.
 */

const KEY_GLOBAL = "blipLockEnabled";   // boolean
const KEY_BLOCKS = "blipLockedBlocks";  // string[]

const toggleBtn = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const headerIcon = document.getElementById("headerIcon");
const countEl = document.getElementById("count");
const clearBtn = document.getElementById("clear");

/** Atualiza a UI da trava global. */
function renderGlobal(enabled) {
  toggleBtn.textContent = enabled ? "Desativar travamento global" : "Ativar travamento global";
  toggleBtn.classList.toggle("on", enabled);
  statusEl.classList.toggle("on", enabled);
  statusText.textContent = enabled ? "Travamento global ativado" : "Travamento global desativado";
  headerIcon.textContent = enabled ? "🔒" : "🔓";
}

/** Atualiza a contagem de travas individuais. */
function renderCount(list) {
  const n = Array.isArray(list) ? list.length : 0;
  countEl.textContent = n;
  clearBtn.disabled = n === 0;
}

// Estado inicial.
chrome.storage.local.get([KEY_GLOBAL, KEY_BLOCKS], (data) => {
  renderGlobal(!!data[KEY_GLOBAL]);
  renderCount(data[KEY_BLOCKS]);
});

// Alterna a trava global.
toggleBtn.addEventListener("click", () => {
  chrome.storage.local.get(KEY_GLOBAL, (data) => {
    const next = !data[KEY_GLOBAL];
    chrome.storage.local.set({ [KEY_GLOBAL]: next }, () => renderGlobal(next));
  });
});

// Limpa todas as travas individuais.
clearBtn.addEventListener("click", () => {
  chrome.storage.local.set({ [KEY_BLOCKS]: [] }, () => renderCount([]));
});

// Guias de alinhamento (align.js) — padrão: ligado.
const KEY_ALIGN = "blipAlignEnabled";   // boolean
const alignToggle = document.getElementById("alignToggle");

chrome.storage.local.get(KEY_ALIGN, (data) => {
  alignToggle.checked = data[KEY_ALIGN] !== false;
});
alignToggle.addEventListener("change", () => {
  chrome.storage.local.set({ [KEY_ALIGN]: alignToggle.checked });
});

// Mantém a UI sincronizada com mudanças vindas da página/outras abas.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (KEY_ALIGN in changes) alignToggle.checked = changes[KEY_ALIGN].newValue !== false;
  if (KEY_GLOBAL in changes) renderGlobal(!!changes[KEY_GLOBAL].newValue);
  if (KEY_BLOCKS in changes) renderCount(changes[KEY_BLOCKS].newValue);
});
