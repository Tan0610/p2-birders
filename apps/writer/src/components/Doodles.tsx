/* Hand-drawn marks for the notebook. Strokes are deliberately a little uneven. */

export function RobinDoodle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 90" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* cocked tail, the Indian Robin's giveaway */}
        <path d="M30 52 C 22 40, 17 28, 20 14 C 25 22, 30 30, 36 40" />
        <path d="M24 20 C 27 27, 30 34, 34 42" opacity=".55" />
        {/* body */}
        <path d="M34 44 C 42 36, 60 33, 74 38 C 84 41, 90 47, 88 55 C 85 64, 70 69, 55 67 C 43 65, 35 58, 34 50" />
        {/* chestnut vent patch */}
        <path d="M44 62 C 48 64, 53 65, 57 64" strokeWidth="3.4" className="doodle-accent" />
        {/* head */}
        <path d="M74 38 C 76 30, 84 25, 92 28 C 99 30, 101 37, 97 42 C 94 45, 90 46, 88 47" />
        {/* beak */}
        <path d="M99 33 L 108 34 L 99 37" />
        <circle cx="91" cy="33" r="1.6" fill="currentColor" stroke="none" />
        {/* wing */}
        <path d="M50 44 C 58 42, 67 44, 72 50 C 64 52, 56 51, 50 47" />
        <path d="M52 49 C 57 55, 62 57, 68 56" opacity=".5" />
        {/* legs and rock */}
        <path d="M58 67 L 56 77 M 66 67 L 67 77" />
        <path d="M42 80 C 52 76, 72 76, 86 80 C 78 84, 52 85, 42 80 Z" opacity=".6" />
      </g>
    </svg>
  );
}

export function Squiggle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path
        d="M2 8 C 22 2, 38 12, 58 7 S 96 3, 118 8 S 160 12, 182 6 S 226 3, 248 8 S 282 11, 298 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Binoculars({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 44" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="16" cy="30" r="11" />
        <circle cx="48" cy="30" r="11" />
        <path d="M9 22 L 13 6 L 25 6 L 26 20 M 55 22 L 51 6 L 39 6 L 38 20" />
        <path d="M26 18 C 30 15, 34 15, 38 18" />
        <path d="M11 30 C 12 26, 15 24, 18 24" opacity=".5" />
      </g>
    </svg>
  );
}

export function EmptyNest({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 60" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10 26 C 30 52, 90 52, 110 26" />
        <path d="M14 28 C 36 44, 84 44, 106 28" opacity=".6" />
        <path d="M8 26 C 30 20, 90 20, 112 26" />
        <path d="M20 31 L 30 40 M 40 34 L 46 45 M 62 35 L 60 46 M 80 34 L 74 44 M 98 30 L 90 40" opacity=".5" />
        <path d="M4 22 L 22 30 M 116 21 L 98 30 M 30 18 L 44 26" opacity=".45" />
      </g>
    </svg>
  );
}
