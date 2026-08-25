import { useEffect, useState } from 'react'
import { heldDayRecovery, readLocalDayIdentity } from '../lib/local/store'

type Recovery = ReturnType<typeof heldDayRecovery>

/**
 * What this device is holding, for the screens that have to say so.
 *
 * A day belonging to an account and a day belonging to a Guest are not alike:
 * one is reachable by signing in, the other has no key but its own session. Two
 * screens have to tell them apart — the login screen, which otherwise offers to
 * start a guest session on top of someone's account, and the stranded-day screen,
 * which otherwise offers permanent erasure as the only way out.
 */
export function useHeldDay(): Recovery {
  const [recovery, setRecovery] = useState<Recovery>({ kind: 'none' })

  useEffect(() => {
    let cancelled = false
    void readLocalDayIdentity()
      .then((identity) => { if (!cancelled) setRecovery(heldDayRecovery(identity)) })
      // A document that cannot be read is not an identity to guess at. Saying
      // nothing is right here: the screens fall back to their plain form.
      .catch((error) => console.error('[local] could not read who this day belongs to:', error))
    return () => { cancelled = true }
  }, [])

  return recovery
}
