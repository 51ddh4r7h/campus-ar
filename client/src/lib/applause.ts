/**
 * The wrap applause.
 *
 * The one shipped sound in the app — everything else (the projector hum, the
 * reel, the shutter) is synthesised in `ar/sound.ts`, but a real crowd is worth
 * the 38KB here. Plays once, on a completed hunt, alongside the confetti.
 *
 * Degrades to silence. A blocked autoplay, a codec the browser will not decode,
 * a file that failed to load — none of them matter, the confetti carries the
 * moment on its own.
 */
import clapUrl from '../assets/clap.m4a'

export function applause(): void {
  try {
    const sound = new Audio(clapUrl)
    sound.volume = 0.7
    void sound.play().catch(() => {
      /* autoplay refused — the confetti is enough */
    })
  } catch {
    /* no Audio, no file — no problem */
  }
}
