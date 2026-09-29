'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SignInLink } from '@/components/site/AuthDialog'

/**
 * Shown in place of the answer key when the site does not have one yet.
 * Collects what the student thinks is correct instead of leaving the space
 * empty. A daily job (`/api/answers/consensus`) looks at what enough
 * students agree on and fills the key in from that — see the migration for
 * why no one, students included, can read another student's suggestion
 * first: that would just make everyone copy the first guess.
 */
export function SuggestAnswer(
  props:
    | { kind: 'numerical'; questionId: string; isSignedIn: boolean }
    | { kind: 'choice'; questionId: string; isSignedIn: boolean; multiple: boolean; options: { id: string; label: string }[] },
) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [value, setValue] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  if (!props.isSignedIn) {
    return (
      <p className="mt-2 text-meta text-ink-muted">
        <SignInLink /> to suggest an answer — enough students agreeing fills the key in.
      </p>
    )
  }

  if (state === 'sent') {
    return <p className="mt-2 text-meta text-correct">Thanks — noted. It fills in once enough students agree.</p>
  }

  function toggle(optionId: string) {
    if (props.kind !== 'choice') return
    setPicked((current) => {
      const next = new Set(props.multiple ? current : [])
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      return next
    })
  }

  async function submit() {
    setState('sending')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setState('error')
      return
    }

    const row: { question_id: string; user_id: string; value: string | null; option_ids: string[] | null } =
      props.kind === 'numerical'
        ? { question_id: props.questionId, user_id: user.id, value: value.trim(), option_ids: null }
        : { question_id: props.questionId, user_id: user.id, value: null, option_ids: [...picked] }

    const { error } = await supabase.from('answer_suggestions').upsert(row, { onConflict: 'question_id,user_id' })
    if (error) {
      setState('error')
      return
    }
    setState('sent')
  }

  const canSubmit = props.kind === 'numerical' ? value.trim().length > 0 : picked.size > 0

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-meta text-ink-muted">What do you think it is? Suggest one — enough matching answers fills the key in.</p>
      {props.kind === 'numerical' ? (
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Your answer"
          className="h-10 w-full max-w-[12rem] rounded-control border border-rule-strong bg-surface px-3 text-ui text-ink tabular-nums outline-none focus:border-ink"
        />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {props.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              aria-pressed={picked.has(option.id)}
              className={`h-8 min-w-8 rounded-control border px-2.5 text-meta font-medium tabular-nums ${
                picked.has(option.id) ? 'border-accent bg-accent-soft text-accent' : 'border-rule-strong bg-surface text-ink-muted hover:bg-surface-2'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || state === 'sending'}
          className="h-8 w-fit rounded-control bg-ink px-3 text-meta font-medium text-white disabled:opacity-50"
        >
          {state === 'sending' ? 'Sending…' : 'Suggest'}
        </button>
        {state === 'error' ? <span className="text-meta text-incorrect">Could not send — try again.</span> : null}
      </div>
    </div>
  )
}
