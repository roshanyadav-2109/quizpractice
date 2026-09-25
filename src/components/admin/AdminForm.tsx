'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { ActionState } from '@/app/admin/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

/**
 * Wraps a server action with pending state and inline errors, so every admin
 * form behaves the same way and none of them silently fail.
 */
export function AdminForm({
  action,
  submitLabel,
  successMessage = 'Saved.',
  children,
}: {
  action: Action
  submitLabel: string
  successMessage?: string
  children: React.ReactNode
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {})

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      {children}

      <div className="flex items-center gap-2.5 pt-0.5">
        <SubmitButton label={submitLabel} />
        {state.ok ? <span className="text-[0.78125rem] text-correct">{successMessage}</span> : null}
        {state.error ? <span className="text-[0.78125rem] text-incorrect">{state.error}</span> : null}
      </div>
    </form>
  )
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center rounded-[3px] bg-accent px-3 text-[0.8125rem] text-accent-ink hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? 'Saving…' : label}
    </button>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string | number
  placeholder?: string
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-8 rounded-[3px] border border-rule bg-surface px-2.5 text-[0.8125rem] text-ink outline-none focus:border-accent"
      />
      {hint ? <span className="text-[0.71875rem] text-ink-faint">{hint}</span> : null}
    </label>
  )
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
}: {
  label: string
  name: string
  options: { value: string; label: string }[]
  defaultValue?: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="h-8 rounded-[3px] border border-rule bg-surface px-2.5 text-[0.8125rem] text-ink outline-none focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string
  name: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  )
}
