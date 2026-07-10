<script lang="ts">
    import { Toc, type TocItem } from '$lib/components/ui/toc';
    import type { HeadingEntry } from '$lib/content/catalog';
    import * as m from '$lib/paraglide/messages';

    interface Props {
        readonly headings: readonly HeadingEntry[];
        readonly githubUrl: string;
    }

    let { headings, githubUrl }: Props = $props();
    const items = $derived(buildItems(headings));

    function buildItems(entries: readonly HeadingEntry[]): TocItem[] {
        const result: TocItem[] = [];
        let parent: TocItem | undefined;
        for (const heading of entries) {
            if (heading.level === 2) {
                parent = { title: heading.text, url: `#${heading.id}`, items: [] };
                result.push(parent);
                continue;
            }
            if (heading.level !== 3) {
                continue;
            }
            const item = { title: heading.text, url: `#${heading.id}` };
            if (parent?.items !== undefined) {
                parent.items.push(item);
            } else {
                result.push(item);
            }
        }
        return result;
    }
</script>

<aside class="table-of-contents" aria-label={m.on_this_page()}>
    <Toc toc={items} title={m.on_this_page()} class="docs-toc" />
    <a class="toc-edit-link" href={githubUrl} target="_blank" rel="noreferrer">
        {m.edit_on_github()}
    </a>
</aside>
