(function (global) {
  'use strict';

  const MODAL_STYLE_ATTR = 'data-tundra-post-stats-modal-style';

  const ensureModalStyles = () => {
    if (document.querySelector(`[${MODAL_STYLE_ATTR}]`)) return;

    const style = document.createElement('style');
    style.setAttribute(MODAL_STYLE_ATTR, 'true');
    style.textContent = `
        #hvPostStatsModal {
          --tt-post-stats-card: var(--tt-card, #ffffff);
          --tt-post-stats-card-alt: var(--tt-card-alt, #dfe5e9);
          --tt-post-stats-border: var(--tt-border, #c3ccd3);
          --tt-post-stats-muted: var(--tt-muted, #5f6b76);
          --tt-post-stats-text: var(--tt-text, #2a3138);
          --tt-post-stats-input-bg: var(--tt-input-bg, #ffffff);
          --tt-post-stats-success: var(--tt-success, #1e7c56);
          --tt-post-stats-heading: var(--font-color, var(--tt-text, #1f2933));
          --tt-post-stats-accent: var(--color-primary, #0C2028);
          --tt-post-stats-backdrop: rgba(12, 32, 40, 0.32);
          --tt-post-stats-shadow: rgba(12, 32, 40, 0.18);
          --tt-post-stats-focus: rgba(12, 32, 40, 0.18);
          --tt-post-stats-link: #2368a2;
          background: transparent;
          border: none;
          box-shadow: none;
          color: var(--tt-post-stats-text);
          margin: 0;
          padding: 0;
        }

        @media (prefers-color-scheme: dark) {
          #hvPostStatsModal {
            color-scheme: dark;
            --tt-post-stats-card: var(--tt-card, #2d343d);
            --tt-post-stats-card-alt: var(--tt-card-alt, #252c33);
            --tt-post-stats-border: var(--tt-border, #3c4651);
            --tt-post-stats-muted: var(--tt-muted, #9aa6b5);
            --tt-post-stats-text: var(--tt-text, #c0cad4);
            --tt-post-stats-input-bg: var(--tt-input-bg, #2a3139);
            --tt-post-stats-success: var(--tt-success, #5ac193);
            --tt-post-stats-heading: var(--font-color, var(--tt-text, #f2f7fc));
            --tt-post-stats-accent: var(--color-primary, #8BA2A6);
            --tt-post-stats-backdrop: rgba(5, 10, 16, 0.78);
            --tt-post-stats-shadow: rgba(0, 0, 0, 0.45);
            --tt-post-stats-focus: rgba(139, 162, 166, 0.25);
            --tt-post-stats-link: #9cc8ff;
          }
        }

        #hvPostStatsModal::backdrop {
          background: var(--tt-post-stats-backdrop);
          backdrop-filter: blur(2px);
        }

        @media (prefers-reduced-motion: reduce) {
          #hvPostStatsModal::backdrop {
            backdrop-filter: none;
          }

          #hvPostStatsModal input[type="text"],
          #hvPostStatsModal input[type="search"],
          #hvPostStatsModal input[type="date"],
          #hvPostStatsModal #countPostsProgressFill {
            transition: none;
          }
        }

        #hvPostStatsModal .hvPostStatsModal__content {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-height: 90vh;
          overflow: hidden;
          overscroll-behavior: contain;
          padding: 18px;
          background: linear-gradient(180deg, var(--tt-post-stats-card) 0%, var(--tt-post-stats-card-alt) 100%);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 12px;
          box-shadow: 0 24px 52px var(--tt-post-stats-shadow);
          color: var(--tt-post-stats-text);
        }

        #hvPostStatsModal h2 {
          margin: 0;
          padding-right: 36px;
          color: var(--tt-post-stats-heading);
          font-size: 27px;
          line-height: 1.15;
          letter-spacing: 0.01em;
          text-wrap: balance;
        }

        #hvPostStatsModal .hvPostStatsModal__form {
          display: grid;
          gap: 10px;
        }

        #hvPostStatsModal .hvPostStatsModal__formItem {
          display: grid;
          gap: 6px;
        }

        #hvPostStatsModal label {
          color: var(--tt-post-stats-muted);
          font-weight: 500;
          font-size: 13px;
        }

        #hvPostStatsModal input[type="text"],
        #hvPostStatsModal input[type="search"],
        #hvPostStatsModal input[type="date"] {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          background: var(--tt-post-stats-input-bg);
          color: var(--tt-post-stats-text);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 8px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        #hvPostStatsModal input[type="text"]:focus-visible,
        #hvPostStatsModal input[type="search"]:focus-visible,
        #hvPostStatsModal input[type="date"]:focus-visible,
        #hvPostStatsModal .hvPostStatsModal__bbcode:focus-visible {
          outline: none;
          border-color: var(--tt-post-stats-accent);
          box-shadow: 0 0 0 2px var(--tt-post-stats-focus);
          background: var(--tt-post-stats-input-bg);
        }

        #hvPostStatsModal .hvPostStatsModal__hint {
          color: var(--tt-post-stats-muted);
          font-size: 12px;
        }

        #hvPostStatsModal #countPostsUsers,
        #hvPostStatsModal #countPostsForums {
          cursor: pointer;
          caret-color: transparent;
          touch-action: manipulation;
        }

        #hvPostStatsModal .hvPostStatsModal__picker {
          position: absolute;
          inset: 0;
          z-index: 5;
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 14px;
          background: var(--tt-post-stats-backdrop);
          overscroll-behavior: contain;
        }

        #hvPostStatsModal .hvPostStatsModal__picker[hidden] {
          display: none;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerInner {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: min(520px, 100%);
          max-height: 100%;
          padding: 14px;
          background: var(--tt-post-stats-card);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 10px;
          box-shadow: 0 16px 36px var(--tt-post-stats-shadow);
        }

        #hvPostStatsModal .hvPostStatsModal__pickerHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: var(--tt-post-stats-heading);
          font-size: 16px;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerHeader .hvPostStatsModal__close {
          position: static;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerList {
          flex: 1 1 auto;
          min-height: 180px;
          max-height: 46vh;
          overflow: auto;
          overscroll-behavior: contain;
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 8px;
          background: var(--tt-post-stats-input-bg);
        }

        #hvPostStatsModal .hvPostStatsModal__pickerItem {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--tt-post-stats-border);
          color: var(--tt-post-stats-text);
          cursor: pointer;
          content-visibility: auto;
          contain-intrinsic-size: auto 40px;
          touch-action: manipulation;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerItem:last-child {
          border-bottom: none;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerItem:hover {
          background: var(--tt-post-stats-card-alt);
        }

        #hvPostStatsModal .hvPostStatsModal__pickerName {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerId {
          color: var(--tt-post-stats-muted);
          font-size: 12px;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerEmpty {
          padding: 16px 12px;
          color: var(--tt-post-stats-muted);
          text-align: center;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerActions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerActions button {
          min-width: 96px;
          padding: 7px 12px;
          border-radius: 8px;
          border: 1px solid var(--tt-post-stats-border);
          background: var(--tt-post-stats-card-alt);
          color: var(--tt-post-stats-text);
          cursor: pointer;
          touch-action: manipulation;
        }

        #hvPostStatsModal .hvPostStatsModal__pickerActions button:hover {
          background: var(--tt-post-stats-input-bg);
        }

        #hvPostStatsModal .hvPostStatsModal__pickerActions button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--tt-post-stats-focus);
        }

        #hvPostStatsModal #countPostsUsersApply,
        #hvPostStatsModal #countPostsForumsApply {
          background: var(--tt-post-stats-success);
          border-color: var(--tt-post-stats-success);
          color: var(--tt-post-stats-card);
          font-weight: 600;
        }

        #hvPostStatsModal input[type="checkbox"] {
          accent-color: var(--tt-post-stats-success);
          transform: translateY(1px);
        }

        #hvPostStatsModal .hvPostStatsModal__checkboxLabel {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--tt-post-stats-text);
          user-select: none;
          touch-action: manipulation;
        }

        #hvPostStatsModal .hvPostStatsModal__close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 32px;
          height: 32px;
          min-width: 32px;
          padding: 0;
          line-height: 1;
          border-radius: 8px;
          border: 1px solid var(--tt-post-stats-border);
          background: var(--tt-post-stats-card-alt);
          color: var(--tt-post-stats-heading);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          touch-action: manipulation;
        }

        #hvPostStatsModal .hvPostStatsModal__close:hover {
          background: var(--tt-post-stats-input-bg);
        }

        #hvPostStatsModal .hvPostStatsModal__close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--tt-post-stats-focus);
        }

        #hvPostStatsModal .hvPostStatsModal__formRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        #hvPostStatsModal .hvPostStatsModal__formActions {
          display: flex;
          justify-content: flex-start;
        }

        #hvPostStatsModal #countPostsSubmit {
          min-width: 126px;
          padding: 8px 14px;
          border-radius: 8px;
          background: var(--tt-post-stats-success);
          border: 1px solid var(--tt-post-stats-success);
          color: var(--tt-post-stats-card);
          font-weight: 600;
          cursor: pointer;
          touch-action: manipulation;
        }

        #hvPostStatsModal #countPostsSubmit:hover {
          opacity: 0.92;
        }

        #hvPostStatsModal #countPostsSubmit:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--tt-post-stats-focus);
        }

        #hvPostStatsModal #countPostsSubmit:disabled {
          opacity: 0.6;
          cursor: default;
        }

        #hvPostStatsModal .hvPostStatsModal__progress {
          display: none;
          margin-top: -2px;
          margin-bottom: 2px;
        }

        #hvPostStatsModal #countPostsProgressText {
          margin-bottom: 6px;
          font-size: 12px;
          color: var(--tt-post-stats-muted);
        }

        #hvPostStatsModal .hvPostStatsModal__progressBar {
          width: 100%;
          height: 10px;
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--tt-post-stats-card-alt);
        }

        #hvPostStatsModal #countPostsProgressFill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, var(--tt-post-stats-success) 0%, var(--tt-post-stats-accent) 100%);
          transition: width 0.15s ease;
        }

        #hvPostStatsModal .hvPostStatsModal__result {
          flex: 1 1 auto;
          min-height: 180px;
          max-height: calc(90vh - 300px);
          overflow-y: auto;
          overscroll-behavior: contain;
          margin-top: 2px;
          padding: 12px 14px;
          background: var(--tt-post-stats-card-alt);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 10px;
          line-height: 1.4;
          font-variant-numeric: tabular-nums;
        }

        #hvPostStatsModal .hvPostStatsModal__result[hidden] {
          display: none;
        }

        #hvPostStatsModal .hvPostStatsModal__result a {
          color: var(--tt-post-stats-link);
        }

        #hvPostStatsModal .hvPostStatsModal__result hr {
          margin: 10px 0;
          border: none;
          height: 1px;
          background-color: var(--tt-post-stats-border);
        }

        #hvPostStatsModal .hvPostStatsModal__bbcodeToggle {
          margin-top: 2px;
        }

        #hvPostStatsModal .hvPostStatsModal__bbcodeToggle[hidden] {
          display: none;
        }

        #hvPostStatsModal .hvPostStatsModal__bbcode {
          flex: 1 1 auto;
          min-height: 180px;
          max-height: calc(90vh - 300px);
          width: 100%;
          box-sizing: border-box;
          margin-top: 2px;
          padding: 12px 14px;
          resize: vertical;
          background: var(--tt-post-stats-card-alt);
          color: var(--tt-post-stats-text);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 10px;
          line-height: 1.4;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
        }

        #hvPostStatsModal .hvPostStatsModal__bbcode[hidden] {
          display: none;
        }

        @media (max-width: 720px) {
          #hvPostStatsModal .hvPostStatsModal__content {
            padding: 14px;
          }

          #hvPostStatsModal h2 {
            font-size: 23px;
          }

          #hvPostStatsModal .hvPostStatsModal__formRow {
            grid-template-columns: 1fr;
          }
        }
      `;
    document.head.appendChild(style);
  };

  const createModal = () => {
    const modal = document.createElement('dialog');
    modal.style = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; width: min(940px, calc(100vw - 32px)); max-height: 90vh;';
    modal.id = 'hvPostStatsModal';
    modal.classList.add('hvPostStatsModal');
    modal.innerHTML = `
        <div class="hvPostStatsModal__content">
          <button type="button" class="hvPostStatsModal__close" id="hvPostStatsModalClose" aria-label="Закрыть">×</button>
          <h2>Счётчик постов</h2>
          <div class="hvPostStatsModal__form">
            <div class="hvPostStatsModal__formItem">
              <label for="countPostsForums">Форумы:</label>
              <input type="text" id="countPostsForums" readonly placeholder="Не выбрано…" value="" autocomplete="off" />
              <span class="hvPostStatsModal__hint">Клик по полю — выбор из списка</span>
            </div>
            <div class="hvPostStatsModal__formItem">
              <label for="countPostsUsers">Пользователи:</label>
              <input type="text" id="countPostsUsers" readonly placeholder="Не выбрано…" value="" autocomplete="off" />
              <span class="hvPostStatsModal__hint">Клик по полю — выбор из списка</span>
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
                <strong>Выбор форумов</strong>
                <button type="button" class="hvPostStatsModal__close" id="hvPostStatsForumsPickerClose" aria-label="Закрыть">×</button>
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
                <strong>Выбор пользователей</strong>
                <button type="button" class="hvPostStatsModal__close" id="hvPostStatsUsersPickerClose" aria-label="Закрыть">×</button>
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
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
