<script lang="ts">
    import { page } from '$app/state';
    import { currentLocale, localeSwitchPath } from '$lib/navigation';
    import * as m from '$lib/paraglide/messages';

    const locale = $derived(currentLocale());
</script>

<nav class="language-switcher" aria-label={m.language()}>
    <a
        href={localeSwitchPath(page.url.pathname, 'en')}
        class:active={locale === 'en'}
        aria-current={locale === 'en' ? 'page' : undefined}
        data-sveltekit-reload
    >
        EN
        <span class="sr-only">{m.english()}</span>
    </a>
    <a
        href={localeSwitchPath(page.url.pathname, 'ko')}
        class:active={locale === 'ko'}
        aria-current={locale === 'ko' ? 'page' : undefined}
        data-sveltekit-reload
    >
        KO
        <span class="sr-only">{m.korean()}</span>
    </a>
</nav>
