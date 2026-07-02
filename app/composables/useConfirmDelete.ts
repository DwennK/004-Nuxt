import { LazyConfirmDeleteModal } from '#components'

export type ConfirmDeleteOptions = {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}

export function useConfirmDelete() {
  const overlay = useOverlay()

  return async (options: ConfirmDeleteOptions = {}): Promise<boolean> => {
    const modal = overlay.create(LazyConfirmDeleteModal, {
      destroyOnClose: true,
      props: options
    })

    return await modal.open() === true
  }
}
