import { watch, type Ref } from 'vue'

/** Preserve the opener even when a panel has no DialogTrigger of its own. */
export function usePosFocusReturn(open: Ref<boolean>, fallback?: () => HTMLElement | null | undefined) {
  let opener: HTMLElement | null = null

  watch(open, (value) => {
    if (value && typeof document !== 'undefined') {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const menu = opener?.closest('[role="menu"], [role="listbox"]')
      if (menu?.id) {
        opener = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) || opener
      }
    }
  }, { flush: 'sync' })

  function onCloseAutoFocus(event: Event) {
    if (open.value) return
    const target = opener?.isConnected && opener !== document.body ? opener : fallback?.()
    if (!(target instanceof HTMLElement) || !target.isConnected) return
    event.preventDefault()
    // Wait for the departing panel's focus trap and aria-hidden cleanup.
    requestAnimationFrame(() => {
      if (open.value || !target.isConnected || target.closest('[inert], [disabled], [aria-hidden="true"]')) return
      target.focus({ preventScroll: true })
    })
  }

  return { onCloseAutoFocus }
}
