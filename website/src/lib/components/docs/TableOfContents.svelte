<script lang="ts">
    import { onMount } from 'svelte';
    import type { HeadingEntry } from '$lib/content/catalog';
    import * as m from '$lib/paraglide/messages';

    interface Props {
        readonly headings: readonly HeadingEntry[];
        readonly githubUrl: string;
    }

    let { headings, githubUrl }: Props = $props();
    let activeId = $state('');
    const visibleHeadings = $derived(
        headings.filter((heading) => heading.level === 2 || heading.level === 3)
    );

    onMount(() => {
        const targets = visibleHeadings
            .map((heading) => document.getElementById(heading.id))
            .filter((element): element is HTMLElement => element !== null);
        if (targets.length === 0) {
            return;
        }
        activeId = targets[0]?.id ?? '';
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort(
                        (left, right) => left.boundingClientRect.top - right.boundingClientRect.top
                    );
                const first = visible[0]?.target;
                if (first instanceof HTMLElement) {
                    activeId = first.id;
                }
            },
            { rootMargin: '-80px 0px -72% 0px' }
        );
        for (const target of targets) {
            observer.observe(target);
        }
        return () => observer.disconnect();
    });
</script>

<aside class="table-of-contents" aria-label={m.on_this_page()}>
    <h2>{m.on_this_page()}</h2>
    <nav>
        {#each visibleHeadings as heading (heading.id)}
            <a
                href={`#${heading.id}`}
                class:active={activeId === heading.id}
                class:toc-child={heading.level === 3}>{heading.text}</a
            >
        {/each}
    </nav>
    <a class="toc-edit-link" href={githubUrl} target="_blank" rel="noreferrer">
        {m.edit_on_github()}
    </a>
</aside>
