<script lang="ts">
  import {camera} from '../stores/camera.svelte'

  let video = $state<HTMLVideoElement | null>(null)

  $effect(() => {
    if (video && camera.stream) {
      video.srcObject = camera.stream
      void video.play().catch(() => {})
    }
    // Photo mode composites from this element, not from the stream.
    camera.videoEl = video
    return () => {
      if (camera.videoEl === video) camera.videoEl = null
    }
  })
</script>

<div class="feed" aria-hidden="true">
  {#if camera.stream}
    <video bind:this={video} autoplay muted playsinline></video>
  {:else}
    <div class="placeholder"></div>
  {/if}
  <div class="grade"></div>
  <div class="vignette"></div>
</div>

<style>
  .feed {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    background: #000;
  }
  video,
  .placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .placeholder {
    background: radial-gradient(120% 80% at 50% 0%, #1c2430 0%, #0c0f13 60%, #08090b 100%);
  }
  /* film grain only — the warm bias on top of it was tinting the whole world
     orange once the AR bloom was in front of it too */
  .grade {
    position: absolute;
    inset: 0;
    mix-blend-mode: overlay;
    opacity: 0.22;
    background:
      linear-gradient(0deg, rgba(232, 165, 76, 0.02), rgba(232, 165, 76, 0.02)),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  }
  .vignette {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 180px 50px rgba(0, 0, 0, 0.5);
  }
  @media (prefers-reduced-transparency: reduce) {
    .grade {
      display: none;
    }
  }
</style>
