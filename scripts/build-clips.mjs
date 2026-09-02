#!/usr/bin/env node
/**
 * Turn the master-sheet clips into web clips.
 *
 * The sources are 4K (3840x2160) H.264, three to nine seconds each — about
 * 122MB for twelve. That is roughly ten times what a phone needs and, at a
 * cohort of 200 pulling five clips each, the difference between a few hundred
 * megabytes and ten gigabytes across campus wifi at the same moment. 4K also
 * costs decode power on a mid-range phone, which shows up as a stuttering
 * reveal rather than as a download.
 *
 * Two things this deliberately does NOT do:
 *
 * 1. It does not crop to the 2.39:1 of the AR screen. The sources are already
 *    reframed to a full 16:9 with no letterbox — a centre crop would cut real
 *    composition out of them (the birthday cake in the Symbi Eat shot sits in
 *    the bottom of the frame). Instead the picture is scaled to fit and the
 *    remainder padded, so it reaches the screen at its own shape, undistorted.
 *    Reshaping the AR screen to 16:9 would be better still and would use the
 *    whole width; that is a change to stage.ts, not to this file.
 *
 * 2. It does not re-encode the container blindly. `behind ssbf` arrives as
 *    .MOV; Chrome on Android is unreliable with QuickTime containers even when
 *    the codec inside is H.264, and that failure surfaces as MEDIA_ERR_SRC_
 *    NOT_SUPPORTED — indistinguishable from a missing file. Everything comes
 *    out as .mp4 with faststart so it plays and starts streaming immediately.
 *
 * Usage:
 *   node scripts/build-clips.mjs            # fetch from S3, transcode
 *   node scripts/build-clips.mjs --local    # transcode from ./movie clips/
 */

import {execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, writeFileSync, statSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'

const require = createRequire(import.meta.url)
const FFMPEG = require('ffmpeg-static')

const S3 = 'https://campus-ar-clips-204685625918-ap-south-1.s3.ap-south-1.amazonaws.com/clips'
const OUT = 'client/public/clips'
const WORK = '.clip-src'

/** Screen shape the AR stage renders into. Output is padded to this. */
const W = 1280
const H = 536

/**
 * Master-sheet key → the location id in shared/src/content.ts.
 *
 * The sheet's names are freehand ("SmbiEat crop.mp4", mixed case, spaces) so
 * the mapping is written out rather than derived. The three parked locations
 * are here too: their clips are fine, it is only the geofencing that cannot
 * separate them from a neighbour, so a re-survey should not also mean
 * re-deriving this.
 */
const CLIPS = [
  ['behind ssbf crop.MOV', 'behind-ssbf'],
  ['sibm crop.mp4', 'sibm'],
  ['sidtm admin office crop.mp4', 'sidtm-admin'],
  ['auditorium crop.mp4', 'auditorium'],
  ['fountain crop.mp4', 'fountain'],
  ['library crop.mp4', 'library'],
  ['Amphitheatre crop.mp4', 'amphitheatre'],
  ['SmbiEat crop.mp4', 'symbieat'],
  ['outside C hall crop.mp4', 'outside-c-hall'],
  // Parked in content.ts — built anyway, so bringing one back is a one-line change.
  ['xerox crop.mp4', 'xerox'],
  ['behind amphi crop.MOV', 'behind-amphi'],
  ['SIU admin office crop.mp4', 'siu-admin'],
]

const ff = (args) => execFileSync(FFMPEG, args, {stdio: ['ignore', 'ignore', 'pipe']})
const mb = (p) => (statSync(p).size / 1e6).toFixed(1)

mkdirSync(OUT, {recursive: true})
mkdirSync(WORK, {recursive: true})

let inBytes = 0
let outBytes = 0

for (const [key, id] of CLIPS) {
  const ext = key.slice(key.lastIndexOf('.'))
  const src = join(WORK, id + ext)

  if (!existsSync(src)) {
    const url = `${S3}/${encodeURIComponent(key)}`
    process.stdout.write(`fetching ${id} … `)
    const res = await fetch(url)
    if (!res.ok) {
      console.log(`FAILED ${res.status} — ${url}`)
      continue
    }
    writeFileSync(src, Buffer.from(await res.arrayBuffer()))
    console.log(`${mb(src)} MB`)
  }

  const clip = join(OUT, `${id}.mp4`)
  const poster = join(OUT, `${id}-poster.jpg`)

  // Fit inside the frame, pad the rest. `force_original_aspect_ratio=decrease`
  // is what keeps the picture its own shape instead of stretching it.
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`

  ff(['-y', '-i', src, '-vf', fit, '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0',
      '-crf', '26', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', clip])

  // A frame from a little way in: frame zero is often a fade from black.
  ff(['-y', '-ss', '0.8', '-i', clip, '-frames:v', '1', '-vf', `scale=${W / 2}:-1`, '-q:v', '3', poster])

  inBytes += statSync(src).size
  outBytes += statSync(clip).size + statSync(poster).size
  console.log(`  ${id.padEnd(16)} ${mb(src).padStart(6)} MB → ${mb(clip).padStart(5)} MB + poster`)
}

console.log(
  `\n${(inBytes / 1e6).toFixed(0)} MB in → ${(outBytes / 1e6).toFixed(1)} MB out ` +
    `(${(outBytes / inBytes * 100).toFixed(0)}% of source)`,
)
console.log(`Sources cached in ${WORK}/ — gitignored, delete to re-fetch.`)
