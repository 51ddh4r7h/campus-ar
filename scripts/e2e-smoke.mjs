/**
 * E2E smoke test for the Campus Film Hunt MVP.
 *
 * Drives the full flow in headless Chromium against the Vite dev server:
 *   start → hunt (GPS sim) → proximity unlock → AR → reveal → all 3 spots →
 *   summary → name entry → stubbed leaderboard → reload-resume.
 *
 * Run: npm run dev  (then)  node scripts/e2e-smoke.mjs
 * Uses `?sim` so no real GPS or AR camera is required; the reveal is forced
 * through the window.__campushunt debug hook.
 */
import {chromium} from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/?sim'
const results = []
let failures = 0

const check = (name, ok, detail = '') => {
  results.push({name, ok, detail})
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const hidden = async (page, sel) => (await page.locator(sel).evaluate((el) => el.classList.contains('hidden')))

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 390, height: 844}})

const moduleErrors = []
page.on('pageerror', (err) => moduleErrors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') moduleErrors.push(`console: ${msg.text()}`)
})

try {
  await page.goto(BASE, {waitUntil: 'domcontentloaded'})
  // 1. Start screen.
  check('start screen renders', !(await hidden(page, '#screen-start')))
  check('title copy present', (await page.textContent('h1'))?.includes('movie sets') ?? false)
  check('start button + aria label', (await page.locator('#start-button').isVisible()) === true)

  // 2. Begin hunt.
  await page.click('#start-button')
  await page.waitForFunction(() => !document.getElementById('screen-hunt').classList.contains('hidden'))
  check('hunt screen shown after Start', true)
  check('3 spots on the list', (await page.locator('#spot-list li').count()) === 3)
  check('sets counter 0/3', (await page.textContent('#sets-chip'))?.includes('0/3') ?? false)
  check('all spots off air', (await page.locator('#spot-list .badge', {hasText: 'off air'}).count()) === 3)
  check('meter starts at 1 lit segment', (await page.locator('#signal-meter .segment.lit').count()) === 1)

  // 3. Timer ticks.
  await page.waitForTimeout(1600)
  const t1 = await page.textContent('#timer-chip')
  check('timer ticking', t1 !== null && t1.trim() !== '00:00.0', t1)

  // 4. Reload resumes the hunt (timer wall-clock persisted).
  await page.reload({waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => !document.getElementById('screen-hunt').classList.contains('hidden'))
  await page.waitForTimeout(500) // first timer tick
  const t2 = await page.textContent('#timer-chip')
  check('hunt resumes after reload', true, `timer@reload=${t2}`)

  // 5. Enter spot A's radius → unlock + CTA.
  await page.evaluate(() => window.__campushunt.jump('the-quad'))
  await page.waitForFunction(() => document.getElementById('signal-label').textContent.includes("You’re close"))
  check('band reaches You’re close', true)
  check('meter fully lit', (await page.locator('#signal-meter .segment.lit').count()) === 5)
  check('open-camera CTA visible', await page.locator('#open-ar-btn').isVisible())
  const spot1Badge = await page.textContent('#spot-list li:first-child .badge')
  check('spot A marked live', spot1Badge?.trim() === 'live', spot1Badge)

  // 6. Open AR → reveal → continue.
  await page.click('#open-ar-btn')
  await page.waitForFunction(() => !document.getElementById('ar-chrome').classList.contains('hidden'))
  check('AR chrome shown', true)
  check('debug HUD shows spot', (await page.textContent('#hud-spot'))?.trim() === 'the-quad')
  check('AR timer visible', await page.locator('#ar-timer').isVisible())

  await page.evaluate(() => window.__campushunt.reveal())
  await page.waitForFunction(() => !document.getElementById('reveal-panel').classList.contains('hidden'), null, {timeout: 4000})
  check('reveal panel opens', true)
  check('reveal shows spot name', (await page.textContent('#reveal-spot-name'))?.trim() === 'The Quad')
  check('reveal shows movie', (await page.textContent('#reveal-movie'))?.trim() === 'The Social Network')
  check('reveal shows a split', ((await page.textContent('#reveal-split'))?.trim()?.length ?? 0) > 0)

  await page.click('#reveal-continue')
  await page.waitForFunction(() => document.getElementById('screen-hunt').classList.contains('hidden') === false)
  check('back on hunt screen', true)
  check('spot A now in the can', ((await page.textContent('#spot-list li:first-child .badge'))?.includes('in the can') ?? false))

  // 7. Spots B and C.
  for (const [id, name] of [['library-steps', 'Library Steps'], ['memorial-court', 'Memorial Court']]) {
    await page.evaluate((spotId) => window.__campushunt.jump(spotId), id)
    await page.waitForFunction(() => !document.getElementById('open-ar-btn').classList.contains('hidden'))
    await page.click('#open-ar-btn')
    await page.evaluate(() => window.__campushunt.reveal())
    await page.waitForFunction(() => !document.getElementById('reveal-panel').classList.contains('hidden'), null, {timeout: 4000})
    check(`reveal panel for ${name}`, (await page.textContent('#reveal-spot-name'))?.trim() === name)
    await page.click('#reveal-continue')
    await page.waitForTimeout(400)
  }

  // 8. Summary.
  await page.waitForFunction(() => !document.getElementById('screen-summary').classList.contains('hidden'))
  check('summary screen shown', true)
  const total = await page.textContent('#summary-total')
  check('total time rendered', (total?.trim()?.length ?? 0) > 0, total)
  check('3 split rows', (await page.locator('#summary-splits li').count()) === 3)

  // 9. Name entry → stub leaderboard.
  await page.fill('#name-input', 'Zed')
  await page.click('#post-score-btn')
  await page.waitForFunction(() => document.getElementById('leaderboard-list').textContent.includes('Zed'))
  check('leaderboard contains submitted name', true)
  const leaderboardNames = await page.locator('#leaderboard-list li').allTextContents()
  check('Zed ranked on marquee', leaderboardNames.some((n) => n.includes('Zed')))
  check('submission status shown', ((await page.textContent('#score-status'))?.includes('Posted') ?? false))

  // 10. Environment assertions: block engine-only noise, fail on our module errors.
  const ours = moduleErrors.filter((e) => /campus-ar|main\.ts|hunt\.js|reveal\.js|leaderboard|location\.js/.test(e))
  check('no app-module console errors', ours.length === 0, ours.join(' | ').slice(0, 300))

  // ── Scenario 2: the "stranger with a link" path — NO ?sim, geolocation
  // denied (headless default). The hunt must stay demoable via the visible
  // demo-flight button. This is the exact flow that used to dead-end on Cold.
  const page2 = await browser.newPage({viewport: {width: 390, height: 844}})
  const prodUrl = BASE.replace(/[?&](sim|simulate)=?/, '').replace(/\?$/, '')
  await page2.goto(prodUrl, {waitUntil: 'domcontentloaded'})
  try {
    await page2.click('#start-button')
    await page2.waitForFunction(() => !document.getElementById('screen-hunt').classList.contains('hidden'))
    // No fix yet (permission denied fast) → honest waiting state or retry prompt,
    // and the demo entry must be reachable either way.
    await page2.waitForSelector('#demo-hunt-btn', {state: 'visible', timeout: 12000})
    check('prod: demo-flight entry visible without ?sim', true)
    const label = await page2.textContent('#signal-label')
    check(
      'prod: honest no-fix signal state',
      label?.includes('···') || (await page2.locator('#gps-error-btn').isVisible()),
      label ?? '',
    )

    await page2.click('#demo-hunt-btn')
    await page2.waitForFunction(() => !document.getElementById('demo-chip').classList.contains('hidden'))
    check('prod: demo chip shown', true)
    await page2.waitForFunction(
      () => document.getElementById('signal-label').textContent.includes("You’re close"),
      null,
      {timeout: 20000},
    )
    check('prod: demo flight walks signal to a set', true)
    check('prod: open-camera CTA appears from demo', await page2.locator('#open-ar-btn').isVisible())
    check('prod: sim rail available for demos', !(await hidden(page2, '#sim-rail')))
  } catch (err) {
    check('prod demo flight completed', false, String(err))
  } finally {
    await page2.close()
  }
} catch (err) {
  check('e2e script completed', false, String(err))
} finally {
  await browser.close()
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)