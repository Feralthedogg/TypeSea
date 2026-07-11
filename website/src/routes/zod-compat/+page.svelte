<script lang="ts">
    import DocumentPage from '$lib/components/docs/DocumentPage.svelte';
    import English from '$lib/generated/content/en/zod-compat.md';
    import Korean from '$lib/generated/content/ko/zod-compat.md';
    import { currentLocale } from '$lib/navigation';

    const Content = $derived(currentLocale() === 'ko' ? Korean : English);
</script>

<DocumentPage slug="zod-compat" content={Content} />
