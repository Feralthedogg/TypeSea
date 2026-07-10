<script lang="ts">
    import DocumentPage from '$lib/components/docs/DocumentPage.svelte';
    import English from '$lib/generated/content/en/seabreeze.md';
    import Korean from '$lib/generated/content/ko/seabreeze.md';
    import { currentLocale } from '$lib/navigation';

    const Content = $derived(currentLocale() === 'ko' ? Korean : English);
</script>

<DocumentPage slug="seabreeze" content={Content} />
