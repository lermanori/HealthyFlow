import { RefObject, useEffect, useRef } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalFocusOptions {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement>
  initialFocusRef?: RefObject<HTMLElement>
  pending?: boolean
}

export function useModalFocus({ open, onClose, containerRef, initialFocusRef, pending = false }: ModalFocusOptions) {
  const openerRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  const pendingRef = useRef(pending)
  closeRef.current = onClose
  pendingRef.current = pending

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => (initialFocusRef?.current ?? containerRef.current)?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!pendingRef.current) closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !containerRef.current) return
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) {
        event.preventDefault()
        containerRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !containerRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !containerRef.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      if (root) root.inert = wasInert
      window.requestAnimationFrame(() => openerRef.current?.focus())
    }
  }, [containerRef, initialFocusRef, open])
}
