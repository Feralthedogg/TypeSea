<script lang="ts">
    import type { PageProps } from './$types';
    import LandingPage from '$lib/components/docs/LandingPage.svelte';

    let { data }: PageProps = $props();
</script>

<LandingPage codeExamples={data.codeExamples} />
