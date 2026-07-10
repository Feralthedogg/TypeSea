<script lang="ts">
    import DocumentPage from '$lib/components/docs/DocumentPage.svelte';
    import English from '$lib/generated/content/en/engine.md';
    import Korean from '$lib/generated/content/ko/engine.md';
    import { currentLocale } from '$lib/navigation';

    const Content = $derived(currentLocale() === 'ko' ? Korean : English);
</script>

<DocumentPage slug="engine" content={Content} />
