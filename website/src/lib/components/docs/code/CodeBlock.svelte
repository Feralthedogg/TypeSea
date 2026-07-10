<script lang="ts">
    import CopyCodeButton from './CopyCodeButton.svelte';

    interface Props {
        readonly html: string;
        readonly source: string;
    }

    let { html, source }: Props = $props();
</script>

<div data-slot="code-block" class="code-block showcase-code syntax-highlight">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Shiki renders repository-owned literals during prerendering. -->
    {@html html}
    <CopyCodeButton text={source} />
</div>
