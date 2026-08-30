/**
 * Keeps the world-anchored scene aligned after a device rotates.
 *
 * The AR controller owns the actual pose reset; this module owns only the
 * browser orientation signals and the small amount of user-facing prompting.
 */

const screenAngle = (): number => window.screen.orientation?.angle ?? 0

export function bindOrientationRecenter(
  isArVisible: () => boolean,
  recenter: () => void,
  prompt: HTMLButtonElement,
): () => void {
  let lastAngle = screenAngle()
  let recenterTimer = 0
  let promptTimer = 0

  const handleShift = (newAngle: number): void => {
    const delta = Math.abs(newAngle - lastAngle)
    lastAngle = newAngle
    if (!(delta > 30 && delta < 330) || !isArVisible()) return

    window.clearTimeout(recenterTimer)
    window.clearTimeout(promptTimer)
    prompt.classList.remove('hidden')
    promptTimer = window.setTimeout(() => prompt.classList.add('hidden'), 5200)
    recenterTimer = window.setTimeout(() => {
      recenter()
      prompt.classList.add('hidden')
    }, 450)
  }

  const onOrientationChange = (): void => {
    window.setTimeout(() => handleShift(screenAngle()), 80)
  }
  const onOrientationEvent = (): void => handleShift(screenAngle())

  window.addEventListener('orientationchange', onOrientationChange)
  window.screen.orientation?.addEventListener('change', onOrientationEvent)
  window.addEventListener('campus-ar:recenter-done', () => prompt.classList.add('hidden'))

  return () => {
    window.clearTimeout(recenterTimer)
    window.clearTimeout(promptTimer)
    window.removeEventListener('orientationchange', onOrientationChange)
    window.screen.orientation?.removeEventListener('change', onOrientationEvent)
  }
}
