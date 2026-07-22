/**
 * Локальные настройки отображения текста постов.
 */
(function (global) {
  'use strict';

  const FONT_CLASS = 'tundra-post-font-scale';
  const INDENT_CLASS = 'tundra-post-first-line-indent';
  const PARAGRAPH_SPACING_CLASS = 'tundra-post-paragraph-spacing';
  const CONTENT_SELECTOR = '.post .post-content';
  const EXCLUDED_SELECTOR = '.quote-box, .blockcode, pre, code, .post-sig, script, style';
  const INDENT_MARK = 'data-tundra-post-indent';
  const SPACING_MARK = 'data-tundra-post-spacing';

  let currentSettings = {
    fontScale: 100,
    firstLineIndent: false,
    paragraphSpacing: null,
  };
  let styleEl = null;
  let contentObserver = null;
  let processFrame = null;

  const normalizeSettings = (settings) => {
    const rawScale = Number(settings?.fontScale);
    return {
      fontScale: Number.isFinite(rawScale)
        ? Math.min(140, Math.max(80, Math.round(rawScale / 10) * 10))
        : 100,
      firstLineIndent: settings?.firstLineIndent === true,
      paragraphSpacing: typeof settings?.paragraphSpacing === 'number'
        ? Math.min(2, Math.max(0, Math.round(settings.paragraphSpacing * 4) / 4))
        : null,
    };
  };

  const ensureStyle = () => {
    if (!document.head || (styleEl && styleEl.isConnected)) return;
    styleEl = document.head.querySelector('style[data-tundra-post-appearance]');
    if (styleEl) return;

    styleEl = document.createElement('style');
    styleEl.setAttribute('data-tundra-post-appearance', 'true');
    styleEl.textContent =
      `html.${FONT_CLASS} ${CONTENT_SELECTOR} { font-size: var(--tundra-post-font-scale) !important; }\n` +
      `html.${INDENT_CLASS} ${CONTENT_SELECTOR} { text-indent: 2em; }\n` +
      `html.${INDENT_CLASS} ${CONTENT_SELECTOR} :is(.quote-box, .blockcode, pre, code, .post-sig) { text-indent: 0 !important; }\n` +
      `html.${INDENT_CLASS} [${INDENT_MARK}] { display: inline-block; width: 2em; height: 0; text-indent: 0; pointer-events: none; }\n` +
      `html.${PARAGRAPH_SPACING_CLASS} [${SPACING_MARK}] { display: block; height: var(--tundra-post-paragraph-spacing); pointer-events: none; }\n` +
      `html.${PARAGRAPH_SPACING_CLASS} ${CONTENT_SELECTOR} p:not(.quote-box p, .blockcode p, pre p, code p, .post-sig p) { margin-block: 0 !important; }\n` +
      `html.${PARAGRAPH_SPACING_CLASS} ${CONTENT_SELECTOR} p + p:not(.quote-box p, .blockcode p, pre p, code p, .post-sig p) { margin-block-start: var(--tundra-post-paragraph-spacing) !important; }`;
    document.head.appendChild(styleEl);
  };

  const removeIndentMarks = () => {
    document.querySelectorAll(`[${INDENT_MARK}]`).forEach(node => node.remove());
  };

  const removeSpacingMarks = () => {
    document.querySelectorAll(`[${SPACING_MARK}]`).forEach(node => node.remove());
  };

  const addLineBreakMarks = (lineBreak) => {
    if (!(lineBreak instanceof HTMLBRElement)) return;
    if (!lineBreak.closest(CONTENT_SELECTOR) || lineBreak.closest(EXCLUDED_SELECTOR)) return;

    let nextNode = lineBreak.nextSibling;
    if (currentSettings.paragraphSpacing !== null) {
      if (nextNode instanceof HTMLElement && nextNode.hasAttribute(SPACING_MARK)) {
        nextNode = nextNode.nextSibling;
      } else {
        const spacingMark = document.createElement('span');
        spacingMark.setAttribute(SPACING_MARK, 'true');
        spacingMark.setAttribute('aria-hidden', 'true');
        lineBreak.after(spacingMark);
        nextNode = spacingMark.nextSibling;
      }
    }

    if (currentSettings.firstLineIndent) {
      if (nextNode instanceof HTMLElement && nextNode.hasAttribute(INDENT_MARK)) return;
      const indentMark = document.createElement('span');
      indentMark.setAttribute(INDENT_MARK, 'true');
      indentMark.setAttribute('aria-hidden', 'true');
      lineBreak.parentNode?.insertBefore(indentMark, nextNode);
    }
  };

  const processLineBreaks = (root = document) => {
    if (!currentSettings.firstLineIndent && currentSettings.paragraphSpacing === null) return;
    if (root instanceof HTMLBRElement) addLineBreakMarks(root);
    root.querySelectorAll?.(`${CONTENT_SELECTOR} br`).forEach(addLineBreakMarks);
  };

  const scheduleLineBreakProcessing = () => {
    if (processFrame !== null) return;
    processFrame = window.requestAnimationFrame(() => {
      processFrame = null;
      processLineBreaks();
    });
  };

  const startObserver = () => {
    if (contentObserver || !document.documentElement) return;
    contentObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutation => mutation.addedNodes.length > 0)) {
        scheduleLineBreakProcessing();
      }
    });
    contentObserver.observe(document.documentElement, { childList: true, subtree: true });
  };

  const stopObserver = () => {
    contentObserver?.disconnect();
    contentObserver = null;
    if (processFrame !== null) {
      window.cancelAnimationFrame(processFrame);
      processFrame = null;
    }
  };

  const apply = (settings) => {
    currentSettings = normalizeSettings(settings);
    ensureStyle();

    const root = document.documentElement;
    if (!root) return;

    const hasCustomScale = currentSettings.fontScale !== 100;
    root.classList.toggle(FONT_CLASS, hasCustomScale);
    if (hasCustomScale) {
      root.style.setProperty('--tundra-post-font-scale', `${ currentSettings.fontScale }%`);
    } else {
      root.style.removeProperty('--tundra-post-font-scale');
    }

    root.classList.toggle(INDENT_CLASS, currentSettings.firstLineIndent);
    if (!currentSettings.firstLineIndent) removeIndentMarks();

    const hasCustomParagraphSpacing =
      currentSettings.firstLineIndent && currentSettings.paragraphSpacing !== null;
    root.classList.toggle(PARAGRAPH_SPACING_CLASS, hasCustomParagraphSpacing);
    if (hasCustomParagraphSpacing) {
      root.style.setProperty('--tundra-post-paragraph-spacing', `${ currentSettings.paragraphSpacing }em`);
    } else {
      root.style.removeProperty('--tundra-post-paragraph-spacing');
      removeSpacingMarks();
    }

    if (currentSettings.firstLineIndent || hasCustomParagraphSpacing) {
      processLineBreaks();
      startObserver();
    } else {
      stopObserver();
    }
  };

  global.__TT_POST_APPEARANCE__ = {
    apply,
    getSettings: () => ({ ...currentSettings }),
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
