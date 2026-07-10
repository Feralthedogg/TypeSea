<script lang="ts">
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import SearchDialog from '$lib/components/docs/SearchDialog.svelte';
    import Sidebar from '$lib/components/docs/Sidebar.svelte';
    import SiteHeader from '$lib/components/docs/SiteHeader.svelte';
    import * as LilySidebar from '$lib/components/ui/sidebar';
    import * as m from '$lib/paraglide/messages';

    let { children } = $props();
    let searchOpen = $state(false);
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

<LilySidebar.Provider
    class="docs-shell"
    style="--sidebar-width: 248px; --sidebar-width-icon: 56px;"
>
    <a class="skip-link" href="#main-content">{m.skip_to_content()}</a>
    <SiteHeader onOpenSearch={() => (searchOpen = true)} />
    <div class="docs-shell-body">
        <LilySidebar.Root class="docs-sidebar" collapsible="offcanvas">
            <Sidebar />
        </LilySidebar.Root>
        <div class="site-frame">
            <main id="main-content">
                {@render children()}
            </main>
        </div>
    </div>
    <SearchDialog bind:open={searchOpen} />
</LilySidebar.Provider>
