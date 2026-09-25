'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CaretDown } from '@/components/ui/icons'

export interface FilterOption {
  value: string
  label: string
}

/**
 * A filter as a dropdown: a grey box showing the current choice, a native
 * select underneath so it is keyboard- and screen-reader-proper and opens the
 * phone's own picker. Changing it rewrites one query parameter and clears the
 * page number, so the URL is always the filter state.
 */
export function FilterSelect({
  name,
  label,
  allLabel,
  options,
  value,
  resets = [],
}: {
  /** The query parameter this select controls. */
  name: string
  /** What it filters, for assistive tech. */
  label: string
  /** The "no filter" choice, e.g. "All exams". */
  allLabel: string
  options: FilterOption[]
  value: string | null
  /** Other parameters that stop making sense when this one changes. */
  resets?: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function change(next: string) {
    const query = new URLSearchParams(params.toString())
    if (next) query.set(name, next)
    else query.delete(name)
    query.delete('page')
    for (const key of resets) query.delete(key)
    const suffix = query.toString()
    router.push(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false })
  }

  const active = value !== null && options.some((option) => option.value === value)

  return (
    <SelectBox
      label={label}
      allLabel={allLabel}
      options={options}
      value={active ? value! : ''}
      onChange={change}
    />
  )
}

/**
 * The same dropdown for state that lives in the page rather than the URL.
 * `allLabel` is optional: without it, one of the options is always chosen.
 */
export function SelectBox({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string
  allLabel?: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
}) {
  // A choice made is shown as a filter in force: outlined in ink, not greyed.
  const active = allLabel ? value !== '' : false
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-11 min-w-[9.375rem] cursor-pointer appearance-none rounded-control border py-0 pr-10 pl-4 text-ui transition-colors outline-none focus-visible:border-ink ${
          active
            ? 'border-ink bg-surface text-ink'
            : 'border-transparent bg-surface-2 text-ink hover:bg-surface-3'
        }`}
      >
        {allLabel ? <option value="">{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <CaretDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-muted"
      />
    </label>
  )
}

/** The row the dropdowns sit in. */
export function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center gap-2">{children}</div>
}
