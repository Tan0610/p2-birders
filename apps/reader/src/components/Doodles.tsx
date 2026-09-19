/* Pencil marks for the cabinet: a drifting feather while a journal is fetched, and a bare nest where there is nothing to show. */

export function Feather({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 62 C 19 48, 19 30, 22 4" />
        <path d="M21.5 8 C 30 12, 35 24, 32 40 C 29 46, 24 48, 20.5 48" />
        <path d="M21.5 8 C 12 14, 7 26, 9 38 C 11 44, 15 46, 19.5 47" />
        <path d="M21 18 L 29 22 M 20.6 26 L 30.5 31 M 20.3 34 L 29 39 M 21 21 L 12 25 M 20.5 29 L 10.5 33 M 20.2 37 L 12 41" opacity=".55" />
        <path d="M30.5 31 L 34 30" opacity=".5" />
      </g>
    </svg>
  );
}

export function BareNest({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M10 30 C 30 58, 90 58, 110 30" />
        <path d="M15 32 C 36 48, 84 48, 105 32" opacity=".6" />
        <path d="M8 30 C 30 23, 90 23, 112 30" />
        <path d="M20 35 L 30 45 M 40 38 L 46 50 M 62 39 L 60 51 M 80 38 L 74 49 M 98 34 L 90 45" opacity=".5" />
        <path d="M4 26 L 22 34 M 116 25 L 98 34 M 30 21 L 44 29 M 88 20 L 76 28" opacity=".45" />
      </g>
    </svg>
  );
}
