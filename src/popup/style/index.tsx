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
      <div class="styleTabHeader">
        <h4>Стиль</h4>
        <p class="text-secondary">Настройки сохраняются отдельно для каждого форума.</p>
      </div>

      { !available && (
        <div class="styleTabNotice">
          Настройки доступны на форуме после включения расширения.
        </div>
      ) }

      <div class="styleControl">
        <div>
          <h5>SFW-стиль</h5>
          <p class="text-secondary">Заменить оформление форума на нейтральное.</p>
        </div>
        <label class="styleSwitch">
          <input
            type="checkbox"
            checked={ sfwEnabled }
            disabled={ !available || sfwBusy }
            onChange={ onToggleSfw }
          />
          <span aria-hidden="true" />
          <span class="sr-only">SFW-стиль</span>
        </label>
      </div>

      <div class="styleControl">
        <div>
          <h5>Размер шрифта постов</h5>
          <p class="text-secondary">Масштаб текста на текущем форуме. Может не слушаться, если на форуме стоит свой скрипт размера шрифта.</p>
        </div>
        <div class="fontScaleControl" aria-label="Размер шрифта постов">
          <button
            class="button small"
            type="button"
            disabled={ controlsDisabled || fontScale <= MIN_FONT_SCALE }
            onClick={ () => onFontScaleChange(fontScale - FONT_SCALE_STEP) }
            aria-label="Уменьшить шрифт"
          >
            −
          </button>
          <button
            class="fontScaleValue"
            type="button"
            disabled={ controlsDisabled || fontScale === 100 }
            onClick={ () => onFontScaleChange(100) }
            title="Сбросить масштаб"
          >
            { fontScale }%
          </button>
          <button
            class="button small"
            type="button"
            disabled={ controlsDisabled || fontScale >= MAX_FONT_SCALE }
            onClick={ () => onFontScaleChange(fontScale + FONT_SCALE_STEP) }
            aria-label="Увеличить шрифт"
          >
            +
          </button>
        </div>
      </div>

      <div class="styleControl">
        <div>
          <h5>Красная строка</h5>
          <p class="text-secondary">
            { sectionAvailable
              ? 'Отступ в начале абзацев и после переноса строки в текущем разделе.'
              : 'Настройка доступна внутри раздела форума.' }
          </p>
        </div>
        <label class="styleSwitch">
          <input
            type="checkbox"
            checked={ firstLineIndent }
            disabled={ controlsDisabled || !sectionAvailable }
            onChange={ onToggleFirstLineIndent }
          />
          <span aria-hidden="true" />
          <span class="sr-only">Красная строка</span>
        </label>
      </div>

      { firstLineIndent && (
        <div class="styleControl">
          <div>
            <h5>Отступ между абзацами</h5>
            <p class="text-secondary">Расстояние между соседними абзацами поста.</p>
          </div>
          <div class="fontScaleControl" aria-label="Отступ между абзацами">
            <button
              class="button small"
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
              class="fontScaleValue paragraphSpacingValue"
              type="button"
              disabled={ controlsDisabled || paragraphSpacing === null }
              onClick={ () => onParagraphSpacingChange(null) }
              title="Вернуть отступы форума"
            >
              { paragraphSpacing === null ? 'Авто' : `${ paragraphSpacing }em` }
            </button>
            <button
              class="button small"
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
    </div>
  );
}
