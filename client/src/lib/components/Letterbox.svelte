<script lang="ts">
  import type {Snippet} from 'svelte'
  const {glow = false, children}: {glow?: boolean; children: Snippet} = $props()
</script>

<div class="frame" class:glow>
  {@render children()}
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    aspect-ratio: 2.39 / 1;
    border-radius: 14px;
    overflow: hidden;
    background: #000;
  }
  .glow {
    box-shadow:
      0 0 0 1px var(--hairline),
      0 12px 48px rgba(232, 165, 76, 0.18);
  }
  .frame :global(img),
  .frame :global(video) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
