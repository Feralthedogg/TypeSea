<script lang="ts">
    import type { BenchmarkSnapshot, EcosystemSuiteId } from '$lib/benchmark/model';
    import { currentLocale } from '$lib/navigation';
    import * as m from '$lib/paraglide/messages';
    import BenchmarkBarChart from './BenchmarkBarChart.svelte';

    interface Props {
        readonly snapshot: BenchmarkSnapshot;
    }

    let { snapshot }: Props = $props();
    const locale = $derived(currentLocale());

    const colors = [
        'var(--chart-1)',
        'var(--chart-2)',
        'var(--chart-3)',
        'var(--chart-5)'
    ] as const;

    function titleFor(id: EcosystemSuiteId): string {
        switch (id) {
            case 'valid-is':
                return m.benchmark_valid_boolean();
            case 'valid-check':
                return m.benchmark_valid_diagnostic();
            case 'invalid-is':
                return m.benchmark_invalid_boolean();
            case 'invalid-check':
                return m.benchmark_invalid_diagnostic();
        }
    }

    const recordedAt = $derived.by(() =>
        new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
            dateStyle: 'medium',
            timeZone: 'UTC'
        }).format(new Date(snapshot.recordedAt))
    );
</script>

<div class="benchmark-meta" aria-label={m.benchmark_environment()}>
    <span>{snapshot.environment.cpu}</span>
    <span>Node {snapshot.environment.node}</span>
    <span>V8 {snapshot.environment.v8}</span>
    <span>{m.benchmark_runs({ count: snapshot.runCount })}</span>
    <time datetime={snapshot.recordedAt}>{recordedAt}</time>
</div>

<div class="benchmark-chart-grid">
    {#each snapshot.suites as suite, index (suite.id)}
        <BenchmarkBarChart
            {suite}
            title={titleFor(suite.id)}
            description={m.benchmark_chart_unit()}
            color={colors[index] ?? 'var(--chart-1)'}
            unitLabel={m.benchmark_ops_per_second()}
            validatorLabel={m.benchmark_validator()}
        />
    {/each}
</div>
