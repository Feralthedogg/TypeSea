<script lang="ts">
    import DocumentPage from '$lib/components/docs/DocumentPage.svelte';
    import English from '$lib/generated/content/en/readme.md';
    import Korean from '$lib/generated/content/ko/readme.md';
    import { currentLocale } from '$lib/navigation';

    const Content = $derived(currentLocale() === 'ko' ? Korean : English);
</script>

<DocumentPage slug="readme" content={Content} />
