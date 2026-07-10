<script lang="ts">
    interface Props {
        readonly html: string;
    }

    let { html }: Props = $props();
</script>

<div class="showcase-code syntax-highlight">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Shiki renders repository-owned literals during prerendering. -->
    {@html html}
</div>
