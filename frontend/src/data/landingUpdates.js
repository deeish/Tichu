/** Known `kind` values for each line in `items` (shown as a pill in the updates dialog). */
export const LANDING_UPDATE_KIND_LABELS = {
  feature: 'New feature',
  bugfix: 'Bug fix',
  improvement: 'Improvement',
  other: 'Other',
}

/**
 * @param {keyof typeof LANDING_UPDATE_KIND_LABELS | string | undefined} kind
 * @returns {string | null}
 */
export function landingUpdateKindLabel(kind) {
  if (!kind) return null
  if (Object.prototype.hasOwnProperty.call(LANDING_UPDATE_KIND_LABELS, kind)) {
    return LANDING_UPDATE_KIND_LABELS[kind]
  }
  const s = String(kind).replace(/[-_]/g, ' ').trim()
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : null
}

/**
 * Site changelog for the home screen. Newest calendar day first; within a day,
 * list items with newest / most significant first.
 *
 * `date` — YYYY-MM-DD (shown as the section heading; no per-line times)
 * `items[].kind` — optional: `feature` | `bugfix` | `improvement` | `other` (or any string for a custom label)
 * `items[].text` — what changed
 */
export const LANDING_UPDATE_DAYS = [
  {
    date: '2026-05-21',
    items: [
      {
        kind: 'improvement',
        text: 'Mobile support: the game is now playable on mobile devices.',
      },
    ],
  },
  {
    date: '2026-05-15',
    items: [
      {
        kind: 'bugfix',
        text: 'Fixed Mah Jong + same-suit straight (e.g. 1–5) being blocked as a bomb at round start.',
      },
    ],
  },
  {
    date: '2026-05-01',
    items: [
      {
        kind: 'improvement',
        text: 'Auto-pass now stops automatically when you have a playable hand (including bombs).',
      },
      {
        kind: 'improvement',
        text: 'Added warnings when calling Tichu after your teammate already called it, or after someone has finished their hand.',
      },
      {
        kind: 'improvement',
        text: 'Increased hand dock glow intensity when it\'s your turn.',
      },
      {
        kind: 'bugfix',
        text: 'Fixed dragon pass notice blocking the card exchange recap in later rounds.',
      },
      {
        kind: 'bugfix',
        text: 'Fixed "Points (team)" stat in end-game stats being wrong after double victory rounds — feedback welcome to confirm.',
      },
    ],
  },
  {
    date: '2026-04-25',
    items: [
      {
        kind: 'improvement',
        text: 'Playing UI: the “Received” cards section is now cleaner and easier to read.',
      },
      {
        kind: 'improvement',
        text: 'Added clearer turn alerts with stronger highlight cues.',
      },
      {
        kind: 'improvement',
        text: 'Dragon pass now animates to the receiving player with a clear notice.',
      },
    ],
  },
  {
    date: '2026-04-18',
    items: [
      {
        kind: 'feature',
        text: 'Lobby: optional custom starting scores for the host.',
      },
      {
        kind: 'feature',
        text: 'Added “Last updated” on the home page with a date-grouped list of updates.',
      },
    ],
  },
]

/** Human-readable date for the “Last updated …” link (from newest day). */
export function getLastUpdatedDisplayDate() {
  const first = LANDING_UPDATE_DAYS[0]
  if (!first?.date) return null
  const d = new Date(`${first.date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Section title for each day in the updates dialog. */
export function formatUpdateDayHeading(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
