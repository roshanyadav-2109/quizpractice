'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-accent px-3 py-2 text-sm text-accent-ink hover:bg-accent-hover"
    >
      Print or save as PDF
    </button>
  )
}
