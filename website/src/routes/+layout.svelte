<script lang="ts">
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import MobileNavigation from '$lib/components/docs/MobileNavigation.svelte';
    import SearchDialog from '$lib/components/docs/SearchDialog.svelte';
    import Sidebar from '$lib/components/docs/Sidebar.svelte';
    import SiteHeader from '$lib/components/docs/SiteHeader.svelte';
    import { TooltipProvider } from '$lib/components/ui/tooltip';
    import * as m from '$lib/paraglide/messages';

    let { children } = $props();
    let mobileNavigationOpen = $state(false);
    let searchOpen = $state(false);
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

<TooltipProvider>
    <a class="skip-link" href="#main-content">{m.skip_to_content()}</a>
    <SiteHeader
        onOpenMenu={() => (mobileNavigationOpen = true)}
        onOpenSearch={() => (searchOpen = true)}
    />
    <div class="site-frame">
        <div class="desktop-sidebar">
            <Sidebar />
        </div>
        <main id="main-content">
            {@render children()}
        </main>
    </div>
    <MobileNavigation bind:open={mobileNavigationOpen} />
    <SearchDialog bind:open={searchOpen} />
</TooltipProvider>
