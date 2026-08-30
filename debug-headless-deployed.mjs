import {chromium} from 'playwright'
const url = 'https://0726b763.campus-ar.pages.dev/?sim&debug'
console.log('Testing', url)
const browser = await chromium.launch()
const page = await browser.newPage({viewport:{width:390,height:844}})
page.on('console', m=> console.log('console:', m.type(), m.text()))
page.on('pageerror', e=> console.log('pageerror', e.message))
await page.goto(url, {waitUntil:'domcontentloaded'})
console.log('goto done, title', await page.title())
await page.click('#start-button')
await page.waitForFunction(()=> !document.getElementById('ar-chrome').classList.contains('hidden'), null, {timeout:8000})
console.log('AR chrome shown')
// For demo flight via start, it auto jumps to mind-studio after 350ms, but also test manual jump
await page.waitForTimeout(1200)
await page.evaluate(()=> window.__campushunt && window.__campushunt.jump('mind-studio'))
console.log('jumped')
await page.waitForFunction(()=> {
  const l = document.getElementById('signal-label')?.textContent || ''
  const w = document.getElementById('ar-signal-word')?.textContent || ''
  return l.includes("You’re close") || w.includes("YOU’RE CLOSE")
}, null, {timeout:8000})
console.log('HOT', await page.textContent('#signal-label'), await page.textContent('#ar-signal-word'))
await page.waitForTimeout(2000)
const videos = await page.evaluate(()=>{
  return Array.from(document.querySelectorAll('video')).map(v=> ({
    id: v.id||'no-id',
    src: v.src.slice(-50),
    readyState: v.readyState,
    paused: v.paused,
    error: v.error ? `${v.error.code} ${v.error.message}` : null,
    networkState: v.networkState,
    currentSrc: v.currentSrc.slice(-50),
    crossOrigin: v.crossOrigin,
    hasSrc: !!v.src,
  }))
})
console.log('videos', JSON.stringify(videos, null, 2))
const portalDbg = await page.evaluate(()=>{
  const el = document.getElementById('portal-debug')
  const txt = document.getElementById('portal-debug-text')
  return {hidden: el?.classList.contains('hidden'), text: txt?.textContent, html: el?.innerHTML?.slice(0,300)}
})
console.log('portal-debug', portalDbg)
const info = await page.evaluate(()=>{
  const xr = window.XR8
  if(!xr) return 'no XR8'
  const scene = xr.Threejs?.xrScene?.()?.scene
  if(!scene) return 'no scene'
  const out=[]
  scene.traverse(o=>{
    if(o.isMesh && o.material?.map){
      out.push({
        geo: o.geometry.type,
        vis: o.visible,
        parentVis: o.parent?.visible,
        op: o.material.opacity.toFixed(2),
        map: o.material.map.image?.src?.slice(-30) || o.material.map.uuid.slice(0,8),
        world: (()=>{ const v=new window.THREE.Vector3(); o.getWorldPosition(v); return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`})()
      })
    }
  })
  return out
})
console.log('meshes with map', JSON.stringify(info, null, 2))
const net = await page.evaluate(async ()=>{
  try {
    const r = await fetch('https://campus-ar-clips-204685625918-ap-south-1.s3.ap-south-1.amazonaws.com/clips/mind-studio.mp4', {method:'HEAD'})
    return {status: r.status, headers: Object.fromEntries([...r.headers.entries()].filter(([k])=> k.toLowerCase().includes('content') || k.toLowerCase().includes('access')))}
  } catch(e){ return {error: String(e)}}
})
console.log('S3 HEAD', net)
await page.screenshot({path:'/tmp/headless-deployed.png'})
console.log('screenshot /tmp/headless-deployed.png')
await browser.close()
