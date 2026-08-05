export function MaskIcon({ src, class: className = '' }: { src: string; class?: string }) {
  return (
    <span
      class={ `ttIcon ${ className }`.trim() }
      style={{
        WebkitMaskImage: `url("${ src }")`,
        maskImage: `url("${ src }")`,
      }}
      aria-hidden="true"
    />
  );
}
