'use client'

import { useRef, type ReactNode } from 'react'
import { X } from '@/components/ui/icons'

/**
 * A figure that opens full screen when tapped. Papers' own lines and figures
 * are often wider than a phone, so the page shows them a little smaller and
 * this shows them at full size, scrolling both ways.
 */
export function ZoomableFigure({ label, children, zoomed }: { label: string; children: ReactNode; zoomed: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = () => dialog.current?.close()

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Enlarge figure: ${label}`}
        className="block w-full cursor-zoom-in text-left"
      >
        {children}
      </button>

      <dialog
        ref={dialog}
        aria-label={label}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-ink/80"
      >
        <div className="flex h-full flex-col">
          <div className="flex justify-end p-2">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-control bg-surface text-ink hover:bg-surface-2"
            >
              <X size={20} />
            </button>
          </div>
          {/* A tap beside the figure closes it, as on the backdrop. */}
          <div
            className="min-h-0 flex-1 overflow-auto px-2 pb-4"
            onClick={(event) => event.target === event.currentTarget && close()}
          >
            <div className="mx-auto w-max rounded-control bg-white p-3">{zoomed}</div>
          </div>
        </div>
      </dialog>
    </>
  )
}
