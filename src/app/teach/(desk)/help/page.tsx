import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { teacherPageGate } from '@/lib/supabase/server'
import { youtubeApiUploadsEnabled } from '@/lib/youtube/connection'
import { CLAIM_HOURS, RECORDING_MAX_MS, RECORDING_WARN_MS, ROUTES } from '@/lib/teach/contracts'
import { Page, Section, TitleCard } from '@/components/site/Page'
import { Card } from '@/components/ui/primitives'
import { Info } from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Help' }

const WARN_MINUTES = Math.round(RECORDING_WARN_MS / 60_000)
const MAX_MINUTES = Math.round(RECORDING_MAX_MS / 60_000)

/**
 * How to record well, and how a recording gets onto YouTube. The upload steps
 * are the manual ones (YouTube Studio), which work today; the one-click upload
 * is described as on or not yet, read from the same switch the studio uses.
 */
export default async function TeachHelpPage() {
  await teacherPageGate(ROUTES.teachHelp)
  const oneClick = await youtubeApiUploadsEnabled()

  return (
    <Page>
      <TitleCard
        back={ROUTES.teachHome}
        title="Recording help"
        subtitle="Setting up, recording, and putting the video on YouTube"
      />

      <div className="mt-6 grid gap-x-8 lg:grid-cols-2">
        <div>
          <Section title="Before you record">
            <Tips>
              <li>
                Find a quiet room. Close the window, silence your phone, and use a headset or a USB microphone if you
                have one — a laptop’s own microphone picks up the keyboard and the fan.
              </li>
              <li>
                Write with a pen tablet, or an iPad with Apple Pencil. The board follows pen pressure, so lines thin and
                thicken as you write. A mouse works, but handwriting with one is slow.
              </li>
              <li>
                Use a laptop or desktop, or a tablet turned sideways: the studio puts the question beside the board and
                needs the width.
              </li>
              <li>
                Only the board, the question card and your webcam (if you turn it on) are recorded — never the rest of
                your screen, your tabs or your notifications.
              </li>
              <li>Try the microphone level meter in the studio before your first take.</li>
            </Tips>
          </Section>

          <Section title="While you record">
            <Tips>
              <li>
                Read the question, work out the answer, then say why each wrong option is wrong. Students watch this
                after getting it wrong.
              </li>
              <li>
                One explanation plays on every copy of the question, in every paper it appears in. When the studio says
                the copies list the options in a different order, name each option by what it says — “the option O(n log
                n)” — never by its letter or position.
              </li>
              <li>
                Keep it short: most questions need 3 to 8 minutes. The recorder warns you at {WARN_MINUTES} minutes and
                stops at {MAX_MINUTES}.
              </li>
              <li>
                Keep videos under 15 minutes unless the channel is verified: YouTube accepts longer uploads only from a
                verified channel.
              </li>
              <li>Pause when you need to think; resuming carries on the same take. Review it before you keep it.</li>
            </Tips>
          </Section>

          <Section title="After you submit">
            <Tips>
              <li>
                <strong className="font-medium text-ink">Save draft</strong> keeps your work private: only you and the
                admins can see it.
              </li>
              <li>
                <strong className="font-medium text-ink">Submit</strong> sends it for review. A reviewer publishes it,
                or sends it back with a note — it then waits under <em>Needs changes</em> on your dashboard.
              </li>
              <li>
                Teachers an admin trusts see <strong className="font-medium text-ink">Publish</strong> instead, and
                their work goes live at once. Changing a published explanation sends it back to review otherwise.
              </li>
              <li>
                While you work on a question, it is held for you for {CLAIM_HOURS} hours so no one else records it at
                the same time. If you stop, release it from the queue.
              </li>
            </Tips>
          </Section>
        </div>

        {/* Side by side from lg; stacked below it, with the gap a Section would have. */}
        <div className="mt-8 lg:mt-0">
          <Section title="Putting the video on YouTube">
            <Card className="p-4 sm:p-5">
              <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-ui text-ink marker:text-ink-faint">
                <li>In the studio, review your take and download it. The file is named after the question.</li>
                <li>
                  Open YouTube Studio (studio.youtube.com) with the account that can upload to the{' '}
                  <strong className="font-medium">Unknown IITians</strong> channel, and switch to that channel.
                </li>
                <li>Choose Create, then Upload videos, and pick the file.</li>
                <li>Paste the title and the description the studio suggests for this question.</li>
                <li>
                  Under Playlists, add it to the subject’s <strong className="font-medium">Unlisted</strong> playlist.
                  If the subject has none yet, create one named after the subject, visibility Unlisted.
                </li>
                <li>
                  Audience: choose <strong className="font-medium">No, it’s not made for kids</strong>.
                </li>
                <li>
                  Open Show more and make sure <strong className="font-medium">Allow embedding</strong> is on. Without
                  it the video cannot play on the site.
                </li>
                <li>
                  Visibility: <strong className="font-medium">Unlisted</strong>. Not Private — a private video does not
                  play for students.
                </li>
                <li>Save, then copy the video’s link.</li>
                <li>
                  Back in the studio, paste the link and save. The site checks that the video is on the channel, is not
                  private and can be embedded before it keeps the link.
                </li>
              </ol>
              <p className="mt-4 border-t border-rule pt-3 text-meta text-ink-muted">
                No access to the channel? Send the downloaded file to an admin, who can upload it and send you the link
                to paste.
              </p>
            </Card>

            <p className="mt-4 flex gap-2.5 rounded-control bg-accent-soft px-4 py-3 text-meta text-ink">
              <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
              {oneClick ? (
                <span>
                  One-click upload is on. After reviewing a take, choose Upload to YouTube in the studio: the video goes
                  to the channel with the title, description and visibility you pick, and its link is saved for you. If
                  it fails, the steps above always work.
                </span>
              ) : (
                <span>
                  An Upload to YouTube button that does all of this from the studio arrives once Google approves the
                  site’s use of the YouTube API. Until then, use the steps above.
                </span>
              )}
            </p>
          </Section>
        </div>
      </div>
    </Page>
  )
}

function Tips({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 text-ui text-ink-muted marker:text-ink-faint">{children}</ul>
}
