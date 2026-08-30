import {chromium} from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({viewport:{width:390,height:844}})
page.on('console', m=> console.log('console:', m.text()))
const url = 'https://campus-ar.pages.dev/?sim'
console.log('goto', url)
await page.goto(url, {waitUntil:'domcontentloaded'})
await page.click('#start-button')
await page.waitForFunction(()=> !document.getElementById('ar-chrome').classList.contains('hidden'), null, {timeout:8000})
console.log('AR shown')
await page.evaluate(()=> window.__campushunt.jump('mind-studio'))
await page.waitForFunction(()=> document.getElementById('signal-label')?.textContent.includes("You’re close") || document.getElementById('ar-signal-word')?.textContent.includes("YOU’RE CLOSE"), null, {timeout:8000})
console.log('HOT', await page.textContent('#signal-label'), await page.textContent('#ar-signal-word'))
await page.waitForTimeout(1500)
const vids = await page.evaluate(()=>{
  return Array.from(document.querySelectorAll('video')).map(v=> ({
    id: v.id||'no-id',
    src: v.src.slice(-40),
    ready: v.readyState,
    paused: v.paused,
    err: v.error?.message||null,
    hidden: v.classList.contains('hidden'),
  }))
})
console.log('videos', JSON.stringify(vids, null, 2))
const dbg = await page.evaluate(()=>{
  const el = document.getElementById('portal-debug')
  const txt = document.getElementById('portal-debug-text')
  return {hidden: el?.classList.contains('hidden'), text: txt?.textContent?.slice(0,120)}
})
console.log('portal-debug', dbg)
const info = await page.evaluate(()=>{
  const xr = window.XR8
  const scene = xr?.Threejs?.xrScene?.()?.scene
  if(!scene) return 'no scene'
  let found=null
  scene.traverse(o=>{
    if(o.isMesh && o.geometry?.type==='PlaneGeometry' && o.material?.map){
      found={vis:o.visible, parentVis:o.parent?.visible, op:o.material.opacity, hasMap:!!o.material.map, world: (()=>{const v=new THREE.Vector3(); o.getWorldPosition(v); return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`})()}
    }
  })
  return found || 'no plane'
})
console.log('portal mesh', info)
await page.screenshot({path:'/tmp/deployed-debug.png'})
console.log('screenshot /tmp/deployed-debug.png')
await browser.close()
