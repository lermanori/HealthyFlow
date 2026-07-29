// Regenerates the real-app screenshots used by public/landing.html.
//
// The landing page promises "this is the actual product, not a concept", so the
// shots must be recaptured whenever navigation or a surface changes — a stale
// sidebar on the hero image is the loudest way to look abandoned.
//
// Usage (needs the API on :3001):
//   node scripts/capture-landing-shots.mjs
//
// It signs in as a seeded demo persona over the API and then drops the demo
// markers from localStorage, so the captures show the ordinary logged-in app
// rather than the guided-tour chrome.
//
// FEATURE FLAGS ARE THE WHOLE REASON THIS SCRIPT OWNS ITS OWN SERVER.
// Vite inlines `VITE_*` at build time, so a screenshot taken against whatever
// dev server happens to be running shows *that developer's* feature set, not the
// one production ships. That is not hypothetical: the Week view and then Daily
// Signals both reached the landing page as screenshots of features no production
// user could see. So this script starts its own Vite server with every flag in
// src/featureFlags.ts explicitly blanked — process env beats .env files in Vite —
// which reproduces production's flag set, and then asserts the flagged surfaces
// really are absent before it writes anything.
//
// To deliberately shoot a flag ON (say, the week Week ships), pass it through:
//   HF_SHOT_FLAGS=VITE_WEEK_VIEW_ENABLED node scripts/capture-landing-shots.mjs

import { chromium } from '@playwright/test'
import { mkdtemp, rm, readdir, rename, readFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)

const PORT = Number(process.env.HF_SHOT_PORT ?? 5199)
const WEB = `http://localhost:${PORT}`
const API = process.env.HF_SHOT_API ?? 'http://localhost:3001/api'
const OUT = 'public/landing'

// Flags the operator explicitly wants ON for this run.
const FLAGS_ON = new Set((process.env.HF_SHOT_FLAGS ?? '').split(',').map((s) => s.trim()).filter(Boolean))

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

// Parsed from the source rather than hard-coded, so a flag added tomorrow is
// neutralised without anyone remembering to update this script.
async function featureFlagNames() {
  const src = await readFile('src/featureFlags.ts', 'utf8')
  const names = [...src.matchAll(/VITE_[A-Z0-9_]+/g)].map((m) => m[0])
  if (!names.length) throw new Error('no VITE_* flags found in src/featureFlags.ts — has it moved?')
  return [...new Set(names)]
}

// Surfaces that must not appear in a production-parity shot, keyed by the flag
// that hides them. The assertion is what stops a flagged feature reaching the
// landing page again; without it the blanking above is silent if it regresses.
const FLAGGED_SURFACES = {
  VITE_WEEK_VIEW_ENABLED: { label: 'the Week nav entry', find: (page) => page.locator('a[data-demo-id="nav-week"]') },
  VITE_DAILY_SIGNALS_ENABLED: { label: 'the Daily Signals row', find: (page) => page.getByText(/\d+ signals? ·/) },
}

async function startWebServer(flags) {
  const env = { ...process.env, VITE_API_URL: API }
  for (const flag of flags) env[flag] = FLAGS_ON.has(flag) ? 'true' : ''
  const on = flags.filter((f) => FLAGS_ON.has(f))
  console.log(`flags: ${flags.length} blanked${on.length ? `, forced on: ${on.join(', ')}` : ''}`)

  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { env, stdio: 'ignore' })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${WEB}/app/`)
      if (res.ok) return child
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  child.kill()
  throw new Error(`vite did not come up on :${PORT} within 60s`)
}

async function assertProductionParity(page, flags) {
  for (const flag of flags) {
    if (FLAGS_ON.has(flag)) continue
    const surface = FLAGGED_SURFACES[flag]
    if (!surface) {
      console.warn(`  ! ${flag} has no entry in FLAGGED_SURFACES — its surface is unverified`)
      continue
    }
    if (await surface.find(page).count()) {
      throw new Error(
        `${surface.label} is visible but ${flag} is off in production. ` +
        `Capturing it would put a feature on the landing page that no user can reach.`
      )
    }
  }
}

async function demoToken() {
  const res = await fetch(`${API}/auth/demo-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona: PERSONA }),
  })
  if (!res.ok) throw new Error(`demo-session failed: ${res.status}`)
  return (await res.json()).token
}

// The demo account is long-lived and shared, so its theme is incidental state —
// it has already drifted to 'white' once, which would put light-mode screenshots
// on a dark landing page. Pin it server-side: the pre-render snippet in
// index.html reads localStorage, but useSettings overwrites that from the API a
// moment later, so only the server value actually decides the shot.
async function pinTheme(token) {
  const theme = process.env.HF_SHOT_THEME ?? 'midnight'
  const res = await fetch(`${API}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ theme }),
  })
  if (!res.ok) throw new Error(`could not pin theme=${theme}: ${res.status}`)
  console.log(`theme: ${theme}`)
  return theme
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  // Framer Motion entrance animations: capture after they have landed, or cards
  // come out mid-fade.
  await page.waitForTimeout(1200)
}

// Module-level so the exit handlers can always reach it: --strictPort means a
// leaked Vite would make the next run fail for an unrelated reason.
let web = null
const stopWeb = () => { web?.kill(); web = null }
process.on('exit', stopWeb)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopWeb(); process.exit(1) })

async function main() {
  const flags = await featureFlagNames()
  web = await startWebServer(flags)
  const token = await demoToken()
  const theme = await pinTheme(token)
  const browser = await chromium.launch()
  const work = await mkdtemp(join(tmpdir(), 'hf-shots-'))

  const capture = async (context, shots) => {
    // addInitScript, not a one-off evaluate: the axios 401 interceptor clears the
    // token and reloads, so a single seeding would silently drop us onto the
    // login page partway through the run.
    //
    // Deliberately NOT demoPersona / mayaDemoGuide — those turn on the guided
    // overlay and the demo header, which must not appear in marketing shots.
    await context.addInitScript(({ t, theme }) => {
      localStorage.setItem('token', t)
      localStorage.removeItem('demoPersona')
      localStorage.removeItem('mayaDemoGuide')
      // Matches the server value pinned above, so index.html's pre-render snippet
      // paints the right theme immediately instead of flashing the wrong one.
      localStorage.setItem('hf-theme', theme)
    }, { t: token, theme })

    const page = await context.newPage()
    for (const shot of shots) {
      await page.goto(`${WEB}${shot.path}`)
      await settle(page)
      // A capture of the login form is worse than no capture: fail loudly.
      if (await page.getByText('Welcome to HealthyFlow').count()) {
        throw new Error(`${shot.name}: landed on the login page — session was dropped`)
      }
      await assertProductionParity(page, flags)
      const rendered = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme') === 'white' ? 'white' : 'midnight'
      )
      if (rendered !== theme) {
        throw new Error(`${shot.name}: rendered the ${rendered} theme but ${theme} was requested`)
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

main().then(stopWeb).catch((err) => {
  console.error(String(err.message ?? err))
  process.exit(1)
})
