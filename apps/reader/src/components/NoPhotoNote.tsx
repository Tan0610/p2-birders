/**
 * Sightings filed without a photograph get a pencilled margin note instead of
 * an empty mount: a quick sketch of a bird on a twig and a line of handwriting.
 */
export function NoPhotoNote({ className = '' }: { className?: string }) {
  return (
    <p className={`no-photo ${className}`.trim()}>
      <svg viewBox="0 0 64 40" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 24.5 C 16 16, 27 12.5, 35 15.5 C 40 17.5, 42 22, 39.5 26 C 35.5 31.5, 22 32.5, 14.5 24.5" />
          <path d="M34 15.8 C 32.8 10.5, 39.5 7.6, 42.2 11.6 C 43.6 14, 41.4 17.2, 38.2 17" />
          <path d="M42.6 11.7 L 47.4 12.4 L 42.4 14.1" />
          <path d="M14.8 24 L 5.5 19.6 M 14.6 25.4 L 4.6 25.2 M 5.5 19.6 C 4.6 21.4, 4.4 23.4, 4.6 25.2" />
          <path d="M20.5 21.2 C 25 18.8, 30.5 19.6, 33.6 23.4" />
          <path d="M26.2 30.6 L 25.2 34.4 M 30.4 30.4 L 30.2 34.4" />
          <path d="M13 35 C 26 33.4, 43 36, 60 33.2 M 49 34.6 C 50.5 32.6, 52 31.4, 54.6 30.4" />
        </g>
        <circle cx="39.6" cy="12.6" r="0.9" fill="currentColor" />
      </svg>
      <span>no photo, just a note</span>
    </p>
  );
}
