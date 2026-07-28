// Regenerates the real-app screenshots used by public/landing.html.
//
// The landing page promises "this is the actual product, not a concept", so the
// shots must be recaptured whenever navigation or a surface changes — a stale
// sidebar on the hero image is the loudest way to look abandoned.
//
// Usage (needs the dev server on :5173 and the API on :3001):
//   node scripts/capture-landing-shots.mjs
//
// It signs in as a seeded demo persona over the API and then drops the demo
// markers from localStorage, so the captures show the ordinary logged-in app
// rather than the guided-tour chrome.

import { chromium } from '@playwright/test'
import { mkdtemp, rm, readdir, rename } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)

const WEB = process.env.HF_SHOT_WEB ?? 'http://localhost:5173'
const API = process.env.HF_SHOT_API ?? 'http://localhost:3001/api'
const OUT = 'public/landing'

// Lina is the health-tracker persona: her seeded day is the only one that fills
// Nutrition, Workouts and Progress, which is what the Health section sells.
const PERSONA = 'lina'

// Deep links, not just the bare routes: several surfaces default to an empty
// state (a blank Workout session, the Health overview) that says nothing about
// the product. These land on the populated view a real user would be looking at.
const DESKTOP = [
  { name: 'today-desktop', path: '/app/' },
  { name: 'health-desktop', path: '/app/calories' },
  { name: 'workouts-desktop', path: '/app/workouts?mode=history' },
  {
    name: 'talk-desktop',
    path: '/app/talk',
    // Typed, deliberately not sent. Sending would spend AI credits and make the
    // shot depend on a live model response, so the capture stays deterministic
    // and free while still showing a real brain-dump in a real composer.
    prepare: async (page) => {
      await page.getByPlaceholder('Add anything...').fill(
        "gym at 6, chicken and rice for lunch, call the dentist sometime today, and I want to start stretching every evening"
      )
    },
  },
]

async function demoToken() {
  const res = await fetch(`${API}/auth/demo-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona: PERSONA }),
  })
  if (!res.ok) throw new Error(`demo-session failed: ${res.status}`)
  return (await res.json()).token
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  // Framer Motion entrance animations: capture after they have landed, or cards
  // come out mid-fade.
  await page.waitForTimeout(1200)
}

async function main() {
  const token = await demoToken()
  const browser = await chromium.launch()
  const work = await mkdtemp(join(tmpdir(), 'hf-shots-'))

  const capture = async (context, shots) => {
    // addInitScript, not a one-off evaluate: the axios 401 interceptor clears the
    // token and reloads, so a single seeding would silently drop us onto the
    // login page partway through the run.
    //
    // Deliberately NOT demoPersona / mayaDemoGuide — those turn on the guided
    // overlay and the demo header, which must not appear in marketing shots.
    await context.addInitScript((t) => {
      localStorage.setItem('token', t)
      localStorage.removeItem('demoPersona')
      localStorage.removeItem('mayaDemoGuide')
    }, token)

    const page = await context.newPage()
    for (const shot of shots) {
      await page.goto(`${WEB}${shot.path}`)
      await settle(page)
      // A capture of the login form is worse than no capture: fail loudly.
      if (await page.getByText('Welcome to HealthyFlow').count()) {
        throw new Error(`${shot.name}: landed on the login page — session was dropped`)
      }
      if (shot.prepare) {
        await shot.prepare(page)
        await page.waitForTimeout(300)
      }
      await page.screenshot({ path: join(work, `${shot.name}.png`) })
      console.log(`captured ${shot.name}`)
    }
    await page.close()
  }

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  })
  await capture(desktop, DESKTOP)

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  })
  await capture(mobile, [{ name: 'today-mobile', path: '/app/' }])

  await browser.close()

  // The landing serves WebP with a JPG fallback, at three widths for the
  // desktop shots (the srcset in landing.html expects exactly these names).
  for (const file of await readdir(work)) {
    const name = file.replace(/\.png$/, '')
    const png = join(work, file)
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', join(work, `${name}.jpg`)])
    await rename(join(work, `${name}.jpg`), join(OUT, `${name}.jpg`))
    await run('cwebp', ['-q', '82', png, '-o', join(OUT, `${name}.webp`)])
    if (name.endsWith('-desktop')) {
      for (const width of [800, 1400]) {
        await run('cwebp', ['-q', '80', '-resize', String(width), '0', png, '-o', join(OUT, `${name}-${width}.webp`)])
      }
    }
    console.log(`wrote ${name}`)
  }

  await rm(work, { recursive: true, force: true })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
