<script lang="ts">
</script>

<div class="splash">
  <h1>Campus<br />Movie&nbsp;Hunt</h1>
  <div class="rule"></div>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    background: var(--bg);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(2.4rem, 11vw, 3.4rem);
    line-height: 1;
    text-align: center;
    margin: 0;
    animation: fade 0.6s ease both;
  }
  .rule {
    width: 0;
    height: 2px;
    background: var(--amber);
    animation: draw 0.7s var(--ease-spring) 0.3s forwards;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes draw {
    to {
      width: 120px;
    }
  }
</style>