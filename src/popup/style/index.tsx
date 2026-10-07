interface StyleTabProps {
  available: boolean;
  sfwEnabled: boolean;
  sfwBusy: boolean;
  fontScale: number;
  firstLineIndent: boolean;
  paragraphSpacing: number | null;
  sectionAvailable: boolean;
  appearanceBusy: boolean;
  onToggleSfw: () => void;
  onFontScaleChange: (fontScale: number) => void;
  onToggleFirstLineIndent: () => void;
  onParagraphSpacingChange: (paragraphSpacing: number | null) => void;
}

const MIN_FONT_SCALE = 80;
const MAX_FONT_SCALE = 140;
const FONT_SCALE_STEP = 10;
const MAX_PARAGRAPH_SPACING = 2;
const PARAGRAPH_SPACING_STEP = 0.25;

export function StyleTab({
  available,
  sfwEnabled,
  sfwBusy,
  fontScale,
  firstLineIndent,
  paragraphSpacing,
  sectionAvailable,
  appearanceBusy,
  onToggleSfw,
  onFontScaleChange,
  onToggleFirstLineIndent,
  onParagraphSpacingChange,
}: StyleTabProps) {
  const controlsDisabled = !available || appearanceBusy;

  return (
    <div class="styleTab">
      <h2 class="sr-only">Стиль</h2>

      { !available && (
        <div class="styleTabNotice">
          Настройки доступны на форуме, где включён Tundra Toolkit.
        </div>
      ) }

      <section class="ttCard" aria-labelledby="styleGroupForum">
        <h3 id="styleGroupForum" class="ttSectionLabel styleGroupTitle">Весь форум</h3>
        <label class="styleControl">
          <span class="styleControlText">
            <span class="styleControlTitle">SFW-стиль</span>
            <span class="styleControlHint">Мелкие аватары, без подписей, шапки и декора. Содержимое постов не фильтрует.</span>
          </span>
          <span class="ttSwitch">
            <input
              type="checkbox"
              checked={ sfwEnabled }
              disabled={ !available || sfwBusy }
              onChange={ onToggleSfw }
            />
            <span aria-hidden="true" />
          </span>
        </label>
        <div class="styleControl">
          <div class="styleControlText">
            <span class="styleControlTitle">Размер шрифта постов</span>
            <span class="styleControlHint">Клик по значению вернёт 100%</span>
          </div>
          <div class="ttStepper" role="group" aria-label="Размер шрифта постов">
            <button
              type="button"
              disabled={ controlsDisabled || fontScale <= MIN_FONT_SCALE }
              onClick={ () => onFontScaleChange(fontScale - FONT_SCALE_STEP) }
              aria-label="Уменьшить шрифт"
            >
              −
            </button>
            <button
              class="ttStepperValue"
              type="button"
              disabled={ controlsDisabled || fontScale === 100 }
              onClick={ () => onFontScaleChange(100) }
              title="Вернуть 100%"
              aria-label={ `${ fontScale }%. Вернуть 100%` }
            >
              { fontScale }%
            </button>
            <button
              type="button"
              disabled={ controlsDisabled || fontScale >= MAX_FONT_SCALE }
              onClick={ () => onFontScaleChange(fontScale + FONT_SCALE_STEP) }
              aria-label="Увеличить шрифт"
            >
              +
            </button>
          </div>
        </div>
      </section>

      <section class="ttCard" aria-labelledby="styleGroupSection">
        <h3 id="styleGroupSection" class="ttSectionLabel styleGroupTitle">Текущий раздел</h3>
        <label class="styleControl">
          <span class="styleControlText">
            <span class="styleControlTitle">Красная строка</span>
            <span class="styleControlHint">
              { sectionAvailable
                ? 'Отступ в начале каждого абзаца'
                : 'Откройте любую страницу в нужном разделе форума' }
            </span>
          </span>
          <span class="ttSwitch">
            <input
              type="checkbox"
              checked={ firstLineIndent }
              disabled={ controlsDisabled || !sectionAvailable }
              onChange={ onToggleFirstLineIndent }
            />
            <span aria-hidden="true" />
          </span>
        </label>
        { firstLineIndent && (
          <div class="styleControl">
            <div class="styleControlText">
              <span class="styleControlTitle">Отступ между абзацами</span>
              <span class="styleControlHint">Клик по значению вернёт «Авто»</span>
            </div>
            <div class="ttStepper" role="group" aria-label="Отступ между абзацами">
              <button
                type="button"
                disabled={ controlsDisabled || paragraphSpacing === 0 }
                onClick={ () => onParagraphSpacingChange(
                  paragraphSpacing === null
                    ? 0
                    : Math.max(0, paragraphSpacing - PARAGRAPH_SPACING_STEP),
                ) }
                aria-label="Уменьшить отступ между абзацами"
              >
                −
              </button>
              <button
                class="ttStepperValue"
                type="button"
                disabled={ controlsDisabled || paragraphSpacing === null }
                onClick={ () => onParagraphSpacingChange(null) }
                title="Вернуть «Авто»"
              >
                { paragraphSpacing === null ? 'Авто' : `${ paragraphSpacing }em` }
              </button>
              <button
                type="button"
                disabled={ controlsDisabled || paragraphSpacing === MAX_PARAGRAPH_SPACING }
                onClick={ () => onParagraphSpacingChange(
                  paragraphSpacing === null
                    ? PARAGRAPH_SPACING_STEP
                    : Math.min(MAX_PARAGRAPH_SPACING, paragraphSpacing + PARAGRAPH_SPACING_STEP),
                ) }
                aria-label="Увеличить отступ между абзацами"
              >
                +
              </button>
            </div>
          </div>
        ) }
      </section>

      <div class="styleFootnote">Настройки сохраняются отдельно для каждого форума</div>
    </div>
  );
}
