'use client'

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SignInLink, useSignIn } from '@/components/site/AuthDialog'
import { X } from '@/components/ui/icons'
import type { DiscussionRow } from '@/types/db'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * How many comments a question has, replies included, without loading them —
 * enough for the Discussion tab to say whether there is anything to open.
 */
export async function countDiscussion(questionId: string): Promise<number | null> {
  const { count, error } = await createClient()
    .from('discussions')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
    .eq('is_deleted', false)
  return error ? null : (count ?? 0)
}

const SELECT = '*, profiles(display_name, avatar_url)'

/**
 * One question's discussion, laid out the way Instagram lays out comments:
 * each comment a bubble with the name over the text, and under it the time,
 * Reply, and — on a comment that has them — "View 2 replies". Threads start
 * folded.
 *
 * Any comment can be answered, a reply included. Replies sit one indent in,
 * under the comment that started the thread, and a reply to a reply opens
 * with the @name it answers. There is one box to write in, at the bottom;
 * Reply points it at a comment rather than opening a second box.
 *
 * The thread loads when the panel shows it rather than with the paper, since
 * most questions' threads are never opened. Give it `key={questionId}` so a
 * new question starts from a clean slate.
 */
export function DiscussionThread({
  questionId,
  isSignedIn,
  onCount,
}: {
  questionId: string
  isSignedIn: boolean
  /** Told the number of comments once loaded, and again after posting. */
  onCount?: (count: number) => void
}) {
  const [comments, setComments] = useState<DiscussionRow[] | null>(null)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The @name being typed, if any: what follows the @, and where the @ is.
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [me, setMe] = useState<string | null>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const { openSignIn } = useSignIn()

  const reportCount = useEffectEvent((count: number) => onCount?.(count))

  // Who is signed in, so they are not offered themselves to tag. Read from the
  // local session; no request.
  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setMe(data.session?.user.id ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('discussions')
      .select(SELECT)
      .eq('question_id', questionId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        const rows = (data ?? []) as DiscussionRow[]
        if (loadError) setError('Could not load the discussion.')
        setComments(rows)
        reportCount(rows.length)
      })
    return () => {
      cancelled = true
    }
  }, [questionId])

  // Threads: each top-level comment with every reply beneath it, however deep
  // the reply chain goes.
  const { roots, repliesByRoot, rootOf, byId } = useMemo(() => {
    const byId = new Map((comments ?? []).map((comment) => [comment.id, comment]))
    const rootOf = (comment: DiscussionRow): DiscussionRow => {
      let current = comment
      const seen = new Set<string>()
      while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.id)) {
        seen.add(current.id)
        current = byId.get(current.parent_id)!
      }
      return current
    }
    const roots: DiscussionRow[] = []
    const repliesByRoot = new Map<string, DiscussionRow[]>()
    for (const comment of comments ?? []) {
      const root = rootOf(comment)
      if (root.id === comment.id) {
        roots.push(comment)
      } else {
        const list = repliesByRoot.get(root.id) ?? []
        list.push(comment)
        repliesByRoot.set(root.id, list)
      }
    }
    return { roots, repliesByRoot, rootOf, byId }
  }, [comments])

  // Everyone who has written in this question's discussion, and only them:
  // those are the people an @ can reach here.
  const people = useMemo(() => {
    const byUser = new Map<string, string>()
    for (const comment of comments ?? []) {
      const name = comment.profiles?.display_name
      if (comment.user_id && name && !byUser.has(comment.user_id)) byUser.set(comment.user_id, name)
    }
    return [...byUser].map(([id, name]) => ({ id, name }))
  }, [comments])

  const names = people.map((person) => person.name)
  const taggable = people.filter((person) => person.id !== me)
  // Names that start with what was typed come first, then those containing it.
  const query = mention?.query.toLowerCase() ?? ''
  const options = mention
    ? taggable
        .filter((person) => person.name.toLowerCase().includes(query))
        .sort(
          (a, b) =>
            Number(!a.name.toLowerCase().startsWith(query)) - Number(!b.name.toLowerCase().startsWith(query)),
        )
        .slice(0, 6)
    : []
  const listOpen = options.length > 0
  const active = listOpen ? Math.min(highlight, options.length - 1) : 0

  // Finds an @ being typed just before the caret.
  function readMention(value: string, caret: number) {
    const match = /(?:^|\s)@([^\s@]{0,40})$/.exec(value.slice(0, caret))
    setMention(match ? { query: match[1], start: caret - match[1].length - 1, end: caret } : null)
    setHighlight(0)
  }

  function pick(name: string) {
    if (!mention) return
    const inserted = `@${name} `
    const next = draft.slice(0, mention.start) + inserted + draft.slice(mention.end)
    const caret = mention.start + inserted.length
    setDraft(next)
    setMention(null)
    requestAnimationFrame(() => {
      composer.current?.focus()
      composer.current?.setSelectionRange(caret, caret)
    })
  }

  function openThread(rootId: string) {
    setExpanded((current) => (current.has(rootId) ? current : new Set(current).add(rootId)))
  }

  function toggleThread(rootId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(rootId)) next.delete(rootId)
      else next.add(rootId)
      return next
    })
  }

  function startReply(comment: DiscussionRow) {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    openThread(rootOf(comment).id)
    setReplyTo(comment.id)
    setError(null)
    composer.current?.focus()
  }

  async function post(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    setPosting(true)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Your session expired. Sign in again to post.')
      setPosting(false)
      return
    }

    const parentId = replyTo && byId.has(replyTo) ? replyTo : null
    const { data, error: postError } = await supabase
      .from('discussions')
      .insert({ question_id: questionId, user_id: user.id, parent_id: parentId, body: text })
      .select(SELECT)
      .single()

    setPosting(false)
    if (postError) {
      setError(parentId ? 'Could not post your reply.' : 'Could not post your comment.')
      return
    }
    const posted = data as DiscussionRow
    const next = [...(comments ?? []), posted]
    setComments(next)
    onCount?.(next.length)
    setDraft('')
    setReplyTo(null)
    setMention(null)
    // A new reply shows in its thread, opened.
    if (parentId) openThread(rootOf(byId.get(parentId)!).id)
  }

  const replyTarget = replyTo ? (byId.get(replyTo) ?? null) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {comments === null ? <p className="text-ui text-ink-muted">Loading…</p> : null}

        {comments && comments.length === 0 ? (
          <EmptyState framed={false} size="sm" art="no-discussion" title="No comments yet">
            Be the first to explain your approach.
          </EmptyState>
        ) : null}

        {roots.length > 0 ? (
          <ul className="flex flex-col gap-5">
            {roots.map((root) => {
              const replies = repliesByRoot.get(root.id) ?? []
              const open = expanded.has(root.id)
              return (
                <li key={root.id}>
                  <Comment comment={root} names={names} active={replyTo === root.id} onReply={() => startReply(root)}>
                    {replies.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleThread(root.id)}
                        aria-expanded={open}
                        className="flex items-center gap-2 hover:text-ink"
                      >
                        <span aria-hidden className="h-px w-5 bg-rule-strong" />
                        {open ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                      </button>
                    ) : null}
                  </Comment>

                  {open && replies.length > 0 ? (
                    <ul className="mt-3 ml-6 flex flex-col gap-4">
                      {replies.map((reply) => {
                        const parent = reply.parent_id ? byId.get(reply.parent_id) : undefined
                        return (
                          <li key={reply.id}>
                            <Comment
                              comment={reply}
                              mention={parent && parent.id !== root.id ? nameOf(parent) : null}
                              names={names}
                              active={replyTo === reply.id}
                              onReply={() => startReply(reply)}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-rule px-5 py-4">
        {isSignedIn ? (
          <form onSubmit={post}>
            {replyTarget ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-control bg-surface-2 py-1.5 pr-1.5 pl-3 text-meta text-ink-muted">
                <span className="min-w-0 truncate">
                  Replying to <span className="text-ink">{nameOf(replyTarget)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel the reply"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control hover:bg-surface-3 hover:text-ink"
                >
                  <X size={14} />
                </button>
              </div>
            ) : null}
            <label className="sr-only" htmlFor={`comment-${questionId}`}>
              {replyTarget ? `Reply to ${nameOf(replyTarget)}` : 'Add a comment'}
            </label>
            <div className="relative">
              {/* Typing @ offers the people in this discussion. */}
              {listOpen ? (
                <ul
                  id={listId}
                  role="listbox"
                  aria-label="People in this discussion"
                  className="absolute inset-x-0 bottom-full z-10 mb-1.5 max-h-56 overflow-y-auto rounded-control border border-rule bg-surface py-1"
                >
                  {options.map((person, index) => (
                    <li
                      key={person.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      // mousedown, not click: the box keeps its focus and caret.
                      onMouseDown={(event) => {
                        event.preventDefault()
                        pick(person.name)
                      }}
                      onMouseEnter={() => setHighlight(index)}
                      className={`cursor-pointer px-3 py-2 text-ui text-ink ${index === active ? 'bg-surface-2' : ''}`}
                    >
                      {person.name}
                    </li>
                  ))}
                </ul>
              ) : null}

              <textarea
                ref={composer}
                id={`comment-${questionId}`}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  readMention(event.target.value, event.target.selectionStart)
                }}
                onSelect={(event) => {
                  const target = event.currentTarget
                  if (target.selectionStart === target.selectionEnd) readMention(target.value, target.selectionStart)
                }}
                onBlur={() => setMention(null)}
                onKeyDown={(event) => {
                  if (listOpen) {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      const step = event.key === 'ArrowDown' ? 1 : -1
                      setHighlight((active + step + options.length) % options.length)
                      return
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                      event.preventDefault()
                      pick(options[active].name)
                      return
                    }
                    if (event.key === 'Escape') {
                      // Closes the list only — not the reply, not the panel.
                      event.stopPropagation()
                      setMention(null)
                      return
                    }
                  }
                  // Escape drops the reply, not the whole panel.
                  if (event.key === 'Escape' && replyTo) {
                    event.stopPropagation()
                    setReplyTo(null)
                  }
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={listOpen}
                aria-controls={listOpen ? listId : undefined}
                aria-activedescendant={listOpen ? `${listId}-${active}` : undefined}
                rows={3}
                placeholder={
                  replyTarget
                    ? `Reply to ${nameOf(replyTarget)}…`
                    : taggable.length > 0
                      ? 'Ask a doubt, or explain how you solved it. Type @ to tag someone.'
                      : 'Ask a doubt, or explain how you solved it.'
                }
                className="w-full resize-none rounded-control border border-rule-strong bg-surface px-3 py-2.5 text-ui text-ink outline-none focus:border-ink"
              />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={posting || !draft.trim()}
                className="h-10 rounded-control bg-ink px-4 text-ui text-white transition-colors hover:bg-ink/85 disabled:opacity-45"
              >
                {posting ? 'Posting…' : replyTarget ? 'Reply' : 'Post comment'}
              </button>
              {error ? <span className="text-meta text-incorrect">{error}</span> : null}
            </div>
          </form>
        ) : (
          <p className="text-ui text-ink-muted">
            <SignInLink /> to join the discussion.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * One comment or reply: a bubble with the name and the text, then under it a
 * quiet row of the time, Reply, and whatever else belongs there.
 */
function Comment({
  comment,
  mention,
  names,
  active,
  onReply,
  children,
}: {
  comment: DiscussionRow
  /** For a reply to a reply: the name it answers, shown as @name. */
  mention?: string | null
  /** Everyone in the discussion, so an @name of theirs in the text stands out. */
  names: string[]
  /** This is the comment being replied to. */
  active: boolean
  onReply: () => void
  children?: React.ReactNode
}) {
  // No second @name when the writer already opened with it.
  const prefix = mention && !comment.body.startsWith(`@${mention}`) ? mention : null
  return (
    <div>
      <div className="rounded-card bg-surface-2 px-4 py-2.5">
        <p className="text-meta font-medium text-ink">{nameOf(comment)}</p>
        <p className="mt-0.5 text-ui leading-relaxed whitespace-pre-wrap text-ink">
          {prefix ? <span className="mr-1 text-accent">@{prefix}</span> : null}
          {withMentions(comment.body, names)}
        </p>
      </div>
      <div className="mt-1 flex items-center gap-4 px-2 text-meta text-ink-faint">
        <time dateTime={comment.created_at} className="tabular-nums">
          {formatWhen(comment.created_at)}
        </time>
        <button
          type="button"
          onClick={onReply}
          className={active ? 'text-ink' : 'text-ink-muted hover:text-ink'}
        >
          Reply
        </button>
        {children}
      </div>
    </div>
  )
}

/**
 * The text with each @name of someone in the discussion picked out. Names can
 * hold spaces, so they are matched whole, longest first, rather than cut at
 * the next space.
 */
function withMentions(body: string, names: string[]): React.ReactNode {
  if (names.length === 0 || !body.includes('@')) return body
  const alternatives = [...new Set(names)]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(@(?:${alternatives.join('|')}))`, 'g')
  return body.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="text-accent">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function nameOf(comment: DiscussionRow): string {
  return comment.profiles?.display_name ?? 'Student'
}

/** Instagram's short ages: now, 5m, 3h, 2d, 4w — then the date. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  if (days < 56) return `${Math.floor(days / 7)}w`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
