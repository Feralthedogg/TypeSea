<script lang="ts">
    import ArrowLeft from '@lucide/svelte/icons/arrow-left';
    import ArrowRight from '@lucide/svelte/icons/arrow-right';
    import type { Component } from 'svelte';
    import { getAdjacentDocuments, getDocument, type DocumentSlug } from '$lib/content/catalog';
    import { currentLocale, localizedPath } from '$lib/navigation';
    import * as m from '$lib/paraglide/messages';
    import DocArticle from './DocArticle.svelte';
    import TableOfContents from './TableOfContents.svelte';

    interface Props {
        readonly slug: DocumentSlug;
        readonly content: Component;
    }

    let { slug, content: Content }: Props = $props();
    const locale = $derived(currentLocale());
    const document = $derived(getDocument(slug));
    const adjacent = $derived(getAdjacentDocuments(slug));

    function groupLabel() {
        if (document.group === 'reference') {
            return m.reference();
        }
        if (document.group === 'tools') {
            return m.tools();
        }
        return m.internals();
    }
</script>

<svelte:head>
    <title>{document.title[locale]} | TypeSea</title>
    <meta name="description" content={document.description[locale]} />
</svelte:head>

<div class="document-layout">
    <div class="document-main">
        <header class="document-meta">
            <span>{groupLabel()}</span>
            <a href={document.githubUrl[locale]} target="_blank" rel="noreferrer">
                {m.edit_on_github()}
            </a>
        </header>

        <DocArticle>
            <Content />
        </DocArticle>

        <nav class="document-pagination" aria-label={m.document_pagination()}>
            {#if adjacent.previous}
                <a class="previous" href={localizedPath(`/${adjacent.previous.slug}/`)}>
                    <ArrowLeft aria-hidden="true" />
                    <span>
                        <small>{m.previous()}</small>
                        <strong>{adjacent.previous.title[locale]}</strong>
                    </span>
                </a>
            {:else}
                <span></span>
            {/if}
            {#if adjacent.next}
                <a class="next" href={localizedPath(`/${adjacent.next.slug}/`)}>
                    <span>
                        <small>{m.next()}</small>
                        <strong>{adjacent.next.title[locale]}</strong>
                    </span>
                    <ArrowRight aria-hidden="true" />
                </a>
            {/if}
        </nav>
    </div>

    <TableOfContents headings={document.headings[locale]} githubUrl={document.githubUrl[locale]} />
</div>
