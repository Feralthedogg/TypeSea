<script lang="ts">
    import DocumentPage from '$lib/components/docs/DocumentPage.svelte';
    import English from '$lib/generated/content/en/aot.md';
    import Korean from '$lib/generated/content/ko/aot.md';
    import { currentLocale } from '$lib/navigation';

    const Content = $derived(currentLocale() === 'ko' ? Korean : English);
</script>

<DocumentPage slug="aot" content={Content} />
