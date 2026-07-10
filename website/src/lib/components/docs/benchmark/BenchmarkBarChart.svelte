<script lang="ts">
    import { scaleBand } from 'd3-scale';
    import { BarChart } from 'layerchart';
    import { cubicInOut } from 'svelte/easing';
    import type { BenchmarkSuite } from '$lib/benchmark/model';
    import * as Card from '$lib/components/ui/card';
    import * as Chart from '$lib/components/ui/chart';

    interface Props {
        readonly suite: BenchmarkSuite;
        readonly title: string;
        readonly description: string;
        readonly color: string;
        readonly unitLabel: string;
        readonly validatorLabel: string;
    }

    let { suite, title, description, color, unitLabel, validatorLabel }: Props = $props();

    const chartConfig = $derived({
        hz: { label: unitLabel, color }
    } satisfies Chart.ChartConfig);

    function formatAxis(value: unknown): string {
        if (typeof value !== 'number') {
            return String(value);
        }
        if (value >= 1_000_000) {
            const millions = value / 1_000_000;
            return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`;
        }
        if (value >= 1_000) {
            return `${(value / 1_000).toFixed(0)}k`;
        }
        return value.toFixed(0);
    }
</script>

<Card.Root class="benchmark-card">
    <Card.Header>
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
    </Card.Header>
    <Card.Content>
        <Chart.Container config={chartConfig} class="benchmark-chart">
            <BarChart
                data={suite.rows}
                x="hz"
                y="label"
                yScale={scaleBand().padding(0.28)}
                orientation="horizontal"
                axis
                series={[{ key: 'hz', label: unitLabel, color: chartConfig.hz.color }]}
                props={{
                    bars: {
                        stroke: 'none',
                        rounded: 'right',
                        radius: 6,
                        motion: { type: 'tween', duration: 450, easing: cubicInOut }
                    },
                    highlight: { area: { fill: 'none' } },
                    xAxis: { format: formatAxis }
                }}
            >
                {#snippet tooltip()}
                    <Chart.Tooltip hideLabel />
                {/snippet}
            </BarChart>
        </Chart.Container>

        <table class="sr-only">
            <caption>{title}</caption>
            <thead>
                <tr><th>{validatorLabel}</th><th>{unitLabel}</th></tr>
            </thead>
            <tbody>
                {#each suite.rows as row (row.id)}
                    <tr><td>{row.label}</td><td>{row.hz}</td></tr>
                {/each}
            </tbody>
        </table>
    </Card.Content>
</Card.Root>
