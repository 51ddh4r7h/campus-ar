#!/usr/bin/env node
/**
 * S3 clip uploader — ap-south-1 (Mumbai) for Campus Film Hunt.
 * Bucket: campus-ar-clips-204685625918-ap-south-1 (already public, CORS * , Cache-Control immutable)
 * Usage:
 *   node scripts/upload-clips-s3.mjs                    # uploads public/clips/*
 *   TRANSCODE=1 node scripts/upload-clips-s3.mjs        # first transcode movie clips/*.mov → public/clips/*.mp4
 */
import {readdirSync, statSync, existsSync} from 'node:fs'
import {join} from 'node:path'
import {execSync} from 'node:child_process'

const BUCKET = 'campus-ar-clips-204685625918-ap-south-1'
const REGION = 'ap-south-1'
const DIR = 'public/clips'
const SRC_DIR = 'movie clips'

if (process.env.TRANSCODE === '1' && existsSync(SRC_DIR)) {
  const FFMPEG = execSync(`node -e "console.log(require('ffmpeg-static'))"`, {encoding: 'utf8'}).trim()
  for (const f of readdirSync(SRC_DIR).filter(x => x.endsWith('.mov'))) {
    const id = f.toLowerCase().includes('zindagi') ? 'amphitheatre' : f.replace(/\.[^.]+$/, '').replace(/\s+/g, '-').toLowerCase()
    const src = join(SRC_DIR, f)
    const dst = join(DIR, `${id}.mp4`)
    const poster = join(DIR, `${id}-poster.jpg`)
    console.log(`→ Transcoding ${f} → ${id}.mp4 (1280x536 crf28)`)
    execSync(`${FFMPEG} -y -i "${src}" -vf "scale=1280:536:flags=lanczos" -c:v libx264 -profile:v high -level 4.0 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k -ar 48000 -t 10 "${dst}"`, {stdio: 'inherit'})
    execSync(`${FFMPEG} -y -ss 0.8 -i "${dst}" -frames:v 1 -vf "scale=640:268:flags=lanczos" -q:v 2 "${poster}"`, {stdio: 'inherit'})
  }
}

const files = existsSync(DIR) ? readdirSync(DIR).filter(f => statSync(join(DIR, f)).isFile()) : []
if (files.length === 0) {
  console.error(`No files in ${DIR} — drop a clip in "movie clips/" and run with TRANSCODE=1`)
  process.exit(1)
}
for (const file of files) {
  const path = join(DIR, file)
  const ext = file.split('.').pop().toLowerCase()
  const ct = ext === 'mp4' ? 'video/mp4' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webm' ? 'video/webm' : 'application/octet-stream'
  const key = `clips/${file}`
  const size = (statSync(path).size/1024/1024).toFixed(2)
  console.log(`\n→ ${file} (${size}MB) → s3://${BUCKET}/${key}`)
  execSync(`aws s3 cp "${path}" s3://${BUCKET}/${key} --region ${REGION} --content-type "${ct}" --cache-control "public, max-age=31536000, immutable"`, {stdio: 'inherit'})
}
console.log(`\nDone. Test: curl -I https://${BUCKET}.s3.${REGION}.amazonaws.com/clips/amphitheatre.mp4`)
console.log(`Wire: spots.ts S3_CLIPS already points there.`)
// Optional CloudFront note:
// For true CDN (edge cache Mumbai/Delhi/Chennai) create CloudFront distro with origin s3://BUCKET, TTL 31536000, compress.
