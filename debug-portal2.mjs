import {chromium} from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({viewport:{width:390,height:844}})
await page.goto('http://127.0.0.1:5173/?sim', {waitUntil:'domcontentloaded'})
await page.click('#start-button')
await page.waitForFunction(()=> !document.getElementById('ar-chrome').classList.contains('hidden'))
await page.evaluate(()=> window.__campushunt.jump('mind-studio'))
await page.waitForFunction(()=> document.getElementById('signal-label').textContent.includes("You’re close"), null, {timeout:8000})
await page.waitForTimeout(1800)
const info = await page.evaluate(()=>{
  const xr = window.XR8
  const scene = xr.Threejs.xrScene().scene
  const out=[]
  scene.traverse(o=>{
    if(o.isMesh){
      const mat = o.material
      const hasMap = !!mat.map
      const mapSrc = mat.map?.image?.currentSrc || mat.map?.image?.src || mat.map?.uuid || ''
      out.push({
        name: o.name||o.type,
        geo: o.geometry.type,
        visible: o.visible,
        parentVisible: o.parent?.visible,
        opacity: mat.opacity,
        hasMap,
        mapSrc: String(mapSrc).slice(-40),
        pos: `${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)}`,
        worldPos: (()=>{ const v=new THREE.Vector3(); o.getWorldPosition(v); return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`})(),
        scale: o.scale.x.toFixed(2)
      })
    }
    if(o.isGroup && o.children.length>0){
      // check group
    }
  })
  const groups=[]
  scene.traverse(o=>{
    if(o.isGroup && o.children.some(c=>c.isMesh && c.geometry?.type==='PlaneGeometry')){
      groups.push({vis:o.visible, pos:`${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)}`, rot:`${o.rotation.x.toFixed(2)},${o.rotation.y.toFixed(2)}`, scale:o.scale.x.toFixed(2), children:o.children.length})
    }
  })
  return {meshes:out.filter(m=>m.hasMap), groups, total: out.length}
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({path:'/tmp/debug2.png'})
console.log('screenshot /tmp/debug2.png')
await browser.close()
