<script lang="ts">
    import { goto } from '$app/navigation';
    import FileText from '@lucide/svelte/icons/file-text';
    import * as Command from '$lib/components/ui/command';
    import * as Dialog from '$lib/components/ui/dialog';
    import { Label } from '$lib/components/ui/label';
    import { currentLocale, localizedPath } from '$lib/navigation';
    import { getSearchEntries } from '$lib/content/catalog';
    import * as m from '$lib/paraglide/messages';

    interface Props {
        open: boolean;
    }

    let { open = $bindable(false) }: Props = $props();
    let query = $state('');
    const locale = $derived(currentLocale());
    const entries = $derived(getSearchEntries(locale));
    const results = $derived.by(() => {
        const normalized = query.trim().toLocaleLowerCase(locale);
        if (normalized.length === 0) {
            return entries.slice(0, 12);
        }
        return entries
            .filter((entry) =>
                `${entry.documentTitle} ${entry.title}`
                    .toLocaleLowerCase(locale)
                    .includes(normalized)
            )
            .slice(0, 18);
    });

    $effect(() => {
        if (!open) {
            query = '';
        }
    });

    function handleHotkey(event: KeyboardEvent) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            open = !open;
        }
    }

    function select(href: string) {
        open = false;
        void goto(localizedPath(href));
    }
</script>

<svelte:window onkeydown={handleHotkey} />

<Dialog.Root bind:open>
    <Dialog.Content class="search-dialog" closeLabel={m.close()}>
        <Dialog.Title class="sr-only">{m.search()}</Dialog.Title>
        <Dialog.Description class="sr-only">{m.search_hint()}</Dialog.Description>
        <Command.Root shouldFilter={false}>
            <Label for="docs-search" class="sr-only">{m.search()}</Label>
            <Command.Input
                id="docs-search"
                bind:value={query}
                placeholder={m.search_placeholder()}
                autofocus
            />
            <Command.List class="search-results">
                {#if results.length === 0}
                    <Command.Empty>{m.search_no_results()}</Command.Empty>
                {:else}
                    <Command.Group heading={m.search()}>
                        {#each results as entry (`${entry.document}-${entry.href}`)}
                            <Command.Item
                                value={`${entry.documentTitle}-${entry.title}`}
                                onSelect={() => select(entry.href)}
                            >
                                <FileText class="search-result-icon" aria-hidden="true" />
                                <span class="search-result-copy">
                                    <strong>{entry.title}</strong>
                                    <span>{entry.documentTitle}</span>
                                </span>
                            </Command.Item>
                        {/each}
                    </Command.Group>
                {/if}
            </Command.List>
        </Command.Root>
        <div class="search-footer">
            <span>{m.search_hint()}</span>
            <kbd>Esc</kbd>
        </div>
    </Dialog.Content>
</Dialog.Root>
