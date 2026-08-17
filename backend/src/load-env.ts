import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import dotenv from 'dotenv'
import path from 'path'

const repoRoot = path.join(__dirname, '../..')

/**
 * The main working tree for this repository, or null if it cannot be resolved.
 *
 * A git worktree's `.git` is a *file* pointing into the main repository, so
 * `--git-common-dir` resolves to the main checkout's `.git` and its parent is
 * the main working tree. That is what lets a worktree find configuration it was
 * never given.
 */
function mainCheckout(): string | null {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return path.dirname(path.resolve(repoRoot, commonDir))
  } catch {
    // Not a git checkout, or git is unavailable. Neither is an error here —
    // this is a convenience lookup, not a requirement.
    return null
  }
}

/**
 * Every `.env` this process should consider, in precedence order.
 *
 * `.env` is gitignored, so a fresh worktree never receives one. Without the
 * fallback below the backend starts fine and then fails on its first Supabase
 * call with an opaque `TypeError: fetch failed`, because the client was built
 * from undefined credentials. Falling back to the main checkout means a new
 * worktree inherits the environment already configured there, with no
 * per-worktree setup step to remember.
 *
 * dotenv never overwrites a variable that is already set, so the first file to
 * define a name wins.
 */
export function envFiles(): string[] {
  const candidates = [
    process.env.HEALTHYFLOW_ENV_FILE,
    path.join(repoRoot, 'backend/.env'),
    path.join(repoRoot, '.env'),
  ]

  const main = mainCheckout()
  if (main && path.resolve(main) !== path.resolve(repoRoot)) {
    candidates.push(path.join(main, 'backend/.env'), path.join(main, '.env'))
  }

  return candidates.filter((file): file is string => typeof file === 'string' && existsSync(file))
}

let loaded = false

/**
 * Loads configuration. Idempotent, because scripts and tests import modules
 * that need configuration without going through the server entrypoint.
 */
export function loadEnv(): void {
  if (loaded) return
  loaded = true
  for (const file of envFiles()) {
    dotenv.config({ path: file })
  }
}

loadEnv()
