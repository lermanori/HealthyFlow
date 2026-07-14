// Ambient declarations for non-standard browser globals the app feature-detects.
// Keeps `navigator.standalone` / `window.MSStream` typed instead of `as any`.

interface Navigator {
  // iOS Safari: true when the PWA is launched from the home screen.
  standalone?: boolean
}

interface Window {
  // Legacy IE/Edge marker used only to exclude those browsers from iOS checks.
  MSStream?: unknown
}
