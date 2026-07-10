<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        readonly children: Snippet;
    }

    let { children }: Props = $props();
</script>

<article class="doc-article">
    {@render children()}
</article>
