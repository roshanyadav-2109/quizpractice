'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ReportKind } from '@/types/db'
import { Flag, X } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { SignInLink } from '@/components/site/AuthDialog'

const KINDS: { value: ReportKind; label: string }[] = [
  { value: 'correction', label: 'The question text is wrong' },
  { value: 'wrong_answer', label: 'The marked answer is wrong' },
  { value: 'broken_format', label: 'Something renders incorrectly' },
  { value: 'other', label: 'Something else' },
]

/**
 * "Report", with somewhere for the report to go: the admin moderation queue.
 * The form opens in a dialog rather than unfolding in place, because in the
 * runner the button lives in the pinned action bar where there is no room.
 */
export function ReportButton({
  questionId,
  isSignedIn,
}: {
  questionId: string
  isSignedIn: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [kind, setKind] = useState<ReportKind>('correction')
  const [description, setDescription] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  function open() {
    setState('idle')
    dialog.current?.showModal()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!description.trim()) return

    setState('sending')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('reports').insert({
      question_id: questionId,
      user_id: user?.id ?? null,
      kind,
      description: description.trim(),
    })

    if (error) {
      setState('error')
      return
    }
    setState('sent')
    setDescription('')
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Report a problem with this question"
        className={buttonClass('outline', 'md', 'max-sm:w-10 max-sm:!px-0')}
      >
        <Flag size={16} aria-hidden="true" />
        {/* The word on anything wider than a phone; the flag alone on one. */}
        <span className="hidden sm:inline">Report</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`report-title-${questionId}`}
        className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-card border border-rule bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
          <h2 id={`report-title-${questionId}`} className="text-card font-medium">
            Report a problem
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          {!isSignedIn ? (
            <p className="text-ui text-ink-muted">
              <SignInLink />{' '}
              to report a problem with this question.
            </p>
          ) : state === 'sent' ? (
            <p className="text-ui text-correct">Thanks — it is in the moderation queue.</p>
          ) : (
            <form onSubmit={submit}>
              <fieldset>
                <legend className="text-meta text-ink-muted">What is wrong?</legend>
                <div className="mt-2 flex flex-col gap-1">
                  {KINDS.map((option) => (
                    <label
                      key={option.value}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 text-ui text-ink hover:bg-surface-2"
                    >
                      <input
                        type="radio"
                        name={`report-kind-${questionId}`}
                        checked={kind === option.value}
                        onChange={() => setKind(option.value)}
                        className="h-[1.125rem] w-[1.125rem] accent-ink"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="mt-4 block">
                <span className="text-meta text-ink-muted">Details</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  required
                  placeholder="What did you spot?"
                  className="mt-2 w-full rounded-control border border-rule-strong bg-surface px-3 py-2.5 text-ui text-ink outline-none focus:border-ink"
                />
              </label>

              <div className="mt-4 flex items-center justify-end gap-2">
                {state === 'error' ? (
                  <span className="mr-auto text-meta text-incorrect">Could not send — try again.</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => dialog.current?.close()}
                  className={buttonClass('outline', 'md')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={state === 'sending' || !description.trim()}
                  className={buttonClass('primary', 'md')}
                >
                  {state === 'sending' ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  )
}
