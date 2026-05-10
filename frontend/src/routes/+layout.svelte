<script lang="ts">
  import { page } from '$app/stores';
  import '../app.css';

  let { children } = $props();
  const isWorkspace = $derived($page.url.pathname.startsWith('/workspace/'));
</script>

<div class={isWorkspace ? 'flex h-screen flex-col overflow-hidden' : 'flex min-h-screen flex-col'}>
  <main class={isWorkspace ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10'}>
    {@render children()}
  </main>
</div>
