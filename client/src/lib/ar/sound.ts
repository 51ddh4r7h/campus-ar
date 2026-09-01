/**
 * The sound of the place.
 *
 * Two jobs. First, the clip's own audio is routed through a panner sitting
 * where the screen is, so it arrives from the screen's direction — turn away
 * and it moves behind you. That single trick does more for believing there is
 * a screen in front of you than any amount of geometry.
 *
 * Second, the projector's own noise: a lamp hum and the clatter of a running
 * reel. Both are synthesised rather than shipped — a few oscillators and a
 * noise buffer cost nothing to download, never 404, and can follow the
 * assembly rather than being a fixed-length file that has to be timed to it.
 *
 * Everything degrades to silence. A blocked AudioContext, a device that
 * refuses to expose the media element, an older browser without HRTF — none of
 * those should cost the player their scene.
 */

export interface ArSound {
  /** Move the listener. `yaw` is the camera's heading in radians. */
  setListener(yaw: number): void
  /** 0-1 — how far the projector has spun up. Drives hum and reel volume. */
  setRunning(level: number): void
  /** The shutter snap as the picture lands. */
  lock(): void
  dispose(): void
}

/** Older WebKit still only exposes the prefixed constructor. */
interface LegacyAudioWindow {
  webkitAudioContext?: typeof AudioContext
}

/** One AudioContext per document; browsers cap how many you may create. */
let ctx: AudioContext | null = null
/** A media element may only ever be captured once, so remember the capture. */
const captured = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

function audioContext(): AudioContext | null {
  if (ctx) return ctx
  const legacy = window as unknown as LegacyAudioWindow
  const Ctor = window.AudioContext ?? legacy.webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

/** A second of white noise, reused for both the hum bed and the reel clatter. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

const silent: ArSound = {
  setListener() {},
  setRunning() {},
  lock() {},
  dispose() {},
}

export function createArSound(video: HTMLVideoElement, screenAt: {x: number; z: number}): ArSound {
  const ac = audioContext()
  if (!ac) return silent

  try {
    void ac.resume()

    // ---- the clip, placed where the screen is --------------------------
    const panner = new PannerNode(ac, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 2.2,
      rolloffFactor: 0.7,
      coneInnerAngle: 360,
      positionX: screenAt.x,
      positionY: 0,
      positionZ: screenAt.z,
    })
    panner.connect(ac.destination)

    let src = captured.get(video)
    if (!src) {
      src = ac.createMediaElementSource(video)
      captured.set(video, src)
    }
    // Capturing an element silences its own output, so the graph must carry it.
    src.connect(panner)

    // ---- the projector -------------------------------------------------
    const machine = new GainNode(ac, {gain: 0})
    machine.connect(ac.destination)

    // Lamp hum: a low tone plus filtered noise, the way a transformer sounds.
    const hum = new OscillatorNode(ac, {type: 'sawtooth', frequency: 51})
    const humFilter = new BiquadFilterNode(ac, {type: 'lowpass', frequency: 190, Q: 5})
    const humGain = new GainNode(ac, {gain: 0.05})
    hum.connect(humFilter).connect(humGain).connect(machine)
    hum.start()

    const bed = new AudioBufferSourceNode(ac, {buffer: noiseBuffer(ac), loop: true})
    const bedFilter = new BiquadFilterNode(ac, {type: 'bandpass', frequency: 620, Q: 0.8})
    const bedGain = new GainNode(ac, {gain: 0.014})
    bed.connect(bedFilter).connect(bedGain).connect(machine)
    bed.start()

    const listener = ac.listener
    let disposed = false

    /** A short filtered noise burst — one tooth of the reel passing the gate. */
    const clatter = (at: number, gain: number): void => {
      const s = new AudioBufferSourceNode(ac, {buffer: noiseBuffer(ac)})
      const f = new BiquadFilterNode(ac, {type: 'bandpass', frequency: 1500, Q: 3})
      const g = new GainNode(ac, {gain: 0})
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(gain, at + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
      s.connect(f).connect(g).connect(machine)
      s.start(at, 0, 0.06)
      s.stop(at + 0.07)
    }

    // The reel runs at a steady rate; schedule a little ahead of the clock so
    // the rhythm never depends on a frame arriving on time.
    let nextTick = ac.currentTime + 0.1
    let running = 0
    const reel = setInterval(() => {
      if (disposed || running < 0.05) return
      const horizon = ac.currentTime + 0.35
      while (nextTick < horizon) {
        clatter(nextTick, 0.05 * running)
        nextTick += 0.125
      }
      if (nextTick < ac.currentTime) nextTick = ac.currentTime + 0.1
    }, 200)

    return {
      setListener(yaw) {
        // The listener stands at the origin looking along -Z, turned by yaw.
        const fx = -Math.sin(yaw)
        const fz = -Math.cos(yaw)
        if (listener.forwardX) {
          listener.forwardX.value = fx
          listener.forwardZ.value = fz
          listener.upY.value = 1
        } else {
          listener.setOrientation(fx, 0, fz, 0, 1, 0)
        }
      },

      setRunning(level) {
        running = Math.max(0, Math.min(1, level))
        machine.gain.setTargetAtTime(running * 0.9, ac.currentTime, 0.25)
      },

      lock() {
        const at = ac.currentTime
        clatter(at, 0.22)
        clatter(at + 0.06, 0.12)
      },

      dispose() {
        disposed = true
        clearInterval(reel)
        try {
          hum.stop()
          bed.stop()
          src.disconnect()
          machine.disconnect()
          panner.disconnect()
        } catch {
          // Already torn down — nothing to recover.
        }
      },
    }
  } catch {
    return silent
  }
}
