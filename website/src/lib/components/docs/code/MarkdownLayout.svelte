<script module>
    export { default as pre } from './MarkdownPre.svelte';
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';

    let { children }: { children?: Snippet } = $props();
</script>

{@render children?.()}
