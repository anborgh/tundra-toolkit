export function MaskIcon({ src, class: className = '' }: { src: string; class?: string }) {
  return (
    <img
      src={ src }
      alt=""
      class={ `ttIcon ${ className }`.trim() }
      aria-hidden="true"
    />
  );
}
