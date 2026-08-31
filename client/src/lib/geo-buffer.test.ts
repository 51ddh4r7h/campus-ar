import {describe, expect, it} from 'vitest'
import type {GeoSample} from '@cmh/shared'
import {recentSamples, trimBuffer} from './geo-buffer'
import {isInAppBrowser} from './env'

const at = (tsMs: number): GeoSample => ({lat: 18.5, lng: 73.7, accuracyM: 5, tsMs, simulated: false})

describe('geo-buffer', () => {
  it('trims samples older than the window', () => {
    const now = 100_000
    const kept = trimBuffer([at(30_000), at(50_000), at(95_000), at(100_000)], now, 60_000)
    expect(kept.map((s) => s.tsMs)).toEqual([50_000, 95_000, 100_000])
  })

  it('recentSamples takes the last 30s by default', () => {
    const now = 100_000
    const r = recentSamples([at(60_000), at(69_999), at(70_000), at(100_000)], now)
    expect(r.map((s) => s.tsMs)).toEqual([70_000, 100_000])
  })

  it('never mutates the input', () => {
    const input = [at(1), at(2)]
    trimBuffer(input, 100, 10)
    recentSamples(input, 100)
    expect(input).toHaveLength(2)
  })
})

describe('isInAppBrowser', () => {
  it('flags common in-app webviews', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) ... Instagram 300.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android) ... [FB_IAB/FB4A;FBAV/...]')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 ... MicroMessenger/8.0')).toBe(true)
  })
  it('passes real browsers', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) ... Version/17.0 Mobile Safari')).toBe(false)
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14) ... Chrome/120.0 Mobile Safari')).toBe(false)
  })
})
