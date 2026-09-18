/**
 * Every journal address gets its own speckled egg, drawn from the address
 * bytes, so two journals are easy to tell apart at a glance.
 */
export function EggMark({ address, size = 56 }: { address: string; size?: number }) {
  const hex = address.replace(/^0x/i, '').toLowerCase().padEnd(40, '0');
  const byte = (i: number) => parseInt(hex.slice((i * 2) % 40, (i * 2) % 40 + 2), 16);
  const shells = ['#e9e1c9', '#cfdcc0', '#d9c7a6', '#c9d6d8', '#eadbc4', '#d7d0b8'];
  const inks = ['#5b3a24', '#34423a', '#6b2f22', '#2e3b52', '#4e4630'];
  const shell = shells[byte(0) % shells.length];
  const ink = inks[byte(1) % inks.length];
  const spots = Array.from({ length: 11 }, (_, i) => ({
    x: 14 + (byte(i + 2) / 255) * 28,
    y: 16 + (byte(i + 8) / 255) * 36,
    r: 1 + (byte(i + 13) % 4) * 0.7,
  }));

  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 56 67" role="img" aria-label={`Journal mark for ${address.slice(0, 8)}`}>
      <defs>
        <clipPath id={`egg-${hex.slice(0, 8)}`}>
          <path d="M28 3 C 44 3, 53 30, 53 43 C 53 57, 42 64, 28 64 C 14 64, 3 57, 3 43 C 3 30, 12 3, 28 3 Z" />
        </clipPath>
      </defs>
      <path d="M28 3 C 44 3, 53 30, 53 43 C 53 57, 42 64, 28 64 C 14 64, 3 57, 3 43 C 3 30, 12 3, 28 3 Z" fill={shell} />
      <g clipPath={`url(#egg-${hex.slice(0, 8)})`} fill={ink} opacity=".78">
        {spots.map((s, i) => (
          <ellipse key={i} cx={s.x} cy={s.y} rx={s.r * 1.3} ry={s.r} transform={`rotate(${byte(i) % 90} ${s.x} ${s.y})`} />
        ))}
      </g>
      <path
        d="M28 3 C 44 3, 53 30, 53 43 C 53 57, 42 64, 28 64 C 14 64, 3 57, 3 43 C 3 30, 12 3, 28 3 Z"
        fill="none"
        stroke="#1c1a16"
        strokeWidth="1.6"
      />
    </svg>
  );
}
