export const ecosystemSuiteIds = [
    'valid-is',
    'valid-check',
    'invalid-is',
    'invalid-check'
] as const;

export type EcosystemSuiteId = (typeof ecosystemSuiteIds)[number];

export interface BenchmarkRow {
    readonly id: string;
    readonly label: string;
    readonly hz: number;
}

export interface BenchmarkSuite {
    readonly id: EcosystemSuiteId;
    readonly rows: readonly BenchmarkRow[];
}

export interface BenchmarkSnapshot {
    readonly recordedAt: string;
    readonly environment: {
        readonly cpu: string;
        readonly node: string;
        readonly v8: string;
    };
    readonly runCount: number;
    readonly suites: readonly BenchmarkSuite[];
}

interface BenchmarkReport {
    readonly recordedAt: string;
    readonly environment: {
        readonly cpu: string;
        readonly node: string;
        readonly v8: string;
    };
    readonly aggregation: {
        readonly runCount: number;
    };
    readonly suites: readonly {
        readonly id: string;
        readonly rows: readonly {
            readonly id: string;
            readonly label: string;
            readonly hz: number;
        }[];
    }[];
}

const shortLabels: Readonly<Record<string, string>> = {
    'typesea-interpreted': 'TS interpreted',
    'typesea-safe': 'TS safe',
    'typesea-unsafe': 'TS unsafe',
    'typesea-unchecked': 'TS unchecked',
    zod: 'Zod',
    valibot: 'Valibot',
    ajv: 'Ajv'
};

export function createBenchmarkSnapshot(report: BenchmarkReport): BenchmarkSnapshot {
    const suites = ecosystemSuiteIds.map((id) => {
        const source = report.suites.find((suite) => suite.id === id);
        if (source === undefined) {
            throw new Error(`Missing benchmark suite: ${id}`);
        }
        return {
            id,
            rows: source.rows.map((row) => ({
                id: row.id,
                label: shortLabels[row.id] ?? row.label,
                hz: Math.round(row.hz)
            }))
        };
    });

    return {
        recordedAt: report.recordedAt,
        environment: {
            cpu: report.environment.cpu,
            node: report.environment.node,
            v8: report.environment.v8
        },
        runCount: report.aggregation.runCount,
        suites
    };
}
