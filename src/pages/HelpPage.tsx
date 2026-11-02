// Questions & privacy: the staff handbook. Five numbered chapters, each question opening in place to a
// short answer or numbered steps; chapter 5 is the location and privacy notice, always open, and its link
// (#help-privacy) is what the manager sends staff. Public (reachable before sign-in), so it names no staff:
// "your manager". Numbers come from site settings (CLAUDE.md rule 7).
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { getSettings } from '@/data'
import type { SiteSettings } from '@/types'
import { formatDuration, siteShortName } from '@/lib/format'

interface Question {
  q: string
  a: string[]
}

interface Chapter {
  id: string
  title: string
  questions: Question[]
}

const PRIVACY_ID = 'help-privacy'

function chapters(s: SiteSettings): Chapter[] {
  return [
    {
      id: 'help-start',
      title: 'Getting started',
      questions: [
        {
          q: 'How do I sign in?',
          a: [
            'Type your name the way your manager gave it to you, for example maria.',
            'Type your 6-digit PIN.',
            'You are in. Your phone remembers you next time.',
          ],
        },
        {
          q: "I forgot my PIN, or it says my name and PIN don't match",
          a: [
            'Check that your name is typed the way your manager gave it to you.',
            'Still not working? Ask your manager for a new PIN. Nobody can look up your old PIN, not even your manager.',
          ],
        },
        { q: 'Do I have to sign in every time?', a: ['No. Your phone remembers you. You only sign in again after you log out, or on a new phone.'] },
        {
          q: 'How do I put the app on my home screen?',
          a: [
            'iPhone: open the app in Safari, tap the Share button, then Add to Home Screen.',
            'Android: open the app in Chrome, tap the ⋮ menu, then Add to Home screen.',
          ],
        },
        {
          q: "Can I use someone else's phone?",
          a: [
            'Only if yours is not working. Sign in with your own name and PIN.',
            'When you finish, tap your initial at the top, then Log out.',
            'Never clock in for someone else.',
          ],
        },
      ],
    },
    {
      id: 'help-clocking',
      title: 'Clocking in and out',
      questions: [
        {
          q: 'How do I clock in and out?',
          a: [
            'Open the app when you arrive at the gym.',
            'Tap Clock in, the red button at the bottom.',
            'When you finish, tap Clock out. The time comes from our server, not from your phone.',
          ],
        },
        {
          q: 'My phone asks for my location. Do I have to say yes?',
          a: ['Please tap Allow. Your location is only checked at that moment. If you say no, your clock-in still saves, and your manager will check it.'],
        },
        {
          q: "It says I'm far from the gym, but I'm here",
          a: ['Your time is saved. Phone location can be wrong inside big buildings. Your manager will see it and check it. Nothing is taken off your hours.'],
        },
        {
          q: 'I clocked in by mistake',
          a: [
            'On your home, tap "This clock-in was a mistake".',
            'Pick why, and send.',
            'Your manager takes it off your hours. It stays on record, but it does not count.',
          ],
        },
        {
          q: 'I forgot to clock out',
          a: [
            'Clock out as soon as you remember. The app asks when you really finished; tell it.',
            `If you never clock out, the app closes your shift ${formatDuration(s.auto_close_after_min)} after your finish time. It records your finish time, plus any extra time your manager approved. If you were not rostered, it records ${formatDuration(s.standard_shift_min)} after you clocked in. Next time you open the app, it asks you to check that time.`,
          ],
        },
        {
          q: 'I stayed late to finish',
          a: ['When you clock out after your finish time, the app asks what happened. Tap "I stayed to finish" to ask for the extra time. Your manager says yes or no.'],
        },
        {
          q: "I'm running late",
          a: ['Before your shift, tap the note row under your shift, then Running late, and pick about how late. Your manager will see when you expect to arrive.'],
        },
        {
          q: 'What if I have no internet?',
          a: ['You need internet to clock in and out. If it does not save, the app tells you. Move to a spot with signal and tap again. If you could not get signal, tell your manager.'],
        },
        {
          q: 'Will the app ever cut my hours?',
          a: [
            `No. You are paid from clock-in to clock-out. If a shift goes over ${formatDuration(s.standard_shift_min)} without approved extra time, your manager is told, but nothing is taken off.`,
          ],
        },
      ],
    },
    {
      id: 'help-photos',
      title: 'Extra time, photos and notes',
      questions: [
        {
          q: 'How do I ask for extra time?',
          a: [
            'While you are on shift, tap "Ask for extra time".',
            `Pick how much (up to ${formatDuration(s.max_extension_request_min)}) and why, then send.`,
            `Your manager says yes or no in the app. Extra time can't be approved past ${formatDuration(s.max_shift_min)} in total. All the time you work is still recorded.`,
          ],
        },
        {
          q: 'How many photos can I add, and until when?',
          a: [
            `Up to ${s.max_photos_per_shift} photos per shift, from when you clock in until ${formatDuration(s.photo_upload_window_min)} after you clock out. The app makes them smaller so they upload fast.`,
          ],
        },
        {
          q: 'I added the wrong photo',
          a: [`Tap the photo, then "Remove this photo". You can do this for ${formatDuration(s.photo_remove_window_min)} after adding it. After that, ask your manager to remove it.`],
        },
        {
          q: 'How do I tell my manager supplies are low or something is wrong?',
          a: ['Tap the note row under your shift.', 'Pick "Supplies low" or "Something wrong", and send.', 'Your manager sees it until it is done.'],
        },
      ],
    },
    {
      id: 'help-shifts',
      title: 'Shifts, swaps and days off',
      questions: [
        {
          q: 'Where do I see my shifts?',
          a: ["On your home: today's shift is at the top and your next shifts are under it. You see a fortnight once your manager publishes it."],
        },
        {
          q: "I can't make a shift",
          a: [
            `Tap "Can't make it?" on the shift.`,
            `Pick a colleague who is free, or "Anyone who's free", then tap Ask.`,
            'They say yes first, then your manager or team lead approves. Until then, the shift is still yours.',
          ],
        },
        {
          q: 'Someone asked me to take their shift',
          a: ['It shows under "Can you take these?". Tap "I\'ll take it" or "Not me". If you say yes, the shift becomes yours once it is approved.'],
        },
        { q: 'Can I take back a request?', a: ['Yes. Tap Withdraw on the shift while it is still waiting.'] },
        {
          q: "How do I mark days I can't work?",
          a: [
            `Tap "Days I can't work" on your home.`,
            'Tap the days, then Save. Your manager rosters around them.',
            'A dot means you already have a shift that day. Ask for cover on that shift instead.',
          ],
        },
        { q: 'Where can I see my past shifts and hours?', a: ['Tap "My past shifts" on your home. Use ‹ and › to move between fortnights.'] },
      ],
    },
  ]
}

