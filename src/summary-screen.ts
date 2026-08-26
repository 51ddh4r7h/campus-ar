/**
 * The summary screen's DOM owner: total time, split rows, the marquee
 * (leaderboard), and the name-entry form's button/status states.
 *
 * main.ts supplies data (splits, marquee entries) and the actual post-score
 * behaviour; this module owns pixels + form ergonomics (disabled button while
 * posting, inline status, XSS-safe name rendering).
 */
import {FILM_SPOTS} from './data/spots'
import {formatClock} from './hunt'
import type {ScoreEntry} from './leaderboard'

// SAFETY: index.html ships every id referenced below with the matching tag;
// the single cast here owns that invariant for all $<T> call sites.
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id.replace(/^#/, '')) as T

// Small XSS guard for leaderboard names.
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!)

export interface SummarySplit {
  index: number
  name: string
  movie: string
  ms: number
}

export interface SummaryData {
  totalMs: number
  splits: SummarySplit[]
  entries: ScoreEntry[]
}

export function createSummaryScreen() {
  const summaryTotal = $('#summary-total')
  const summarySplits = $('#summary-splits')
  const leaderboardList = $('#leaderboard-list')
  const nameForm = $<HTMLFormElement>('#name-form')
  const nameInput = $<HTMLInputElement>('#name-input')
  const postScoreBtn = $<HTMLButtonElement>('#post-score-btn')
  const scoreStatus = $('#score-status')

  function render(data: SummaryData, highlightName?: string): void {
    summaryTotal.textContent = formatClock(data.totalMs)

    summarySplits.innerHTML = ''
    for (const split of data.splits) {
      const li = document.createElement('li')
      li.className = 'glass flex items-center gap-3 rounded-tile px-3.5 py-3'
      li.innerHTML = `
        <span class="grid h-9 w-9 place-items-center rounded-chip bg-gold/10 font-display text-lg text-gold">${split.index}</span>
        <div class="min-w-0 flex-1">
          <p class="font-display truncate text-xl tracking-wider text-chalk">${split.name}</p>
          <p class="truncate text-[11px] text-fog">${split.movie}</p>
        </div>
        <p class="font-display shrink-0 text-2xl tracking-wider text-spotlight">${formatClock(split.ms)}</p>`
      summarySplits.appendChild(li)
    }

    leaderboardList.innerHTML = ''
    for (const [i, entry] of data.entries.entries()) {
      const li = document.createElement('li')
      const highlighted = highlightName !== undefined && entry.name === highlightName
      li.className = 'flex items-center gap-3 px-4 py-2.5 ' + (highlighted ? 'bg-gold/10' : '')
      li.innerHTML = `
        <span class="w-6 font-display text-lg text-fog/60">${i + 1}</span>
        <span class="min-w-0 flex-1 truncate font-semibold text-chalk">${escapeHtml(entry.name)}</span>
        ${entry.splits.length ? `<span class="text-[10px] font-bold uppercase tracking-widest text-fog">${entry.splits.length}/${FILM_SPOTS.length} sets</span>` : ''}
        <span class="font-display text-xl tracking-wider text-spotlight">${formatClock(entry.totalTimeMs)}</span>`
      leaderboardList.appendChild(li)
    }
  }

  function setPendingName(name: string): void {
    nameInput.value = name
  }

  /**
   * Bind the post-score form. `post` persists the score under the given name
   * and returns true on success; button + status handling stays here.
   */
  function bindPostForm(post: (name: string) => Promise<boolean>): void {
    nameForm.addEventListener('submit', (e) => {
      e.preventDefault()
      const name = nameInput.value.trim()
      if (!name) {
        scoreStatus.textContent = 'The marquee needs a name.'
        scoreStatus.classList.remove('hidden')
        return
      }
      postScoreBtn.disabled = true
      postScoreBtn.textContent = 'Posting…'
      post(name)
        .then((ok) => {
          postScoreBtn.disabled = false
          postScoreBtn.textContent = 'Post'
          scoreStatus.textContent = ok
            ? `Posted — you’re on the marquee, ${name}.`
            : 'The marquee refused that one — try again.'
          scoreStatus.classList.remove('hidden')
        })
        .catch(() => {
          postScoreBtn.disabled = false
          postScoreBtn.textContent = 'Post'
          scoreStatus.textContent = 'The marquee is unreachable — check your connection.'
          scoreStatus.classList.remove('hidden')
        })
    })
  }

  return {render, setPendingName, bindPostForm}
}

export type SummaryScreen = ReturnType<typeof createSummaryScreen>
