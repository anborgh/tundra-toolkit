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
          width: min(720px, calc(100vw - 32px)) !important;
          max-width: min(720px, calc(100vw - 32px)) !important;
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
          font-family: "Golos Text", "Golos UI", "Segoe UI", system-ui, sans-serif !important;
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
          background: #14201F !important;
          opacity: 0.6 !important;
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
          --tt-bg: #F7F8F7;
          --tt-card: #FFFFFF;
          --tt-card-alt: #F2F4F3;
          --tt-subtle: #EDF0EF;
          --tt-border: #DDE2E0;
          --tt-border-soft: #EEF1F0;
          --tt-border-strong: #C9D1CE;
          --tt-text: #172227;
          --tt-text-2: #45535A;
          --tt-muted: #56646B;
          --tt-frost: #0E6B62;
          --tt-frost-hover: #0A5A52;
          --tt-on-frost: #FFFFFF;
          --tt-accent-soft: #E3F1EE;
          --tt-accent-text: #0A4F48;
          --tt-input-bg: #FFFFFF;
          --tt-link: #0E6B62;
          --tt-focus: rgba(14, 107, 98, 0.3);
          --tt-head-bg: #14201F;
          --tt-head-muted: #9FB2B0;
          --tt-head-soft: #CFE0DD;
          --tt-ornament: #4F9C91;
          --tt-shadow: 0 24px 64px rgba(10, 20, 20, 0.45);
          --tt-font-display: "Unbounded", "Golos Text", "Golos UI", "Segoe UI", system-ui, sans-serif;
          --tt-font-body: "Golos Text", "Golos UI", "Segoe UI", "SF Pro Text", system-ui, -apple-system, sans-serif;
          --tt-font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

          background: transparent;
          border: none;
          box-shadow: none;
          color: var(--tt-text);
          font-family: var(--tt-font-body);
          font-size: 14px;
          line-height: 1.5;
          margin: 0;
          padding: 0;
        }

        @media (prefers-color-scheme: dark) {
          :host {
            color-scheme: dark;
            --tt-bg: #121D1C;
            --tt-card: #172322;
            --tt-card-alt: #1B2928;
            --tt-subtle: #22302F;
            --tt-border: #2A3938;
            --tt-border-soft: #22302F;
            --tt-border-strong: #3A4A4C;
            --tt-text: #E4EEEC;
            --tt-text-2: #C3D2D0;
            --tt-muted: #9FB2B0;
            --tt-frost: #3BA897;
            --tt-frost-hover: #52BBA9;
            --tt-on-frost: #0B1716;
            --tt-accent-soft: rgba(59, 168, 151, 0.16);
            --tt-accent-text: #7DD9C9;
            --tt-input-bg: #121D1C;
            --tt-link: #7DD9C9;
            --tt-focus: rgba(59, 168, 151, 0.35);
            --tt-head-bg: #0B1413;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          :host #countPostsProgressFill {
            transition: none;
          }
        }

        :host .hvPostStatsModal__content {
          position: relative;
          display: flex;
          flex-direction: column;
          max-height: 90vh;
          overflow: hidden;
          background: var(--tt-bg);
          border-radius: 14px;
          box-shadow: var(--tt-shadow);
          color: var(--tt-text);
        }

        :host .hvPostStatsModal__head {
          flex: 0 0 auto;
          background: var(--tt-head-bg);
          color: #FFFFFF;
        }

        :host .hvPostStatsModal__headRow {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 12px 12px 20px;
        }

        :host .hvPostStatsModal__logo {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          flex: 0 0 auto;
          border-radius: 10px;
          background: #0E6B62;
          color: #E3F3EF;
        }

        :host .hvPostStatsModal__logo svg,
        :host .hvPostStatsModal__close svg {
          width: 18px;
          height: 18px;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        :host .hvPostStatsModal__titles {
          flex: 1 1 auto;
          min-width: 0;
        }

        :host h2 {
          font-family: var(--tt-font-display);
          font-size: 17px;
          font-weight: 600;
          line-height: 1.3;
          letter-spacing: -0.01em;
          color: #FFFFFF;
        }

        :host .hvPostStatsModal__sub {
          font-size: 13px;
          color: var(--tt-head-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        :host .hvPostStatsModal__ornament {
          display: block;
          width: 100%;
          height: 12px;
          color: var(--tt-ornament);
        }

        :host .hvPostStatsModal__close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          min-width: 36px;
          padding: 0;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--tt-head-soft);
          cursor: pointer;
          touch-action: manipulation;
        }

        :host .hvPostStatsModal__close:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #FFFFFF;
        }

        :host .hvPostStatsModal__close:focus-visible,
        :host button:focus-visible {
          outline: 2px solid var(--tt-frost);
          outline-offset: 2px;
        }

        :host .hvPostStatsModal__body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        :host .hvPostStatsModal__form {
          display: grid;
          gap: 16px;
        }

        :host .hvPostStatsModal__formItem {
          display: grid;
          gap: 6px;
        }

        :host label {
          font-weight: 600;
          color: var(--tt-text);
        }

        :host input[type="text"],
        :host input[type="search"],
        :host input[type="date"] {
          width: 100%;
          height: 42px;
          padding: 0 12px;
          background: var(--tt-input-bg);
          color: var(--tt-text);
          border: 1px solid var(--tt-border-strong);
          border-radius: 8px;
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        :host input[type="text"]:focus-visible,
        :host input[type="search"]:focus-visible,
        :host input[type="date"]:focus-visible,
        :host .hvPostStatsModal__bbcode:focus-visible {
          outline: none;
          border-color: var(--tt-frost);
          box-shadow: 0 0 0 1px var(--tt-frost);
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
          padding: 16px;
          background: rgba(20, 32, 31, 0.55);
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
          padding: 16px;
          background: var(--tt-card);
          border-radius: 12px;
          box-shadow: var(--tt-shadow);
        }

        :host .hvPostStatsModal__pickerHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 16px;
        }

        :host .hvPostStatsModal__pickerHeader .hvPostStatsModal__close {
          color: var(--tt-muted);
        }

        :host .hvPostStatsModal__pickerHeader .hvPostStatsModal__close:hover {
          background: var(--tt-subtle);
          color: var(--tt-text);
        }

        :host .hvPostStatsModal__pickerList {
          flex: 1 1 auto;
          min-height: 180px;
          max-height: 46vh;
          overflow: auto;
          overscroll-behavior: contain;
          border: 1px solid var(--tt-border);
          border-radius: 8px;
          background: var(--tt-input-bg);
        }

        :host .hvPostStatsModal__pickerGroup {
          position: sticky;
          top: 0;
          z-index: 1;
          padding: 8px 12px 6px;
          background: var(--tt-card-alt);
          color: var(--tt-muted);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border-bottom: 1px solid var(--tt-border-soft);
        }

        :host .hvPostStatsModal__pickerItem {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-bottom: 1px solid var(--tt-border-soft);
          color: var(--tt-text);
          font-weight: 400;
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

        :host .hvPostStatsModal__pickerActions button,
        :host .hvPostStatsModal__secondary {
          min-width: 96px;
          height: 38px;
          padding: 0 16px;
          border-radius: 8px;
          border: 1px solid var(--tt-border-strong);
          background: var(--tt-card);
          color: var(--tt-text);
          font-weight: 500;
          cursor: pointer;
          touch-action: manipulation;
        }

        :host .hvPostStatsModal__pickerActions button:hover {
          background: var(--tt-card-alt);
        }

        :host #countPostsUsersApply,
        :host #countPostsForumsApply,
        :host #countPostsSubmit {
          background: var(--tt-frost);
          border: 1px solid var(--tt-frost);
          color: var(--tt-on-frost);
        }

        :host #countPostsUsersApply:hover,
        :host #countPostsForumsApply:hover,
        :host #countPostsSubmit:hover:not(:disabled) {
          background: var(--tt-frost-hover);
          border-color: var(--tt-frost-hover);
        }

        :host input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: var(--tt-frost);
        }

        :host .hvPostStatsModal__checkboxLabel {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-weight: 400;
          color: var(--tt-text);
          user-select: none;
          cursor: pointer;
          touch-action: manipulation;
        }

        :host .hvPostStatsModal__formRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        :host #countPostsSubmit {
          min-width: 126px;
          height: 38px;
          padding: 0 16px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          touch-action: manipulation;
        }

        :host #countPostsSubmit:disabled {
          opacity: 0.6;
          cursor: progress;
        }

        :host .hvPostStatsModal__footer {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px 20px 20px;
          background: var(--tt-card);
          border-top: 1px solid var(--tt-border);
        }

        :host .hvPostStatsModal__footerRow {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        :host .hvPostStatsModal__footerRow .hvPostStatsModal__hint {
          flex: 1 1 auto;
        }

        :host .hvPostStatsModal__progress {
          display: none;
        }

        :host #countPostsProgressText {
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--tt-text);
        }

        :host .hvPostStatsModal__progressBar {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          background: var(--tt-subtle);
        }

        :host #countPostsProgressFill {
          height: 100%;
          width: 0%;
          border-radius: 4px;
          background: var(--tt-frost);
          transition: width 0.15s ease;
        }

        :host .hvPostStatsModal__result {
          display: flex;
          flex-direction: column;
          gap: 16px;
          line-height: 1.5;
          font-variant-numeric: tabular-nums;
        }

        :host .hvPostStatsModal__result[hidden] {
          display: none;
        }

        :host .hvPostStatsModal__result a {
          color: var(--tt-link);
        }

        :host .hvPostStatsModal__result h4 {
          margin: 0 0 8px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--tt-muted);
        }

        :host .ttStats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        :host .ttStat {
          display: flex;
          flex-direction: column;
          padding: 12px 14px;
          background: var(--tt-card);
          border: 1px solid var(--tt-border);
          border-radius: 10px;
        }

        :host .ttStat span {
          font-size: 12px;
          color: var(--tt-muted);
        }

        :host .ttStat strong {
          font-size: 22px;
          font-weight: 700;
        }

        :host .ttPeriod {
          font-size: 13px;
          color: var(--tt-muted);
        }

        :host .ttTableWrap,
        :host .ttTopics,
        :host .ttChars {
          background: var(--tt-card);
          border: 1px solid var(--tt-border);
          border-radius: 10px;
          overflow: hidden;
        }

        :host .ttTable {
          width: 100%;
          border-collapse: collapse;
        }

        :host .ttTable th {
          padding: 8px 12px;
          border-bottom: 1px solid var(--tt-border);
          font-size: 12px;
          font-weight: 600;
          color: var(--tt-muted);
          text-align: left;
        }

        :host .ttTable td {
          padding: 9px 12px;
          border-bottom: 1px solid var(--tt-border-soft);
        }

        :host .ttTable tr:last-child td {
          border-bottom: 0;
        }

        :host .ttTable .num {
          text-align: right;
          width: 120px;
        }

        :host .ttTopics {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        :host .ttTopics li {
          display: flex;
          gap: 12px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--tt-border-soft);
        }

        :host .ttTopics li:last-child {
          border-bottom: 0;
        }

        :host .ttTopics .count {
          flex: 0 0 32px;
          text-align: right;
          font-weight: 600;
          color: var(--tt-text-2);
        }

        :host .ttChars {
          padding: 12px 14px;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        :host .hvPostStatsModal__bbcodeBox {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px;
          background: var(--tt-card);
          border: 1px solid var(--tt-border);
          border-radius: 10px;
        }

        :host .hvPostStatsModal__bbcodeBox[hidden],
        :host .hvPostStatsModal__bbcodeToggle[hidden] {
          display: none;
        }

        :host .hvPostStatsModal__bbcode {
          min-height: 180px;
          width: 100%;
          padding: 10px 120px 10px 12px;
          resize: vertical;
          background: var(--tt-bg);
          color: var(--tt-text);
          border: 1px solid var(--tt-border-strong);
          border-radius: 8px;
          line-height: 1.5;
          font-family: var(--tt-font-mono);
          font-size: 13px;
        }

        :host .hvPostStatsModal__bbcode[hidden] {
          display: none;
        }

        @media (max-width: 720px) {
          :host .hvPostStatsModal__body {
            padding: 16px;
          }

          :host .hvPostStatsModal__formRow {
            grid-template-columns: 1fr;
          }
        }

        :host .hvPostStatsModal__switchRow {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 400;
          cursor: pointer;
        }

        :host .hvPostStatsModal__switchText {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
        }

        :host .hvPostStatsModal__switchTitle {
          font-weight: 600;
        }

        :host input.hvPostStatsModal__switch {
          appearance: none;
          -webkit-appearance: none;
          position: relative;
          flex: 0 0 auto;
          width: 40px;
          height: 24px;
          margin: 0;
          border-radius: 12px;
          background: var(--tt-border-strong);
          cursor: pointer;
          transition: background-color 0.15s ease;
        }

        :host input.hvPostStatsModal__switch::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #FFFFFF;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          transition: transform 0.15s ease;
        }

        :host input.hvPostStatsModal__switch:checked {
          background: var(--tt-frost);
        }

        :host input.hvPostStatsModal__switch:checked::after {
          transform: translateX(16px);
        }

        :host input.hvPostStatsModal__switch:focus-visible {
          outline: 2px solid var(--tt-frost);
          outline-offset: 2px;
        }

        :host .hvPostStatsModal__bbcodeWrap {
          position: relative;
        }

        :host .hvPostStatsModal__copy {
          position: absolute;
          top: 8px;
          right: 8px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          height: 30px;
          padding: 0 10px;
          font-size: 13px;
        }

        :host .hvPostStatsModal__copy svg {
          width: 15px;
          height: 15px;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        :host .hvPostStatsModal__bbcode[hidden] + .hvPostStatsModal__copy {
          display: none;
        }

        :host .hvPostStatsModal__head {
          position: relative;
          z-index: 2;
        }

        :host .hvPostStatsModal__ornament {
          background: var(--tt-head-bg);
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
    set('width', 'min(720px, calc(100vw - 32px))');
    set('max-width', 'min(720px, calc(100vw - 32px))');
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
  const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>`;
  const CALC_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01"/></svg>`;
  const ORNAMENT = `<svg class="hvPostStatsModal__ornament" width="100%" height="12" aria-hidden="true" focusable="false"><defs><pattern id="hvPostStatsOrnament" width="20" height="12" patternUnits="userSpaceOnUse"><path d="M0 11.5 10 3.5l10 8M7.5 1l5 5M12.5 1l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></pattern></defs><rect width="100%" height="12" fill="url(#hvPostStatsOrnament)"/></svg>`;
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

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
        <div class="hvPostStatsModal__content" role="document">
          <div class="hvPostStatsModal__head">
            <div class="hvPostStatsModal__headRow">
              <div class="hvPostStatsModal__logo" aria-hidden="true">${CALC_ICON}</div>
              <div class="hvPostStatsModal__titles">
                <h2 id="hvPostStatsModalTitle">Счётчик постов</h2>
                <div class="hvPostStatsModal__sub">${escapeHtml(location.host)}</div>
              </div>
              <button type="button" class="hvPostStatsModal__close" id="hvPostStatsModalClose" aria-label="Закрыть">${CLOSE_ICON}</button>
            </div>
            ${ORNAMENT}
          </div>
          <div class="hvPostStatsModal__body">
            <div class="hvPostStatsModal__form">
              <div class="hvPostStatsModal__formItem">
                <label for="countPostsForums">Разделы</label>
                <input type="text" id="countPostsForums" readonly placeholder="Не выбрано…" value="" autocomplete="off" />
                <span class="hvPostStatsModal__hint">Нажмите поле, чтобы выбрать из списка. Искать можно по названию или ID</span>
              </div>
              <div class="hvPostStatsModal__formItem">
                <label for="countPostsUsers">Профили</label>
                <input type="text" id="countPostsUsers" readonly placeholder="Не выбрано…" value="" autocomplete="off" />
                <span class="hvPostStatsModal__hint">Нажмите поле, чтобы выбрать из списка. Искать можно по нику или ID</span>
              </div>
              <div class="hvPostStatsModal__formRow">
                <div class="hvPostStatsModal__formItem">
                  <label for="countPostsFrom">С</label>
                  <input type="date" id="countPostsFrom" max="" value="" />
                </div>
                <div class="hvPostStatsModal__formItem">
                  <label for="countPostsTo">По</label>
                  <input type="date" id="countPostsTo" max="" value="" />
                </div>
              </div>
              <label for="countChars" class="hvPostStatsModal__checkboxLabel">
                <input type="checkbox" id="countChars" />
                Считать количество символов в постах
              </label>
            </div>
            <div id="countPostsResultWrap" class="hvPostStatsModal__result" hidden aria-live="polite">
              <div id="countPostsStats"></div>
              <div id="countPostsCharsStats"></div>
              <div id="countPostsTopicsStats"></div>
            </div>
            <div class="hvPostStatsModal__bbcodeBox hvPostStatsModal__bbcodeToggle" id="countPostsBbcodeToggleWrap" hidden>
              <label for="countPostsBbcodeToggle" class="hvPostStatsModal__switchRow">
                <span class="hvPostStatsModal__switchText">
                  <span class="hvPostStatsModal__switchTitle">Показать BBCode</span>
                  <span class="hvPostStatsModal__hint">Для банка, отчёта или сообщения на форуме</span>
                </span>
                <input type="checkbox" role="switch" id="countPostsBbcodeToggle" class="hvPostStatsModal__switch" />
              </label>
              <div class="hvPostStatsModal__bbcodeWrap">
                <textarea id="countPostsBbcode" class="hvPostStatsModal__bbcode" hidden readonly rows="6" aria-label="Результат в BBCode"></textarea>
                <button type="button" class="hvPostStatsModal__secondary hvPostStatsModal__copy" id="countPostsBbcodeCopy">${COPY_ICON}Копировать</button>
              </div>
            </div>
          </div>
          <div class="hvPostStatsModal__footer">
            <div id="countPostsProgress" class="hvPostStatsModal__progress" aria-live="polite">
              <div id="countPostsProgressText"></div>
              <div class="hvPostStatsModal__progressBar" role="progressbar" id="countPostsProgressBar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="">
                <div id="countPostsProgressFill"></div>
              </div>
            </div>
            <div class="hvPostStatsModal__footerRow">
              <span class="hvPostStatsModal__hint">Не закрывайте страницу до конца подсчёта. Чем больше разделов и длиннее период, тем дольше.</span>
              <button type="button" id="countPostsSubmit">Считать</button>
            </div>
          </div>
          <div id="hvPostStatsForumsPicker" class="hvPostStatsModal__picker" hidden>
            <div class="hvPostStatsModal__pickerInner">
              <div class="hvPostStatsModal__pickerHeader">
                <strong>Разделы</strong>
                <button type="button" class="hvPostStatsModal__close" id="hvPostStatsForumsPickerClose" aria-label="Закрыть">${CLOSE_ICON}</button>
              </div>
              <input type="search" id="countPostsForumsSearch" placeholder="Поиск по названию или ID…" autocomplete="off" spellcheck="false" aria-label="Поиск разделов" />
              <div id="countPostsForumsList" class="hvPostStatsModal__pickerList" role="group" aria-label="Список разделов"></div>
              <div class="hvPostStatsModal__pickerActions">
                <button type="button" id="countPostsForumsCancel">Отмена</button>
                <button type="button" id="countPostsForumsApply">Готово</button>
              </div>
            </div>
          </div>
          <div id="hvPostStatsUsersPicker" class="hvPostStatsModal__picker" hidden>
            <div class="hvPostStatsModal__pickerInner">
              <div class="hvPostStatsModal__pickerHeader">
                <strong>Профили</strong>
                <button type="button" class="hvPostStatsModal__close" id="hvPostStatsUsersPickerClose" aria-label="Закрыть">${CLOSE_ICON}</button>
              </div>
              <input type="search" id="countPostsUsersSearch" placeholder="Поиск по нику или ID…" autocomplete="off" spellcheck="false" aria-label="Поиск профилей" />
              <div id="countPostsUsersList" class="hvPostStatsModal__pickerList" role="group" aria-label="Список профилей"></div>
              <div class="hvPostStatsModal__pickerActions">
                <button type="button" id="countPostsUsersCancel">Отмена</button>
                <button type="button" id="countPostsUsersApply">Готово</button>
              </div>
            </div>
          </div>
        </div>`;
    const copyButton = shadow.getElementById('countPostsBbcodeCopy');
    const bbcodeField = shadow.getElementById('countPostsBbcode');
    copyButton?.addEventListener('click', async () => {
      const text = bbcodeField?.value || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        bbcodeField.select();
        document.execCommand?.('copy');
      }
      copyButton.innerHTML = `${COPY_ICON}Скопировано`;
      window.setTimeout(() => { copyButton.innerHTML = `${COPY_ICON}Копировать`; }, 1600);
    });

    return modal;
  };

  global.__TT_POST_STATS_MODAL_UI__ = {
    ensureModalStyles,
    createModal,
    getModalRoot,
    applyHostBox,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