/** The location and privacy notice. Always open: it is the written notice the manager sends. */
function notice(s: SiteSettings): Question[] {
  return [
    {
      q: 'Does the app track where I am?',
      a: ['No. The app checks your location only at the moment you tap Clock in or Clock out. It never follows you before, during or after your shift.'],
    },
    {
      q: 'What is recorded when I clock in or out?',
      a: [
        'The time, from our server (not your phone).',
        'Where your phone was (latitude and longitude), and how accurate that was.',
        'How far that is from the gym.',
        'If location is off on your phone, only the time is recorded.',
      ],
    },
    { q: 'Why is it recorded?', a: ['To confirm your hours for pay, without sending photos of the time clock.'] },
    { q: 'Is this ongoing?', a: ['Yes. It happens every time you clock in or out, for as long as you use the app.'] },
    {
      q: 'Who can see my location, photos and hours?',
      a: ["You can see your own. Your manager sees everyone's. Your team lead sees their group's. Nobody else."],
    },
    {
      q: 'How long is it kept?',
      a: [
        `Work photos are deleted after ${s.photo_retention_months} months.`,
        'Your clock-in and clock-out records, including where your phone was, are pay records. Your employer keeps them for as long as pay records have to be kept.',
      ],
    },
    { q: 'Who can see my mobile number?', a: ['If you gave one: only you and your manager. It is never used to sign in.'] },
    {
      q: 'When does location recording start?',
      a: ['Your manager will give you the start date in writing, at least 14 days before location recording begins.'],
    },
  ]
}

/** One line is a paragraph; several are numbered steps, or a bulleted list of facts (the notice). */
/** A login typed as an example ("maria") is set in bold, so it reads as something to type. */
function withLogin(line: string) {
  const m = line.match(/^(.*for example )(\w+)(\..*)$/)
  return m ? (
    <>
      {m[1]}
      <b className="font-semibold">{m[2]}</b>
      {m[3]}
    </>
  ) : (
    line
  )
}

