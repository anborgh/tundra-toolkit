(function (global) {
  'use strict';

  const MODAL_STYLE_ATTR = 'data-tundra-post-stats-modal-style';

  const HOST_CSS = `
        #hvPostStatsModal.hvPostStatsModal {
          box-sizing: border-box !important;
          position: fixed !important;
          inset: auto !important;
          top: 50% !important;
          left: 50% !important;
          right: auto !important;
          bottom: auto !important;
          transform: translate(-50%, -50%) !important;
          z-index: 1000 !important;
          width: min(940px, calc(100vw - 32px)) !important;
          max-width: min(940px, calc(100vw - 32px)) !important;
          min-width: 0 !important;
          height: auto !important;
          max-height: 90vh !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          overflow: visible !important;
          outline: none !important;
          color: #152122 !important;
          font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif !important;
          font-size: 16px !important;
          line-height: 1.3 !important;
          color-scheme: light;
        }

        @media (prefers-color-scheme: dark) {
          #hvPostStatsModal.hvPostStatsModal {
            color: #E4EEF0 !important;
            color-scheme: dark;
          }
        }

        #hvPostStatsModal.hvPostStatsModal > [data-tundra-post-stats-root] {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          background: transparent !important;
          box-sizing: border-box !important;
        }

        #hvPostStatsModal.hvPostStatsModal::backdrop {
          background: #152122 !important;
          opacity: 0.72 !important;
          backdrop-filter: blur(2px);
        }

        @media (prefers-reduced-motion: reduce) {
          #hvPostStatsModal.hvPostStatsModal::backdrop {
            backdrop-filter: none;
          }
        }
      `;

  const SHADOW_CSS = `
        :host {
          display: block;
          width: 100%;
          max-width: 100%;
          color-scheme: light;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, textarea, select {
          font: inherit;
          color: inherit;
          margin: 0;
        }
        h1, h2, h3, h4, p { margin: 0; }
        a { color: inherit; }

        :host {
          --tt-night: #152122;
          --tt-bone: #F9F9F4;
          --tt-frost: #275355;
          --tt-earth: #7C5233;
          --tt-ember: #A12830;

          --tt-bg: var(--tt-bone);
          --tt-fg: var(--tt-night);
          --tt-card: var(--tt-bone);
          --tt-card-alt: var(--tt-bg);
          --tt-border: var(--tt-frost);
          --tt-border-strong: var(--tt-night);
          --tt-muted: var(--tt-frost);
          --tt-text: var(--tt-fg);
          --tt-input-bg: var(--tt-bone);
          --tt-success: var(--tt-frost);
          --tt-accent: var(--tt-frost);
          --tt-focus: var(--tt-frost);
          --tt-link: var(--tt-frost);
          --tt-overlay: var(--tt-night);
          --tt-on-frost: var(--tt-bg);
          --tt-font-display: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif;
          --tt-font-body: "Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
          --tt-font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

          background: transparent;
          border: none;
          box-shadow: none;
          color: var(--tt-text);
          font-family: var(--tt-font-body);
          margin: 0;
          padding: 0;
          color-scheme: light;
        }

        @media (prefers-color-scheme: dark) {
          :host {
            color-scheme: dark;
            --tt-night: #0E1A1C;
            --tt-bone: #E4EEF0;
            --tt-frost: #275355;
            --tt-earth: #C9A57A;
            --tt-ember: #E07878;

            --tt-bg: var(--tt-night);
            --tt-fg: var(--tt-bone);
            --tt-card: var(--tt-night);
            --tt-card-alt: var(--tt-night);
            --tt-border: var(--tt-frost);
            --tt-border-strong: var(--tt-bone);
            --tt-muted: var(--tt-frost);
            --tt-text: var(--tt-fg);
            --tt-input-bg: var(--tt-night);
            --tt-success: var(--tt-frost);
            --tt-accent: var(--tt-frost);
            --tt-focus: var(--tt-frost);
            --tt-link: var(--tt-frost);
            --tt-overlay: var(--tt-night);
            --tt-on-frost: var(--tt-bg);
          }
        }


        @media (prefers-reduced-motion: reduce) {
          :host input[type="text"],
          :host input[type="search"],
          :host input[type="date"],
          :host #countPostsProgressFill {
            transition: none;
          }
        }

        :host .hvPostStatsModal__content {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-height: 90vh;
          overflow: hidden;
          overscroll-behavior: contain;
          padding: 18px;
          background: var(--tt-card);
          border: 2px solid var(--tt-border-strong);
          border-radius: 0;
          box-shadow: 0 18px 40px var(--tt-night);
          color: var(--tt-text);
        }

        :host .hvPostStatsModal__content::before {
          content: '›››';
          position: absolute;
          top: 18px;
          left: 18px;
          font-family: var(--tt-font-mono);
          font-size: 11px;
          letter-spacing: -0.12em;
          color: var(--tt-earth);
          opacity: 0.75;
          pointer-events: none;
        }

        :host h2 {
          flex: 0 0 auto;
          margin: 0;
          padding: 0 40px 0 36px;
          color: var(--tt-text);
          font-family: var(--tt-font-display);
          font-size: 26px;
          font-weight: 600;
          line-height: 1.15;
          letter-spacing: 0.01em;
          text-wrap: balance;
          border-bottom: 1px solid var(--tt-earth);
          padding-bottom: 10px;
        }

        :host .hvPostStatsModal__form {
          flex: 0 0 auto;
          display: grid;
          gap: 10px;
        }

        :host .hvPostStatsModal__formItem {
          display: grid;
          gap: 6px;
        }

        :host label {
          color: var(--tt-muted);
          font-weight: 500;
          font-size: 13px;
        }

        :host input[type="text"],
        :host input[type="search"],
        :host input[type="date"] {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          background: var(--tt-input-bg);
          color: var(--tt-text);
          border: 1px solid var(--tt-border);
          border-radius: 0;
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        :host input[type="text"]:focus-visible,
        :host input[type="search"]:focus-visible,
        :host input[type="date"]:focus-visible,
        :host .hvPostStatsModal__bbcode:focus-visible {
          outline: none;
          border-color: var(--tt-accent);
          box-shadow: 0 0 0 2px var(--tt-focus);
          background: var(--tt-input-bg);
        }

        :host .hvPostStatsModal__hint {
          color: var(--tt-muted);
          font-size: 12px;
        }

        :host #countPostsUsers,
        :host #countPostsForums {
          cursor: pointer;
          caret-color: transparent;
          touch-action: manipulation;
        }

        :host .hvPostStatsModal__picker {
          position: absolute;
          inset: 0;
          z-index: 5;
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 14px;
          background: var(--tt-overlay);
          overscroll-behavior: contain;
        }

        :host .hvPostStatsModal__picker[hidden] {
          display: none;
        }

        :host .hvPostStatsModal__pickerInner {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: min(520px, 100%);
          max-height: 100%;
          padding: 14px;
          background: var(--tt-card);
          border: 2px solid var(--tt-border-strong);
          border-radius: 0;
          box-shadow: 0 12px 28px var(--tt-night);
        }

        :host .hvPostStatsModal__pickerHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: var(--tt-text);
          font-family: var(--tt-font-display);
          font-size: 16px;
        }

        :host .hvPostStatsModal__pickerHeader .hvPostStatsModal__close {
          position: static;
        }

        :host .hvPostStatsModal__pickerList {
          flex: 1 1 auto;
          min-height: 180px;
          max-height: 46vh;
          overflow: auto;
          overscroll-behavior: contain;
          border: 1px solid var(--tt-border);
          border-radius: 0;
          background: var(--tt-input-bg);
        }

        :host .hvPostStatsModal__pickerGroup {
          position: sticky;
          top: 0;
          z-index: 1;
          padding: 8px 10px 6px;
          background: var(--tt-card);
          color: var(--tt-muted);
          font-family: var(--tt-font-body);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border-bottom: 1px solid var(--tt-earth);
        }

        :host .hvPostStatsModal__pickerGroup::before {
          content: '››';
          margin-right: 6px;
          letter-spacing: -0.12em;
          color: var(--tt-earth);
        }

        :host .hvPostStatsModal__pickerItem {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--tt-border);
          color: var(--tt-text);
          cursor: pointer;
          content-visibility: auto;
          contain-intrinsic-size: auto 40px;
          touch-action: manipulation;
        }

        :host .hvPostStatsModal__pickerItem:last-child {
          border-bottom: none;
        }

        :host .hvPostStatsModal__pickerItem:hover {
          background: var(--tt-card-alt);
        }

        :host .hvPostStatsModal__pickerName {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        :host .hvPostStatsModal__pickerId {
          color: var(--tt-muted);
          font-size: 12px;
        }

        :host .hvPostStatsModal__pickerEmpty {
          padding: 16px 12px;
          color: var(--tt-muted);
          text-align: center;
        }

        :host .hvPostStatsModal__pickerActions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        :host .hvPostStatsModal__pickerActions button {
          min-width: 96px;
          padding: 7px 12px;
          border-radius: 0;
          border: 1px solid var(--tt-border);
          background: var(--tt-card-alt);
          color: var(--tt-text);
          cursor: pointer;
          touch-action: manipulation;
          font-family: inherit;
        }

        :host .hvPostStatsModal__pickerActions button:hover {
          background: var(--tt-input-bg);
          border-color: var(--tt-earth);
        }

        :host .hvPostStatsModal__pickerActions button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--tt-focus);
        }

        :host #countPostsUsersApply,
        :host #countPostsForumsApply {
          background: var(--tt-success);
          border-color: var(--tt-success);
          color: var(--tt-on-frost);
          font-weight: 600;
        }

        :host input[type="checkbox"] {
          accent-color: var(--tt-success);
          transform: translateY(1px);
        }

        :host .hvPostStatsModal__checkboxLabel {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--tt-text);
          user-select: none;
          touch-action: manipulation;
        }

        :host .hvPostStatsModal__close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 32px;
          height: 32px;
          min-width: 32px;
          padding: 0;
          line-height: 1;
          border-radius: 0;
          border: 1px solid var(--tt-border);
          background: var(--tt-card-alt);
          color: var(--tt-text);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          touch-action: manipulation;
        }

        :host .hvPostStatsModal__close svg {
          width: 16px;
          height: 16px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        :host .hvPostStatsModal__close:hover {
          background: var(--tt-input-bg);
          border-color: var(--tt-earth);
        }

        :host .hvPostStatsModal__close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--tt-focus);
        }

        :host .hvPostStatsModal__formRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        :host .hvPostStatsModal__formActions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 4px;
          padding-top: 10px;
          border-top: 1px solid var(--tt-border);
        }

        :host #countPostsSubmit {
          min-width: 126px;
          padding: 8px 14px;
          border-radius: 0;
          background: var(--tt-success);
          border: 1px solid var(--tt-success);
          color: var(--tt-text);
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          touch-action: manipulation;
        }

        :host #countPostsSubmit:hover {
          opacity: 0.92;
        }

        :host #countPostsSubmit:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--tt-focus);
        }

        :host #countPostsSubmit:disabled {
          opacity: 0.6;
          cursor: default;
        }

        :host .hvPostStatsModal__progress {
          flex: 0 0 auto;
          display: none;
          margin-top: -2px;
          margin-bottom: 2px;
        }

        :host #countPostsProgressText {
          margin-bottom: 6px;
          font-size: 12px;
          color: var(--tt-muted);
        }

        :host .hvPostStatsModal__progressBar {
          width: 100%;
          height: 10px;
          border: 1px solid var(--tt-border);
          border-radius: 0;
          overflow: hidden;
          background: var(--tt-card-alt);
        }

        :host #countPostsProgressFill {
          height: 100%;
          width: 0%;
          background: var(--tt-frost);
          transition: width 0.15s ease;
        }

        :host .hvPostStatsModal__result {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          margin-top: 2px;
          padding: 12px 14px;
          background: var(--tt-card-alt);
          border: 1px solid var(--tt-border);
          border-left: 3px solid var(--tt-earth);
          border-radius: 0;
          line-height: 1.4;
          font-variant-numeric: tabular-nums;
        }

        :host .hvPostStatsModal__result[hidden] {
          display: none;
        }

        :host .hvPostStatsModal__result a {
          color: var(--tt-link);
        }

        :host .hvPostStatsModal__result hr {
          margin: 10px 0;
          border: none;
          height: 1px;
          background-color: var(--tt-earth);
          opacity: 0.45;
        }

        :host .hvPostStatsModal__bbcodeToggle {
          flex: 0 0 auto;
          margin-top: 2px;
        }

        :host .hvPostStatsModal__bbcodeToggle[hidden] {
          display: none;
        }

        :host .hvPostStatsModal__bbcode {
          flex: 1 1 auto;
          min-height: 180px;
          width: 100%;
          box-sizing: border-box;
          margin-top: 2px;
          padding: 12px 14px;
          resize: none;
          background: var(--tt-card-alt);
          color: var(--tt-text);
          border: 1px solid var(--tt-border);
          border-radius: 0;
          line-height: 1.4;
          font-family: var(--tt-font-mono);
          font-size: 12px;
        }

        :host .hvPostStatsModal__bbcode[hidden] {
          display: none;
        }

        @media (max-width: 720px) {
          :host .hvPostStatsModal__content {
            padding: 14px;
          }

          :host h2 {
            font-size: 22px;
            padding-left: 28px;
          }

          :host .hvPostStatsModal__formRow {
            grid-template-columns: 1fr;
          }
        }
      `;

  const ensureModalStyles = () => {
    if (document.querySelector(`[${MODAL_STYLE_ATTR}]`)) return;

    const style = document.createElement('style');
    style.setAttribute(MODAL_STYLE_ATTR, 'true');
    style.textContent = HOST_CSS;
    document.head.appendChild(style);
  };

  const applyHostBox = (modal) => {
    const set = (name, value) => modal.style.setProperty(name, value, 'important');
    set('box-sizing', 'border-box');
    set('position', 'fixed');
    set('inset', 'auto');
    set('top', '50%');
    set('left', '50%');
    set('right', 'auto');
    set('bottom', 'auto');
    set('transform', 'translate(-50%, -50%)');
    set('z-index', '1000');
    set('width', 'min(940px, calc(100vw - 32px))');
    set('max-width', 'min(940px, calc(100vw - 32px))');
    set('min-width', '0');
    set('height', 'auto');
    set('max-height', '90vh');
    set('margin', '0');
    set('padding', '0');
    set('border', 'none');
    set('border-radius', '0');
    set('background', 'transparent');
    set('box-shadow', 'none');
    set('overflow', 'visible');
    set('outline', 'none');
  };

  const applyShellBox = (shell) => {
    const set = (name, value) => shell.style.setProperty(name, value, 'important');
    set('display', 'block');
    set('box-sizing', 'border-box');
    set('width', '100%');
    set('max-width', '100%');
    set('height', 'auto');
    set('max-height', '90vh');
    set('margin', '0');
    set('padding', '0');
    set('border', 'none');
    set('background', 'transparent');
    set('overflow', 'visible');
    set('font', 'inherit');
    set('color', 'inherit');
  };

  const getModalRoot = (modal) => {
    if (!modal) return modal;
    if (modal.shadowRoot) return modal.shadowRoot;
    const shell = modal.querySelector('[data-tundra-post-stats-root]');
    return shell?.shadowRoot || modal;
  };

  const CLOSE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

  const createModal = () => {
    const modal = document.createElement('dialog');
    modal.id = 'hvPostStatsModal';
    modal.classList.add('hvPostStatsModal');
    modal.setAttribute('data-tundra-toolkit', 'post-stats');
    applyHostBox(modal);

    const shell = document.createElement('div');
    shell.setAttribute('data-tundra-post-stats-root', '');
    applyShellBox(shell);
    modal.appendChild(shell);

    const shadow = shell.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${SHADOW_CSS}</style>
        <div class="hvPostStatsModal__content">
          <button type="button" class="hvPostStatsModal__close" id="hvPostStatsModalClose" aria-label="Закрыть">${CLOSE_ICON}</button>
          <h2>Счётчик постов</h2>
          <div class="hvPostStatsModal__form">
            <div class="hvPostStatsModal__formItem">
              <label for="countPostsForums">Форумы:</label>
              <input type="text" id="countPostsForums" readonly placeholder="Не выбрано…" value="" autocomplete="off" />
              <span class="hvPostStatsModal__hint">Нажмите поле, чтобы выбрать из списка</span>
            </div>
            <div class="hvPostStatsModal__formItem">
              <label for="countPostsUsers">Пользователи:</label>
              <input type="text" id="countPostsUsers" readonly placeholder="Не выбрано…" value="" autocomplete="off" />
              <span class="hvPostStatsModal__hint">Нажмите поле, чтобы выбрать из списка</span>
            </div>
            <div class="hvPostStatsModal__formRow">
              <div class="hvPostStatsModal__formItem">
                <label for="countPostsFrom">С:</label>
                <input type="date" id="countPostsFrom" max="" value="" />
              </div>
              <div class="hvPostStatsModal__formItem">
                <label for="countPostsTo">По:</label>
                <input type="date" id="countPostsTo" max="" value="" />
              </div>
            </div>
            <div class="hvPostStatsModal__formItem">
              <label for="countChars" class="hvPostStatsModal__checkboxLabel">
                <input type="checkbox" id="countChars" />
                считать количество символов в постах
              </label>
            </div>
            <div class="hvPostStatsModal__formActions">
              <button type="button" id="countPostsSubmit">Считать</button>
            </div>
          </div>
          <div id="countPostsProgress" class="hvPostStatsModal__progress" aria-live="polite">
            <div id="countPostsProgressText"></div>
            <div class="hvPostStatsModal__progressBar" role="progressbar" id="countPostsProgressBar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="">
              <div id="countPostsProgressFill"></div>
            </div>
          </div>
          <div id="countPostsResultWrap" class="hvPostStatsModal__result" hidden aria-live="polite">
            <div id="countPostsStats"></div>
            <div id="countPostsCharsStats"></div>
            <div id="countPostsTopicsStats"></div>
          </div>
          <textarea id="countPostsBbcode" class="hvPostStatsModal__bbcode" hidden readonly aria-label="Результат в BBCode"></textarea>
          <label id="countPostsBbcodeToggleWrap" for="countPostsBbcodeToggle" class="hvPostStatsModal__checkboxLabel hvPostStatsModal__bbcodeToggle" hidden>
            <input type="checkbox" id="countPostsBbcodeToggle" />
            показать BBCode
          </label>
          <div id="hvPostStatsForumsPicker" class="hvPostStatsModal__picker" hidden>
            <div class="hvPostStatsModal__pickerInner">
              <div class="hvPostStatsModal__pickerHeader">
                <strong>Форумы</strong>
                <button type="button" class="hvPostStatsModal__close" id="hvPostStatsForumsPickerClose" aria-label="Закрыть">${CLOSE_ICON}</button>
              </div>
              <input type="search" id="countPostsForumsSearch" placeholder="Поиск по названию или ID…" autocomplete="off" spellcheck="false" aria-label="Поиск форумов" />
              <div id="countPostsForumsList" class="hvPostStatsModal__pickerList" role="group" aria-label="Список форумов"></div>
              <div class="hvPostStatsModal__pickerActions">
                <button type="button" id="countPostsForumsCancel">Отмена</button>
                <button type="button" id="countPostsForumsApply">Готово</button>
              </div>
            </div>
          </div>
          <div id="hvPostStatsUsersPicker" class="hvPostStatsModal__picker" hidden>
            <div class="hvPostStatsModal__pickerInner">
              <div class="hvPostStatsModal__pickerHeader">
                <strong>Пользователи</strong>
                <button type="button" class="hvPostStatsModal__close" id="hvPostStatsUsersPickerClose" aria-label="Закрыть">${CLOSE_ICON}</button>
              </div>
              <input type="search" id="countPostsUsersSearch" placeholder="Поиск по нику или ID…" autocomplete="off" spellcheck="false" aria-label="Поиск пользователей" />
              <div id="countPostsUsersList" class="hvPostStatsModal__pickerList" role="group" aria-label="Список пользователей"></div>
              <div class="hvPostStatsModal__pickerActions">
                <button type="button" id="countPostsUsersCancel">Отмена</button>
                <button type="button" id="countPostsUsersApply">Готово</button>
              </div>
            </div>
          </div>
        </div>`;
    return modal;
  };

  global.__TT_POST_STATS_MODAL_UI__ = {
    ensureModalStyles,
    createModal,
    getModalRoot,
    applyHostBox,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
