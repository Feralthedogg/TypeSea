<script lang="ts">
    import ArrowRight from '@lucide/svelte/icons/arrow-right';
    import Check from '@lucide/svelte/icons/check';
    import Copy from '@lucide/svelte/icons/copy';
    import Gauge from '@lucide/svelte/icons/gauge';
    import GitBranch from '@lucide/svelte/icons/git-branch';
    import ScanSearch from '@lucide/svelte/icons/scan-search';
    import ShieldCheck from '@lucide/svelte/icons/shield-check';
    import { base } from '$app/paths';
    import CodeBlock from '$lib/components/docs/code/CodeBlock.svelte';
    import { Button } from '$lib/components/ui/button';
    import * as Card from '$lib/components/ui/card';
    import { localizedPath } from '$lib/navigation';
    import { currentLocale } from '$lib/navigation';
    import { getLocalizedHeadingId, site } from '$lib/content/catalog';
    import * as m from '$lib/paraglide/messages';

    interface Props {
        readonly codeExamples: {
            readonly quickStart: HighlightedSource;
            readonly migration: Readonly<Record<'en' | 'ko', HighlightedSource>>;
        };
    }

    interface HighlightedSource {
        readonly html: string;
        readonly source: string;
    }

    let { codeExamples }: Props = $props();
    const packageName = 'typesea';
    const installCommand = `pnpm add ${packageName}`;
    const locale = $derived(currentLocale());
    const readmeQuickStart = $derived(getLocalizedHeadingId('readme', locale, 'quick-start'));
    const readmePerformance = $derived(
        getLocalizedHeadingId('readme', locale, 'performance-snapshot')
    );
    const zodCompatibility = $derived(
        getLocalizedHeadingId('api', locale, 'zod-compatibility-matrix')
    );
    const migration = $derived(codeExamples.migration[locale]);

    let installCopied = $state(false);

    function copyInstall() {
        const operation = navigator.clipboard.writeText(installCommand);
        void operation.then(
            () => {
                installCopied = true;
                window.setTimeout(() => (installCopied = false), 1400);
            },
            () => undefined
        );
    }
</script>

<svelte:head>
    <title>{m.site_title()}</title>
    <meta name="description" content={m.site_description()} />
    <meta property="og:title" content={m.site_title()} />
    <meta property="og:description" content={m.site_description()} />
</svelte:head>

