<script lang="ts">
    import GitBranch from '@lucide/svelte/icons/git-branch';
    import Menu from '@lucide/svelte/icons/menu';
    import Search from '@lucide/svelte/icons/search';
    import { Button } from '$lib/components/ui/button';
    import { localizedPath } from '$lib/navigation';
    import { site } from '$lib/content/catalog';
    import * as m from '$lib/paraglide/messages';
    import LanguageSwitcher from './LanguageSwitcher.svelte';
    import ThemeToggle from './ThemeToggle.svelte';

    interface Props {
        readonly onOpenMenu: () => void;
        readonly onOpenSearch: () => void;
    }

    let { onOpenMenu, onOpenSearch }: Props = $props();
</script>

<header class="site-header">
    <div class="header-inner">
        <div class="header-leading">
            <Button
                class="mobile-menu-button header-icon"
                variant="ghost"
                size="icon"
                onclick={onOpenMenu}
                aria-label={m.open_menu()}
                title={m.open_menu()}
            >
                <Menu class="size-4" aria-hidden="true" />
            </Button>
            <a class="brand-link" href={localizedPath('/')} aria-label={m.home()}>
                <span class="brand-mark" aria-hidden="true">T</span>
                <span>TypeSea</span>
                <span class="brand-version">v{site.version}</span>
            </a>
            <nav class="header-nav" aria-label={m.navigation()}>
                <a href={localizedPath('/readme/')}>{m.readme()}</a>
                <a href={localizedPath('/api/')}>{m.api_reference()}</a>
                <a href={localizedPath('/seaflow/')}>SeaFlow</a>
            </nav>
        </div>

        <div class="header-actions">
            <button
                class="search-trigger"
                type="button"
                onclick={onOpenSearch}
                aria-label={m.search()}
                title={m.search()}
            >
                <Search class="size-4" aria-hidden="true" />
                <span>{m.search()}</span>
                <kbd>⌘K</kbd>
            </button>
            <LanguageSwitcher />
            <ThemeToggle />
            <Button
                class="header-icon github-button"
                variant="ghost"
                size="icon"
                href="https://github.com/Feralthedogg/TypeSea"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                title="GitHub"
            >
                <GitBranch class="size-4" aria-hidden="true" />
            </Button>
        </div>
    </div>
</header>
