// Ambient background for the sign-in screen's brand panel: faint drifting
// strokes behind the copy. Pure SVG + CSS animation (this app doesn't depend
// on framer-motion) so it renders on the server with zero client JS, and
// degrades to static faint lines under prefers-reduced-motion (see
// app/globals.css's "Motion utilities" section).
const PATH_COUNT = 16;

function buildPaths(position: 1 | -1) {
  return Array.from({ length: PATH_COUNT }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${
      189 + i * 6
    } -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${
      343 - i * 6
    }C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${
      875 - i * 6
    } ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    opacity: 0.1 + i * 0.03,
  }));
}

export function FloatingPaths({ position }: { position: 1 | -1 }) {
  const paths = buildPaths(position);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full text-slash-paper" viewBox="0 0 696 316" fill="none">
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            className="floating-path"
            style={{ animationDelay: `${path.id * 220}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}
