import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CompleteWorkReviewInput,
  FocusBlockTransitionInput,
  dailySignalsQueryKey,
  daySummaryQueryKey,
  workService,
} from '../services/api'

type TransitionAction = FocusBlockTransitionInput['action']

/**
 * Executing Focus blocks from Today.
 *
 * Reads deliberately live in the day summary — Today renders the same record
 * Work does, and keeps no copy of it. This hook only owns the writes, and each
 * one ends by re-reading rather than by patching a local mirror.
 *
 * `useWorkProject` cannot serve this: it is scoped to one Project, and a day
 * spans all of them.
 */
export function useTodayFocusBlocks(dateKey: string) {
  const queryClient = useQueryClient()

  // The `['work']` prefix is what makes Work show the same final state the
  // moment you navigate back to it.
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: daySummaryQueryKey(dateKey) }),
      queryClient.invalidateQueries({ queryKey: dailySignalsQueryKey(dateKey) }),
      queryClient.invalidateQueries({ queryKey: ['tasks', dateKey] }),
      queryClient.invalidateQueries({ queryKey: ['work'] }),
    ])
  }

  const surface = (error: unknown, fallback: string) => {
    const responseError = error as { response?: { data?: { error?: string } } }
    toast.error(responseError.response?.data?.error ?? fallback)
  }

  /**
   * Never optimistic. `startedAt` is the server's, and it is the value the timer
   * renders from and that has to survive a reload — a client-clock placeholder
   * would be wrong for as long as it was shown.
   */
  const transition = useMutation({
    mutationFn: ({ focusBlockId, action }: { focusBlockId: string; action: TransitionAction }) =>
      workService.transitionFocusBlock(focusBlockId, { action }),
    onSuccess: refresh,
    // A 409 means the block moved elsewhere (another tab, another device).
    // Re-read rather than guess.
    onError: (error) => {
      surface(error, 'Could not update the Focus block')
      return refresh()
    },
  })

  /**
   * Never optimistic either: this is one Postgres transaction committing the
   * block, the review, the Work session and any chosen Task or Project updates
   * together. Its result can change Items on this very day.
   */
  const completeReview = useMutation({
    mutationFn: ({ focusBlockId, ...input }: CompleteWorkReviewInput & { focusBlockId: string }) =>
      workService.completeReview(focusBlockId, input),
    onSuccess: refresh,
    onError: (error) => surface(error, 'Could not complete the Work review'),
  })

  /** Only ever offered for a block that never became work — the server enforces it. */
  const remove = useMutation({
    mutationFn: (focusBlockId: string) => workService.removeFocusBlock(focusBlockId),
    onSuccess: refresh,
    onError: (error) => surface(error, 'Could not delete the Focus block'),
  })

  return {
    transition,
    completeReview,
    remove,
    isBusy: transition.isPending || completeReview.isPending || remove.isPending,
  }
}

export type UseTodayFocusBlocks = ReturnType<typeof useTodayFocusBlocks>
