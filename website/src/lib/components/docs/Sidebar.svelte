<script lang="ts">
    import X from '@lucide/svelte/icons/x';
    import { page } from '$app/state';
    import * as Sidebar from '$lib/components/ui/sidebar';
    import { site } from '$lib/content/catalog';
    import { canonicalPath, localizedPath } from '$lib/navigation';
    import * as m from '$lib/paraglide/messages';

    interface NavigationItem {
        readonly href: string;
        readonly label: string;
        readonly match: string;
    }

    interface NavigationGroup {
        readonly items: readonly NavigationItem[];
        readonly label: string;
    }

    const sidebar = Sidebar.useSidebar();
    const path = $derived(canonicalPath(page.url.pathname));
    const groups = $derived<readonly NavigationGroup[]>([
        {
            label: m.start(),
            items: [
                { label: m.overview(), href: '/', match: '/' },
                { label: m.quick_start(), href: '/#quick-start', match: '' },
                { label: m.benchmarks(), href: '/#benchmarks', match: '' }
            ]
        },
        {
            label: m.reference(),
            items: [
                { label: m.readme(), href: '/readme/', match: '/readme/' },
                { label: m.api_reference(), href: '/api/', match: '/api/' },
                { label: m.zod_compat(), href: '/zod-compat/', match: '/zod-compat/' },
                { label: m.zod_corpus(), href: '/zod-corpus/', match: '/zod-corpus/' }
            ]
        },
        {
            label: m.tools(),
            items: [
                { label: m.aot_plugin(), href: '/aot/', match: '/aot/' },
                { label: 'SeaFlow', href: '/seaflow/', match: '/seaflow/' },
                { label: 'SeaBreeze', href: '/seabreeze/', match: '/seabreeze/' },
                { label: m.seacurrent_planner(), href: '/seacurrent/', match: '/seacurrent/' }
            ]
        },
        {
            label: m.internals(),
            items: [
                { label: m.project_direction(), href: '/direction/', match: '/direction/' },
                { label: m.engine_notes(), href: '/engine/', match: '/engine/' }
            ]
        }
    ]);

    function isActive(target: string): boolean {
        if (target === '') {
            return false;
        }
        if (target === '/') {
            return path === '/';
        }
        return path.startsWith(target);
    }

    function handleNavigate(): void {
        if (sidebar.isMobile) {
            sidebar.setOpenMobile(false);
        }
    }
</script>

<Sidebar.Header class="docs-sidebar-mobile-header">
    <strong>TypeSea</strong>
    <Sidebar.Trigger aria-label={m.close()} title={m.close()}>
        <X class="size-4" aria-hidden="true" />
    </Sidebar.Trigger>
</Sidebar.Header>

<Sidebar.Content class="docs-sidebar-content" aria-label={m.navigation()}>
    {#each groups as group (group.label)}
        <Sidebar.Group>
            <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
            <Sidebar.GroupContent>
                <Sidebar.Menu>
                    {#each group.items as item (item.href)}
                        <Sidebar.MenuItem>
                            <Sidebar.MenuButton isActive={isActive(item.match)}>
                                {#snippet child({ props })}
                                    <a
                                        {...props}
                                        href={localizedPath(item.href)}
                                        onclick={handleNavigate}>{item.label}</a
                                    >
                                {/snippet}
                            </Sidebar.MenuButton>
                        </Sidebar.MenuItem>
                    {/each}
                </Sidebar.Menu>
            </Sidebar.GroupContent>
        </Sidebar.Group>
    {/each}
</Sidebar.Content>

<Sidebar.Separator />
<Sidebar.Footer class="docs-sidebar-footer">
    <span>{m.version()} {site.version}</span>
    <span>MIT · ESM</span>
</Sidebar.Footer>