function Answer({ lines, facts = false }: { lines: string[]; facts?: boolean }) {
  if (lines.length === 1) return <p className="text-[15px] leading-[1.45]">{withLogin(lines[0])}</p>
  const List = facts ? 'ul' : 'ol'
  return (
    <List className={`space-y-1.5 pl-5 text-[15px] leading-[1.45] marker:text-muted-foreground ${facts ? 'list-disc' : 'list-decimal marker:font-semibold'}`}>
      {lines.map((line) => (
        <li key={line} className="pl-1">
          {withLogin(line)}
        </li>
      ))}
    </List>
  )
}

export function HelpPage({ onBack, backLabel = 'Back' }: { onBack: () => void; backLabel?: string }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null)

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  // Opened from a link to a chapter (e.g. the notice at #help-privacy): go straight to it.
  useEffect(() => {
    if (!settings) return
    const id = window.location.hash.slice(1)
    if (id && id !== 'help') document.getElementById(id)?.scrollIntoView()
  }, [settings])

  if (!settings) return <main className="min-h-svh" aria-busy role="status" aria-label="Loading" />
  const book = chapters(settings)

  return (
    <main className="help-page mx-auto min-h-svh max-w-[480px] px-4 pb-[calc(env(safe-area-inset-bottom)+48px)]">
      <header className="flex h-12 items-center justify-between px-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-[0.08em] uppercase">World Gym</span>
          <span className="text-[15px] text-muted-foreground">{siteShortName(settings.site_name)}</span>
        </p>
      </header>
      <button type="button" onClick={onBack} className="-ml-1 flex h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-medium hover:bg-muted active:bg-muted">
        <ChevronLeft aria-hidden className="size-5" />
        {backLabel}
      </button>

      <h1 className="mt-3 px-1 text-[28px] leading-tight font-semibold tracking-[-0.01em]">Questions &amp; privacy</h1>
      <p className="mt-1 px-1 text-[15px] text-muted-foreground">How the app works, in plain words. Tap a question to read the answer.</p>

      <nav aria-label="Contents" className="mt-5 border-t border-border">
        <ol>
          {[...book, { id: PRIVACY_ID, title: 'Your privacy and location' }].map((c, i) => (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                className="flex min-h-12 items-center gap-3 border-b border-border px-1 text-base font-medium transition-colors hover:bg-muted/60 active:bg-muted"
              >
                <span className={`w-6 text-[15px] font-semibold tabular-nums ${c.id === PRIVACY_ID ? 'text-brand' : 'text-muted-foreground'}`}>{i + 1}</span>
                {c.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {book.map((c, i) => (
        <section key={c.id} id={c.id} aria-labelledby={`${c.id}-title`} className="scroll-mt-4">
          <h2 id={`${c.id}-title`} className="mt-8 mb-2 px-1 text-xl font-semibold">
            <span className="mr-2 font-medium text-muted-foreground tabular-nums">{i + 1}</span>
            {c.title}
          </h2>
          {c.questions.map((item, qi) => (
            <details key={item.q} open={i === 0 && qi === 0} className="help-q group border-t border-border">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 py-3 text-base leading-snug font-semibold transition-colors hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="px-1 pb-4">
                <Answer lines={item.a} />
              </div>
            </details>
          ))}
        </section>
      ))}

      <section id={PRIVACY_ID} aria-labelledby={`${PRIVACY_ID}-title`} className="scroll-mt-4">
        <h2 id={`${PRIVACY_ID}-title`} className="mt-8 px-1 text-xl font-semibold">
          <span className="mr-2 font-medium text-brand tabular-nums">{book.length + 1}</span>
          Your privacy and location
        </h2>
        <p className="mt-1 mb-2 px-1 text-[15px] text-muted-foreground">This is the notice about what the app records. Please read it all.</p>
        {notice(settings).map((item) => (
          <div key={item.q} className="border-t border-border px-1 py-3">
            <h3 className="mb-1.5 text-base leading-snug font-semibold">{item.q}</h3>
            <Answer lines={item.a} facts />
          </div>
        ))}
        <p className="border-t border-border px-1 pt-3 text-[15px] text-muted-foreground">Questions about this notice? Ask your manager.</p>
      </section>
    </main>
  )
}
