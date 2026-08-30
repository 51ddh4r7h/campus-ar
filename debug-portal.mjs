import {chromium} from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({viewport:{width:390,height:844}})
page.on('console', m=> console.log('console:', m.text()))
await page.goto('http://127.0.0.1:5173/?sim', {waitUntil:'domcontentloaded'})
await page.click('#start-button')
await page.waitForFunction(()=> !document.getElementById('ar-chrome').classList.contains('hidden'))
console.log('AR chrome shown')
await page.evaluate(()=> window.__campushunt.jump('mind-studio'))
await page.waitForFunction(()=> document.getElementById('signal-label').textContent.includes("You’re close") || document.getElementById('ar-signal-word').textContent.includes("YOU’RE CLOSE"), null, {timeout:8000})
console.log('HOT reached')
console.log('signal-label', await page.textContent('#signal-label'))
console.log('ar-signal-word', await page.textContent('#ar-signal-word'))
await page.waitForTimeout(1500)
const videos = await page.evaluate(()=>{
  const vids = Array.from(document.querySelectorAll('video')).map(v=> ({
    id: v.id||'no-id',
    src: v.src.slice(-30),
    fullSrc: v.src,
    poster: v.poster?.slice(-30),
    readyState: v.readyState,
    paused: v.paused,
    error: v.error?.message||null,
    hidden: v.classList.contains('hidden'),
    display: v.style.display,
    preload: v.preload,
    networkState: v.networkState,
  }))
  return vids
})
console.log('videos', JSON.stringify(videos, null, 2))
const portalInfo = await page.evaluate(async ()=>{
  const xr = window.XR8
  if (!xr) return 'no XR8'
  try {
    const scene = xr.Threejs?.xrScene?.()?.scene
    if (!scene) return 'no scene'
    const meshes = []
    scene.traverse(o=> { if(o.isMesh && o.material) meshes.push({type: o.geometry?.type, visible: o.visible, opacity: o.material.opacity, hasMap: !!o.material.map}) })
    return {meshes: meshes.slice(0,6), count: meshes.length}
  } catch(e){ return 'err '+String(e)}
})
console.log('portalInfo', JSON.stringify(portalInfo, null, 2))
await page.screenshot({path:'/tmp/debug-portal.png'})
console.log('screenshot /tmp/debug-portal.png')
await browser.close()
