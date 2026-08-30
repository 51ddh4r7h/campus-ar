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
      li.className = 'flex items-center gap-3 border-b border-line bg-background px-3 py-3 last:border-b-0'
      li.innerHTML = `
        <span class="grid h-8 w-8 shrink-0 place-items-center border border-line bg-raised font-mono text-[11px] font-bold tabular-nums text-muted">${String(split.index).padStart(2, '0')}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-display text-[13px] font-black uppercase tracking-[0.08em] text-foreground">${split.name}</p>
          <p class="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted">${split.movie}</p>
        </div>
        <data value="${split.ms}" class="shrink-0 font-mono text-[13px] font-bold tabular-nums tracking-tight text-foreground">${formatClock(split.ms)}</data>`
      summarySplits.appendChild(li)
    }
    if (data.splits.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'border border-dashed border-line bg-background px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted'
      empty.textContent = '— No splits yet —'
      summarySplits.appendChild(empty)
    }

    leaderboardList.innerHTML = ''
    for (const [i, entry] of data.entries.entries()) {
      const li = document.createElement('li')
      const highlighted = highlightName !== undefined && entry.name === highlightName
      li.className = 'flex items-center gap-3 px-4 py-2.5 ' + (highlighted ? 'bg-hazardDim border-l-2 border-l-hazard' : '')
      li.innerHTML = `
        <span class="w-6 font-mono text-[11px] tabular-nums tracking-[0.12em] text-muted">${String(i + 1).padStart(2, '0')}</span>
        <span class="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground">${escapeHtml(entry.name)}</span>
        ${entry.splits.length ? `<span class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">${entry.splits.length}/${FILM_SPOTS.length} sets</span>` : ''}
        <data value="${entry.totalTimeMs}" class="font-mono text-[13px] font-bold tabular-nums tracking-tight text-foreground">${formatClock(entry.totalTimeMs)}</data>`
      leaderboardList.appendChild(li)
    }
    if (data.entries.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted'
      empty.textContent = '— No entries yet — be the first —'
      leaderboardList.appendChild(empty)
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
