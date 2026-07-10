<script lang="ts">
    import ArrowRight from '@lucide/svelte/icons/arrow-right';
    import Check from '@lucide/svelte/icons/check';
    import Copy from '@lucide/svelte/icons/copy';
    import Gauge from '@lucide/svelte/icons/gauge';
    import GitBranch from '@lucide/svelte/icons/git-branch';
    import ScanSearch from '@lucide/svelte/icons/scan-search';
    import ShieldCheck from '@lucide/svelte/icons/shield-check';
    import { base } from '$app/paths';
    import { Button } from '$lib/components/ui/button';
    import { localizedPath } from '$lib/navigation';
    import { currentLocale } from '$lib/navigation';
    import { getLocalizedHeadingId, site } from '$lib/content/catalog';
    import * as m from '$lib/paraglide/messages';

    const packageName = 'typesea';
    const compatibilityPath = `${packageName}/v4`;
    const installCommand = `pnpm add ${packageName}`;
    const quickStart = `import { compile, t, type Infer } from "${packageName}";

const User = t.strictObject({
    id: t.string.uuid(),
    age: t.number.int().gte(0),
    role: t.enum(["admin", "user"])
});

type User = Infer<typeof User>;
const isUser = compile(User);

if (isUser(input)) {
    input.id;
}`;
    const locale = $derived(currentLocale());
    const readmeQuickStart = $derived(getLocalizedHeadingId('readme', locale, 'quick-start'));
    const readmePerformance = $derived(
        getLocalizedHeadingId('readme', locale, 'performance-snapshot')
    );
    const zodCompatibility = $derived(
        getLocalizedHeadingId('api', locale, 'zod-compatibility-matrix')
    );
    const migration = $derived(
        locale === 'ko'
            ? `// 기존 import
import { z } from "zod";

// TypeSea 호환 계층 적용
import { z } from "${compatibilityPath}";

const User = z.object({
    id: z.string().uuid(),
    email: z.string().email()
}).strict();`
            : `// Existing import
import { z } from "zod";

// Compatibility experiment
import { z } from "${compatibilityPath}";

const User = z.object({
    id: z.string().uuid(),
    email: z.string().email()
}).strict();`
    );

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
        <pre class="showcase-code"><code>{quickStart}</code></pre>
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
            <article>
                <ShieldCheck aria-hidden="true" />
                <h3>{m.safe_by_default()}</h3>
                <p>{m.safe_by_default_detail()}</p>
            </article>
            <article>
                <Gauge aria-hidden="true" />
                <h3>{m.hot_path_control()}</h3>
                <p>{m.hot_path_control_detail()}</p>
            </article>
            <article>
                <ScanSearch aria-hidden="true" />
                <h3>{m.analysis_tools()}</h3>
                <p>{m.analysis_tools_detail()}</p>
            </article>
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
        <pre class="showcase-code"><code>{migration}</code></pre>
    </section>

    <section class="content-section docs-section" id="docs">
        <div class="section-heading compact">
            <p class="eyebrow">{m.docs_eyebrow()}</p>
            <h2>{m.docs_title()}</h2>
            <p>{m.docs_detail()}</p>
        </div>
        <div class="document-grid">
            {#each site.documents as document (document.slug)}
                <article class="document-card">
                    <div class="document-icon" aria-hidden="true">
                        {#if document.group === 'internals'}
                            <GitBranch />
                        {:else if document.group === 'tools'}
                            <ScanSearch />
                        {:else}
                            <ShieldCheck />
                        {/if}
                    </div>
                    <h3>{document.title[locale]}</h3>
                    <p>{document.description[locale]}</p>
                    <a href={localizedPath(`/${document.slug}/`)}>
                        {m.open_document()}
                        <ArrowRight class="size-4" aria-hidden="true" />
                    </a>
                </article>
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
