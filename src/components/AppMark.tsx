/**
 * The HealthyFlow brand mark ("2a Core"): the day as one arc, closing around a
 * centred now-dot.
 *
 * This is the same artwork as the installed app icon in `public/icons` — the two
 * are meant to be indistinguishable, so the geometry below is a straight copy of
 * `icon-{light,dark}.svg` and any change has to be made in both places (rerun
 * `scripts/generate-icons.sh` after editing the SVG sources).
 *
 * Colours come from the `--mark-*` tokens rather than the action/accent ramp, so
 * the tile flips Ink/Paper with the theme without picking up the product's teal.
 */
interface AppMarkProps {
  /** Rendered size in px. The mark is drawn on a 512 grid and scales cleanly. */
  size?: number
  /** Drop the tile and draw the mark alone, for placement on an existing surface. */
  bare?: boolean
  className?: string
}

export default function AppMark({ size = 40, bare = false, className }: AppMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="HealthyFlow"
    >
      {!bare && <rect width="512" height="512" rx="113" ry="113" fill="rgb(var(--mark-tile))" />}
      <circle cx="256" cy="256" r="96" fill="none" stroke="rgb(var(--mark-ring))" strokeWidth="30" />
      <path
        d="M 289.9 120.1 A 140 140 0 1 1 222.1 120.2"
        fill="none"
        stroke="rgb(var(--mark-arc))"
        strokeWidth="30"
        strokeLinecap="round"
      />
      <circle cx="256" cy="256" r="42" fill="rgb(var(--mark-dot))" />
    </svg>
  )
}