<div class="landing-page">
    <section class="hero-section" id="overview">
        <div class="hero-copy">
            <p class="eyebrow">{m.hero_eyebrow()}</p>
            <h1>{m.hero_title()}</h1>
            <p class="hero-summary">{m.hero_summary()}</p>
            <p class="hero-detail">{m.hero_detail()}</p>
            <div class="hero-actions">
                <div class="install-command" aria-label={m.install()}>
                    <span aria-hidden="true">$</span>
                    <code>{installCommand}</code>
                    <Button
                        variant="ghost"
                        size="icon"
                        onclick={copyInstall}
                        aria-label={installCopied ? m.copied() : m.copy_code()}
                        title={installCopied ? m.copied() : m.copy_code()}
                    >
                        {#if installCopied}
                            <Check class="size-4" aria-hidden="true" />
                        {:else}
                            <Copy class="size-4" aria-hidden="true" />
                        {/if}
                    </Button>
                </div>
                <Button variant="ghost" href={localizedPath(`/readme/#${readmeQuickStart}`)}>
                    {m.quick_start()}
                    <ArrowRight class="size-4" aria-hidden="true" />
                </Button>
            </div>
        </div>

        <dl class="hero-facts">
            <div>
                <dt>{m.runtime_dependencies()}</dt>
                <dd>{m.zero()}</dd>
            </div>
            <div>
                <dt>{m.execution_paths()}</dt>
                <dd>{m.execution_value()}</dd>
            </div>
            <div>
                <dt>{m.module_format()}</dt>
                <dd>{m.module_value()}</dd>
            </div>
            <div>
                <dt>{m.node_support()}</dt>
                <dd>≥ 20.19</dd>
            </div>
        </dl>
    </section>

    <section class="content-section quick-start-section" id="quick-start">
        <div class="section-heading">
            <p class="eyebrow">{m.quick_start()}</p>
            <h2>{m.quick_start_title()}</h2>
        </div>
        <CodeBlock {...codeExamples.quickStart} />
    </section>

    <section class="content-section architecture-section" id="architecture">
        <div class="section-heading">
            <p class="eyebrow">{m.architecture_eyebrow()}</p>
            <h2>{m.architecture_title()}</h2>
            <p>{m.architecture_detail()}</p>
        </div>

        <div class="execution-flow" aria-label={m.architecture_title()}>
            <div class="flow-stage">
                <span>01</span>
                <strong>{m.schema_stage()}</strong>
            </div>
            <ArrowRight aria-hidden="true" />
            <div class="flow-stage">
                <span>02</span>
                <strong>{m.plan_stage()}</strong>
            </div>
            <ArrowRight aria-hidden="true" />
            <div class="flow-branches">
                <div class="flow-stage">
                    <span>03A</span>
                    <strong>{m.runtime_stage()}</strong>
                </div>
                <div class="flow-stage emphasis">
                    <span>03B</span>
                    <strong>{m.compiled_stage()}</strong>
                </div>
            </div>
        </div>

        <div class="feature-grid">
            <Card.Root class="feature-card">
                <Card.Header>
                    <ShieldCheck aria-hidden="true" />
                    <Card.Title>{m.safe_by_default()}</Card.Title>
                </Card.Header>
                <Card.Description>{m.safe_by_default_detail()}</Card.Description>
            </Card.Root>
            <Card.Root class="feature-card">
                <Card.Header>
                    <Gauge aria-hidden="true" />
                    <Card.Title>{m.hot_path_control()}</Card.Title>
                </Card.Header>
                <Card.Description>{m.hot_path_control_detail()}</Card.Description>
            </Card.Root>
            <Card.Root class="feature-card">
                <Card.Header>
                    <ScanSearch aria-hidden="true" />
                    <Card.Title>{m.analysis_tools()}</Card.Title>
                </Card.Header>
                <Card.Description>{m.analysis_tools_detail()}</Card.Description>
            </Card.Root>
        </div>
    </section>

    <section class="content-section benchmark-section" id="benchmarks">
        <div class="section-heading compact">
            <p class="eyebrow">{m.benchmark_eyebrow()}</p>
            <h2>{m.benchmark_title()}</h2>
            <p>{m.benchmark_detail()}</p>
        </div>
        <figure class="benchmark-figure">
            <img src={`${base}/benchmark-headline.svg`} alt={m.benchmark_alt()} />
            <figcaption>
                <a href={localizedPath(`/readme/#${readmePerformance}`)}>
                    {m.benchmark_method()}
                    <ArrowRight class="size-4" aria-hidden="true" />
                </a>
            </figcaption>
        </figure>
    </section>

    <section class="content-section migration-section">
        <div class="section-heading">
            <p class="eyebrow">{m.migration_eyebrow()}</p>
            <h2>{m.migration_title()}</h2>
            <p>{m.migration_detail()}</p>
            <Button variant="ghost" href={localizedPath(`/api/#${zodCompatibility}`)}>
                {m.api_reference()}
                <ArrowRight class="size-4" aria-hidden="true" />
            </Button>
        </div>
        <CodeBlock {...migration} />
    </section>

    <section class="content-section docs-section" id="docs">
        <div class="section-heading compact">
            <p class="eyebrow">{m.docs_eyebrow()}</p>
            <h2>{m.docs_title()}</h2>
            <p>{m.docs_detail()}</p>
        </div>
        <div class="document-grid">
            {#each site.documents as document (document.slug)}
                <Card.Root class="document-card">
                    <Card.Header>
                        <div class="document-icon" aria-hidden="true">
                            {#if document.group === 'internals'}
                                <GitBranch />
                            {:else if document.group === 'tools'}
                                <ScanSearch />
                            {:else}
                                <ShieldCheck />
                            {/if}
                        </div>
                        <Card.Title>{document.title[locale]}</Card.Title>
                    </Card.Header>
                    <Card.Description>{document.description[locale]}</Card.Description>
                    <Card.Footer>
                        <a href={localizedPath(`/${document.slug}/`)}>
                            {m.open_document()}
                            <ArrowRight class="size-4" aria-hidden="true" />
                        </a>
                    </Card.Footer>
                </Card.Root>
            {/each}
        </div>
    </section>

    <section class="release-strip">
        <div>
            <p class="eyebrow">{m.release_gate()}</p>
            <p>{m.release_gate_detail()}</p>
        </div>
        <code>pnpm verify · npm run release:check</code>
    </section>
</div>
