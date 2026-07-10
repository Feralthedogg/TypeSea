<script lang="ts">
    import Moon from '@lucide/svelte/icons/moon';
    import Sun from '@lucide/svelte/icons/sun';
    import { onMount } from 'svelte';
    import { Button } from '$lib/components/ui/button';
    import * as m from '$lib/paraglide/messages';

    type Theme = 'light' | 'dark';

    let theme = $state<Theme>('light');

    onMount(() => {
        const stored = window.localStorage.getItem('typesea-docs-theme');
        const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
        theme = stored === 'dark' || stored === 'light' ? stored : preferred;
        applyTheme(theme);
    });

    function toggleTheme() {
        theme = theme === 'dark' ? 'light' : 'dark';
        window.localStorage.setItem('typesea-docs-theme', theme);
        applyTheme(theme);
    }

    function applyTheme(next: Theme) {
        document.documentElement.classList.toggle('dark', next === 'dark');
        document.documentElement.style.colorScheme = next;
    }
</script>

<Button
    class="header-icon"
    variant="ghost"
    size="icon"
    onclick={toggleTheme}
    aria-label={theme === 'dark' ? m.theme_light() : m.theme_dark()}
    title={m.switch_theme()}
>
    {#if theme === 'dark'}
        <Sun class="size-4" aria-hidden="true" />
    {:else}
        <Moon class="size-4" aria-hidden="true" />
    {/if}
</Button>
