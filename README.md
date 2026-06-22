# 🔒 Blip Block Locker

Extensão Chrome (Manifest V3) que **trava a movimentação dos blocos** no canvas do
[BLiP Builder](https://portal.blip.ai), impedindo que sejam arrastados acidentalmente —
**sem bloquear o clique**, então você continua abrindo o bloco e vendo os dados normalmente.

Trava só o arraste. O conteúdo segue acessível.

---

## ✨ Funcionalidades

- **Trava global** — um botão na popup trava/destrava todos os blocos de uma vez.
- **Trava individual** — cada bloco ganha um cadeado 🔓/🔒 clicável no canto; trave só os que quiser.
- **Clique preservado** — abrir o bloco, ver e editar o conteúdo continua funcionando.
- **Persistência** — o estado sobrevive a recarregamentos da página (`chrome.storage.local`).
- **Funciona com blocos dinâmicos** — `MutationObserver` aplica a trava a blocos criados depois do carregamento.
- **Indicador visual** — bloco travado ganha borda azul tracejada + cadeado fechado.
- **100% local** — sem frameworks externos e sem requisições de rede.

---

## 📦 Instalação (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome.
2. Ative o **Modo desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `meu-travador-blip`.
5. Abra o BLiP Builder e clique no ícone 🔒 da extensão.

> Após editar qualquer arquivo, clique no botão de **recarregar** no card da extensão
> e dê **F5** na aba do Builder.

---

## 🕹️ Como usar

| Ação | Como |
|------|------|
| Travar **tudo** | Abra a popup → **Ativar travamento global** |
| Travar **um bloco** | Clique no cadeado 🔓 no canto do bloco (vira 🔒) |
| Destravar um bloco | Clique no cadeado 🔒 (vira 🔓) |
| Ver quantos estão travados | A popup mostra o contador de travas individuais |
| Limpar travas individuais | Popup → **Limpar travas individuais** |

Um bloco fica **efetivamente travado** se: *trava global ligada* **OU** *cadeado individual fechado*.

---

## 🧠 Como funciona

O Builder é uma SPA (Angular + custom elements `<bds-grid>`) e o arraste é tratado por
uma lib interna. A trava age em camadas:

1. **Preserva o clique, bloqueia o movimento** — não cancelamos o `pointerdown`/`mousedown`
   (é ele que seleciona/abre o bloco). Ao pressionar sobre um bloco travado, instalamos um
   "engolidor" de `pointermove`/`mousemove`/`touchmove` em **fase de captura**, que roda
   antes da lib de arraste e impede o reposicionamento. Ao soltar, removemos. Clique puro
   (sem mover) → nenhum `move` → o bloco abre normalmente.
2. **`MutationObserver`** — reaplica trava e cadeado a blocos criados dinamicamente.
3. **`chrome.storage` + `onChanged`** — a popup grava o estado, o content script reage em tempo real.

### Seletores dos blocos
Definidos em [`content.js`](content.js) (`BLOCK_SELECTORS`):

```js
"bds-grid[id^='builder-node-block-']"   // padrão atual do Builder
".builder-node-container"
".builder-node-container-subflow"
```

> Se o Builder mudar o DOM e a trava parar de pegar, ajuste essa lista
> inspecionando um bloco (botão direito → **Inspecionar**).

---

## 🗂️ Estrutura

```
meu-travador-blip/
├── manifest.json     # Manifest V3, permissões, ícones
├── content.js        # lógica de travamento (injetado no Builder)
├── popup.html        # UI da popup
├── popup.js          # controle da popup (global + individual)
├── icons/            # ícones 16/48/128px
└── README.md
```

---

## 🔐 Permissões

| Permissão | Por quê |
|-----------|---------|
| `storage` | Salvar o estado das travas (global e individuais) |
| `activeTab` | Atuar na aba ativa do Builder |
| host `*.blip.ai` | Injetar o content script no portal |

Nenhum dado sai da máquina.

---

## ⚠️ Limitações conhecidas

- Os seletores dependem do DOM atual do Builder; mudanças no portal podem exigir ajuste.
- Não há sincronização entre dispositivos (usa `storage.local`, não `storage.sync`).
- A trava individual usa o `id` do bloco — se o Builder regenerar ids, a trava daquele bloco se perde.
