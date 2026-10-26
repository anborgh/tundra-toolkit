let ornamentSeq = 0;

type OrnamentProps = {
  /** Band height in px; the motif scales with it. */
  size?: 10 | 12;
  class?: string;
};

/**
 * Northern bordure: a zigzag ridge with small crosses on every peak,
 * after Siberian / tundra textile borders. Drawn under dark headers.
 */
export function Ornament({ size = 10, class: className = '' }: OrnamentProps) {
  const id = `ttOrn${ ++ornamentSeq }`;
  const big = size === 12;
  const w = big ? 20 : 16;
  const d = big
    ? 'M0 11.5 10 3.5l10 8M7.5 1l5 5M12.5 1l-5 5'
    : 'M0 9.5 8 3l8 6.5M6 .8l4 4M10 .8l-4 4';

  return (
    <svg
      class={ `ttOrnament ${ className }`.trim() }
      width="100%"
      height={ size }
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={ id } width={ w } height={ size } patternUnits="userSpaceOnUse">
          <path
            d={ d }
            fill="none"
            stroke="currentColor"
            stroke-width={ big ? 1.6 : 1.5 }
            stroke-linecap="square"
          />
        </pattern>
      </defs>
      <rect width="100%" height={ size } fill={ `url(#${ id })` } />
    </svg>
  );
}
