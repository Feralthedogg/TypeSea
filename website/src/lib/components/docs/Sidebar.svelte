<script lang="ts">
    import { page } from '$app/state';
    import { canonicalPath, localizedPath } from '$lib/navigation';
    import { site } from '$lib/content/catalog';
    import * as m from '$lib/paraglide/messages';

    interface Props {
        readonly onNavigate?: () => void;
    }

    let { onNavigate }: Props = $props();
    const path = $derived(canonicalPath(page.url.pathname));

    function isActive(target: string) {
        if (target === '/') {
            return path === '/';
        }
        return path.startsWith(target);
    }
</script>

<aside class="sidebar" aria-label={m.navigation()}>
    <nav class="sidebar-nav">
        <section>
            <h2>{m.start()}</h2>
            <a class:active={isActive('/')} href={localizedPath('/')} onclick={onNavigate}>
                {m.overview()}
            </a>
            <a href={localizedPath('/#quick-start')} onclick={onNavigate}>{m.quick_start()}</a>
            <a href={localizedPath('/#benchmarks')} onclick={onNavigate}>{m.benchmarks()}</a>
        </section>

        <section>
            <h2>{m.reference()}</h2>
            <a
                class:active={isActive('/readme/')}
                href={localizedPath('/readme/')}
                onclick={onNavigate}>{m.readme()}</a
            >
            <a class:active={isActive('/api/')} href={localizedPath('/api/')} onclick={onNavigate}
                >{m.api_reference()}</a
            >
        </section>

        <section>
            <h2>{m.tools()}</h2>
            <a
                class:active={isActive('/seaflow/')}
                href={localizedPath('/seaflow/')}
                onclick={onNavigate}>SeaFlow</a
            >
            <a
                class:active={isActive('/seabreeze/')}
                href={localizedPath('/seabreeze/')}
                onclick={onNavigate}>SeaBreeze</a
            >
        </section>

        <section>
            <h2>{m.internals()}</h2>
            <a
                class:active={isActive('/engine/')}
                href={localizedPath('/engine/')}
                onclick={onNavigate}>{m.engine_notes()}</a
            >
        </section>
    </nav>

    <footer class="sidebar-footer">
        <span>{m.version()} {site.version}</span>
        <span>MIT · ESM</span>
    </footer>
</aside>
