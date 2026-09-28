// Inline SVG flags (Windows doesn't render flag emoji). Drawn to fill a square
// viewBox so they crop cleanly inside the round language button.

export function IsraelFlag({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill="#fff" />
      <rect y="3" width="32" height="5" fill="#0038b8" />
      <rect y="24" width="32" height="5" fill="#0038b8" />
      <g fill="none" stroke="#0038b8" strokeWidth="1.3" strokeLinejoin="miter">
        <path d="M16 9.6l5.55 9.6h-11.1z" />
        <path d="M16 22.4l-5.55-9.6h11.1z" />
      </g>
    </svg>
  );
}

export function UsFlag({ size = 32 }) {
  const h = 32 / 13;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * 2 * h} width="32" height={h} fill="#b22234" />)}
      <rect width="16" height={h * 7} fill="#3c3b6e" />
      <g fill="#fff">
        {Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => (
          <circle key={`${r}-${c}`} cx={2.2 + c * 3.8 + (r % 2) * 1.9} cy={2.4 + r * 3.9} r="0.8" />
        )))}
      </g>
    </svg>
  );
}

export const FLAGS = { en: UsFlag, he: IsraelFlag };
