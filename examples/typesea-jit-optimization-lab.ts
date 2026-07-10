import {
    compile,
    compileBoolean,
    t,
    type Guard
} from "../src/index.js";

const RISK_CELL_COUNT = 96;
const SAMPLE_ORDER_COUNT = 12;

const IdentifierGuard = t.string
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9._:-]+$/, "identifier");

const IsoDateGuard = t.string
    .length(10)
    .regex(/^\d{4}-\d{2}-\d{2}$/, "iso_date");

const TimestampGuard = t.string
    .min(20)
    .max(40)
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, "timestamp");

const CurrencyGuard = t.enum([
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "KRW",
    "CHF",
    "CAD",
    "AUD",
    "SGD",
    "HKD"
] as const);

const RegionGuard = t.enum([
    "US",
    "EU",
    "UK",
    "KR",
    "JP",
    "SG",
    "HK",
    "CA",
    "AU",
    "CH"
] as const);

const MoneyGuard = t.strictObject({
    amount: t.number.gte(0).lte(5_000_000_000),
    currency: CurrencyGuard
});

const SignedMoneyGuard = t.strictObject({
    amount: t.number.gte(-5_000_000_000).lte(5_000_000_000),
    currency: CurrencyGuard
});

const PercentGuard = t.number.gte(0).lte(1);
const BasisPointGuard = t.number.gte(-50_000).lte(50_000);

const SharedRiskCellGuard = t.strictObject({
    limit: MoneyGuard,
    current: MoneyGuard,
    stressLoss: SignedMoneyGuard,
    utilization: PercentGuard,
    volatilityBps: t.number.gte(0).lte(50_000),
    liquidityScore: t.number.int().gte(0).lte(100),
    breached: t.boolean,
    lastMarkedAt: TimestampGuard,
    notes: t.array(IdentifierGuard).max(8)
});

const SharedInstrumentGuard = t.strictObject({
    symbol: IdentifierGuard,
    region: RegionGuard,
    currency: CurrencyGuard,
    exchange: t.enum([
        "XNYS",
        "XNAS",
        "ARCX",
        "BATS",
        "XKRX",
        "XTKS",
        "XLON",
        "XHKG",
        "XSES"
    ] as const),
    sector: t.enum([
        "technology",
        "financials",
        "energy",
        "healthcare",
        "industrial",
        "consumer",
        "sovereign",
        "crypto"
    ] as const),
    price: MoneyGuard,
    bidAskBps: t.number.gte(0).lte(10_000),
    halted: t.boolean,
    staleMs: t.number.int().gte(0).lte(600_000)
});

const EquityOrderGuard = t.strictObject({
    kind: t.literal("equity"),
    orderId: IdentifierGuard,
    accountId: IdentifierGuard,
    instrument: SharedInstrumentGuard,
    side: t.enum(["buy", "sell"] as const),
    quantity: t.number.int().gte(1).lte(50_000_000),
    limitPrice: MoneyGuard.optional(),
    timeInForce: t.enum(["day", "gtc", "ioc", "fok"] as const),
    locateId: IdentifierGuard.optional(),
    restrictedListHit: t.boolean
});

const OptionOrderGuard = t.strictObject({
    kind: t.literal("option"),
    orderId: IdentifierGuard,
    accountId: IdentifierGuard,
    underlying: SharedInstrumentGuard,
    optionType: t.enum(["call", "put"] as const),
    side: t.enum(["buy", "sell"] as const),
    contracts: t.number.int().gte(1).lte(2_000_000),
    strike: MoneyGuard,
    premium: MoneyGuard,
    expiry: IsoDateGuard,
    greeks: t.strictObject({
        delta: t.number.gte(-1).lte(1),
        gamma: t.number.gte(0).lte(10),
        theta: t.number.gte(-1_000_000).lte(1_000_000),
        vega: t.number.gte(0).lte(1_000_000),
        rho: t.number.gte(-1_000_000).lte(1_000_000)
    })
});

const FxOrderGuard = t.strictObject({
    kind: t.literal("fx"),
    orderId: IdentifierGuard,
    accountId: IdentifierGuard,
    pair: t.string.length(6).regex(/^[A-Z]{6}$/, "fx_pair"),
    side: t.enum(["buy", "sell"] as const),
    notional: MoneyGuard,
    forwardPoints: t.number.gte(-10_000).lte(10_000),
    settlementDate: IsoDateGuard,
    ndf: t.boolean,
    fixingSource: IdentifierGuard
});

const BondOrderGuard = t.strictObject({
    kind: t.literal("bond"),
    orderId: IdentifierGuard,
    accountId: IdentifierGuard,
    isin: t.string.length(12).regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, "isin"),
    side: t.enum(["buy", "sell"] as const),
    faceValue: MoneyGuard,
    cleanPrice: t.number.gt(0).lte(250),
    accruedInterest: MoneyGuard,
    durationYears: t.number.gte(0).lte(80),
    ratingBucket: t.enum([
        "aaa",
        "aa",
        "a",
        "bbb",
        "bb",
        "b",
        "ccc",
        "distressed"
    ] as const)
});

const CryptoOrderGuard = t.strictObject({
    kind: t.literal("crypto"),
    orderId: IdentifierGuard,
    accountId: IdentifierGuard,
    asset: t.enum(["BTC", "ETH", "SOL", "XRP", "USDC"] as const),
    side: t.enum(["buy", "sell"] as const),
    quantity: t.number.gt(0).lte(1_000_000),
    referencePrice: MoneyGuard,
    venue: t.enum(["COINBASE", "KRAKEN", "BINANCE", "UPBIT"] as const),
    travelRuleRequired: t.boolean,
    coldWalletRequired: t.boolean
});

const OrderGuard = t.discriminatedUnion("kind", {
    equity: EquityOrderGuard,
    option: OptionOrderGuard,
    fx: FxOrderGuard,
    bond: BondOrderGuard,
    crypto: CryptoOrderGuard
});

const SharedScenarioGuard = t.strictObject({
    scenarioId: IdentifierGuard,
    description: t.string.min(3).max(160),
    shocks: t.record(IdentifierGuard, BasisPointGuard),
    correlations: t.array(t.tuple([
        IdentifierGuard,
        IdentifierGuard,
        t.number.gte(-1).lte(1)
    ])).max(256),
    expectedLoss: SignedMoneyGuard,
    tailLoss: SignedMoneyGuard,
    active: t.boolean
});

const SharedAccountGuard = t.strictObject({
    accountId: IdentifierGuard,
    desk: t.enum(["cash", "derivatives", "fx", "credit", "crypto"] as const),
    region: RegionGuard,
    baseCurrency: CurrencyGuard,
    riskTier: t.enum(["prime", "standard", "heightened", "restricted"] as const),
    creditLimit: MoneyGuard,
    settlementLimit: MoneyGuard,
    openExposure: MoneyGuard,
    marginRatio: PercentGuard,
    allowShort: t.boolean,
    allowCrypto: t.boolean,
    allowComplexDerivatives: t.boolean,
    frozen: t.boolean
});

const SharedMegaPayloadGuard = t.strictObject({
    requestId: IdentifierGuard,
    submittedAt: TimestampGuard,
    source: t.enum(["api", "oms", "ems", "batch", "replay"] as const),
    customer: t.strictObject({
        customerId: IdentifierGuard,
        legalName: t.string.min(2).max(160),
        region: RegionGuard,
        kycStatus: t.enum(["approved", "review", "expired", "blocked"] as const),
        sanctionsScreen: t.enum(["clear", "pending", "hit"] as const),
        suitabilityScore: t.number.int().gte(0).lte(100),
        politicallyExposed: t.boolean,
        accredited: t.boolean,
        accounts: t.array(SharedAccountGuard).min(1).max(64)
    }),
    orders: t.array(OrderGuard).min(1).max(256),
    scenarios: t.array(SharedScenarioGuard).max(64),
    riskGrid: t.strictObject(makeSharedRiskGridShape()),
    metadata: t.record(IdentifierGuard, t.union(
        t.string.max(256),
        t.number.gte(-1_000_000_000).lte(1_000_000_000),
        t.boolean,
        t.null
    ))
});

const ClonedMegaPayloadGuard = t.strictObject({
    requestId: IdentifierGuard,
    submittedAt: TimestampGuard,
    source: t.enum(["api", "oms", "ems", "batch", "replay"] as const),
    customer: t.strictObject({
        customerId: IdentifierGuard,
        legalName: t.string.min(2).max(160),
        region: RegionGuard,
        kycStatus: t.enum(["approved", "review", "expired", "blocked"] as const),
        sanctionsScreen: t.enum(["clear", "pending", "hit"] as const),
        suitabilityScore: t.number.int().gte(0).lte(100),
        politicallyExposed: t.boolean,
        accredited: t.boolean,
        accounts: t.array(SharedAccountGuard).min(1).max(64)
    }),
    orders: t.array(OrderGuard).min(1).max(256),
    scenarios: t.array(SharedScenarioGuard).max(64),
    riskGrid: t.strictObject(makeClonedRiskGridShape()),
    metadata: t.record(IdentifierGuard, t.union(
        t.string.max(256),
        t.number.gte(-1_000_000_000).lte(1_000_000_000),
        t.boolean,
        t.null
    ))
});

const SharedSafe = compile(SharedMegaPayloadGuard, {
    name: "sharedMegaSafe",
    mode: "safe"
});

export const SharedSafeBoolean = compileBoolean(SharedMegaPayloadGuard, {
    name: "sharedMegaSafeBoolean",
    mode: "safe"
});

const SharedUnsafeBoolean = compileBoolean(SharedMegaPayloadGuard, {
    name: "sharedMegaUnsafeBoolean",
    mode: "unsafe"
});

export const SharedUncheckedBoolean = compileBoolean(SharedMegaPayloadGuard, {
    name: "sharedMegaUncheckedBoolean",
    mode: "unchecked"
});

const ClonedSafeBoolean = compileBoolean(ClonedMegaPayloadGuard, {
    name: "clonedMegaSafeBoolean",
    mode: "safe"
});

export interface SourceShapeStats {
    readonly bytes: number;
    readonly helperPredicates: number;
    readonly helperCollectors: number;
    readonly descriptorHelperCalls: number;
    readonly ownNameScans: number;
    readonly reflectOwnKeyScans: number;
    readonly regexpTests: number;
    readonly loops: number;
    readonly failFastReturns: number;
    readonly sideTableReads: number;
    readonly directBracketReads: number;
    readonly discriminantDispatchHelpers: number;
    readonly generatedFunctionStarts: number;
}

export interface JitOptimizationLabReport {
    readonly sampleAcceptedBySafe: boolean;
    readonly sampleAcceptedByUnsafe: boolean;
    readonly sampleAcceptedByUnchecked: boolean;
    readonly sharedSafe: SourceShapeStats;
    readonly sharedSafeBoolean: SourceShapeStats;
    readonly sharedUnsafeBoolean: SourceShapeStats;
    readonly sharedUncheckedBoolean: SourceShapeStats;
    readonly clonedSafeBoolean: SourceShapeStats;
    readonly sharedVsClonedBooleanByteRatio: number;
    readonly booleanVsDiagnosticByteRatio: number;
    readonly unsafeVsSafeBooleanByteRatio: number;
    readonly uncheckedVsSafeBooleanByteRatio: number;
    readonly optimizationNotes: readonly string[];
}

export function runTypeSeaJitOptimizationLab(): JitOptimizationLabReport {
    const sample = makeMegaPayloadSample();
    const sharedSafeStats = inspectSourceShape(SharedSafe.source);
    const sharedSafeBooleanStats = inspectSourceShape(SharedSafeBoolean.source);
    const sharedUnsafeBooleanStats = inspectSourceShape(SharedUnsafeBoolean.source);
    const sharedUncheckedBooleanStats = inspectSourceShape(SharedUncheckedBoolean.source);
    const clonedSafeBooleanStats = inspectSourceShape(ClonedSafeBoolean.source);

    return Object.freeze({
        sampleAcceptedBySafe: SharedSafe.is(sample),
        sampleAcceptedByUnsafe: SharedUnsafeBoolean.is(sample),
        sampleAcceptedByUnchecked: SharedUncheckedBoolean.is(sample),
        sharedSafe: sharedSafeStats,
        sharedSafeBoolean: sharedSafeBooleanStats,
        sharedUnsafeBoolean: sharedUnsafeBooleanStats,
        sharedUncheckedBoolean: sharedUncheckedBooleanStats,
        clonedSafeBoolean: clonedSafeBooleanStats,
        sharedVsClonedBooleanByteRatio: ratio(
            sharedSafeBooleanStats.bytes,
            clonedSafeBooleanStats.bytes
        ),
        booleanVsDiagnosticByteRatio: ratio(
            sharedSafeBooleanStats.bytes,
            sharedSafeStats.bytes
        ),
        unsafeVsSafeBooleanByteRatio: ratio(
            sharedUnsafeBooleanStats.bytes,
            sharedSafeBooleanStats.bytes
        ),
        uncheckedVsSafeBooleanByteRatio: ratio(
            sharedUncheckedBooleanStats.bytes,
            sharedSafeBooleanStats.bytes
        ),
        optimizationNotes: Object.freeze([
            "compileBoolean() drops diagnostic collectors and leaves only the predicate path.",
            "sharedVsClonedBooleanByteRatio shows whether repeated schema identity changes emitted source size for this shape.",
            "In this object-heavy lab the ratio is expected to be near 1 because field checks are largely emitted inline.",
            "safe mode keeps hostile-input checks for accessors, non-enumerable keys, and symbols.",
            "unsafe mode keeps type checks but switches more object/array reads to direct loads.",
            "unchecked mode trusts normalized fixed-shape objects and removes strict extra-key scans.",
            "Side tables keep regexps, literals, keysets, strings, and dynamic fallbacks out of source text.",
            "Discriminated unions lower to a tag-probe helper instead of testing every branch linearly."
        ])
    });
}

export function readTypeSeaJitSource(
    kind: "safe" | "safeBoolean" | "unsafeBoolean" | "uncheckedBoolean" | "clonedBoolean"
): string {
    if (kind === "safe") {
        return SharedSafe.source;
    }

    if (kind === "safeBoolean") {
        return SharedSafeBoolean.source;
    }

    if (kind === "unsafeBoolean") {
        return SharedUnsafeBoolean.source;
    }

    if (kind === "uncheckedBoolean") {
        return SharedUncheckedBoolean.source;
    }

    return ClonedSafeBoolean.source;
}

function makeSharedRiskGridShape(): Record<string, Guard<unknown>> {
    const shape: Record<string, Guard<unknown>> = {};

    for (let index = 0; index < RISK_CELL_COUNT; index += 1) {
        shape[`risk_${index}`] = SharedRiskCellGuard;
    }

    return shape;
}

function makeClonedRiskGridShape(): Record<string, Guard<unknown>> {
    const shape: Record<string, Guard<unknown>> = {};

    for (let index = 0; index < RISK_CELL_COUNT; index += 1) {
        shape[`risk_${index}`] = t.strictObject({
            limit: MoneyGuard,
            current: MoneyGuard,
            stressLoss: SignedMoneyGuard,
            utilization: PercentGuard,
            volatilityBps: t.number.gte(0).lte(50_000),
            liquidityScore: t.number.int().gte(0).lte(100),
            breached: t.boolean,
            lastMarkedAt: TimestampGuard,
            notes: t.array(IdentifierGuard).max(8)
        });
    }

    return shape;
}

export function makeMegaPayloadSample(): unknown {
    return {
        requestId: "req.optimization.lab",
        submittedAt: "2026-07-08T09:30:00.000Z",
        source: "api",
        customer: {
            customerId: "cust.optimization.lab",
            legalName: "Optimization Lab Capital",
            region: "US",
            kycStatus: "approved",
            sanctionsScreen: "clear",
            suitabilityScore: 94,
            politicallyExposed: false,
            accredited: true,
            accounts: [{
                accountId: "acct.main",
                desk: "derivatives",
                region: "US",
                baseCurrency: "USD",
                riskTier: "prime",
                creditLimit: money(400_000_000),
                settlementLimit: money(600_000_000),
                openExposure: money(35_000_000),
                marginRatio: 0.25,
                allowShort: true,
                allowCrypto: true,
                allowComplexDerivatives: true,
                frozen: false
            }]
        },
        orders: makeSampleOrders(),
        scenarios: [{
            scenarioId: "scenario.downside",
            description: "parallel downside shock",
            shocks: {
                AAPL: -650,
                MSFT: -520,
                BTC: -1_400
            },
            correlations: [
                ["AAPL", "MSFT", 0.78],
                ["BTC", "ETH", 0.86]
            ],
            expectedLoss: signedMoney(-2_400_000),
            tailLoss: signedMoney(-8_900_000),
            active: true
        }],
        riskGrid: makeSampleRiskGrid(),
        metadata: {
            strategy: "generated-jit-lab",
            urgent: false,
            priority: 3
        }
    };
}

function makeSampleOrders(): readonly unknown[] {
    const orders: unknown[] = [];

    for (let index = 0; index < SAMPLE_ORDER_COUNT; index += 1) {
        const orderIndex = index % 5;

        if (orderIndex === 0) {
            orders.push({
                kind: "equity",
                orderId: `order.equity.${index}`,
                accountId: "acct.main",
                instrument: instrument("AAPL", "technology", 210),
                side: "buy",
                quantity: 10_000 + index,
                limitPrice: money(212),
                timeInForce: "day",
                restrictedListHit: false
            });
        } else if (orderIndex === 1) {
            orders.push({
                kind: "option",
                orderId: `order.option.${index}`,
                accountId: "acct.main",
                underlying: instrument("MSFT", "technology", 480),
                optionType: "call",
                side: "buy",
                contracts: 500 + index,
                strike: money(500),
                premium: money(7.25),
                expiry: "2026-12-18",
                greeks: {
                    delta: 0.42,
                    gamma: 0.06,
                    theta: -11.5,
                    vega: 18_000,
                    rho: 250
                }
            });
        } else if (orderIndex === 2) {
            orders.push({
                kind: "fx",
                orderId: `order.fx.${index}`,
                accountId: "acct.main",
                pair: "EURUSD",
                side: "buy",
                notional: { amount: 12_000_000, currency: "EUR" },
                forwardPoints: 12.5,
                settlementDate: "2026-08-21",
                ndf: false,
                fixingSource: "wm.reuters"
            });
        } else if (orderIndex === 3) {
            orders.push({
                kind: "bond",
                orderId: `order.bond.${index}`,
                accountId: "acct.main",
                isin: "US0378331005",
                side: "buy",
                faceValue: money(5_000_000),
                cleanPrice: 102.4,
                accruedInterest: money(32_000),
                durationYears: 6.4,
                ratingBucket: "aa"
            });
        } else {
            orders.push({
                kind: "crypto",
                orderId: `order.crypto.${index}`,
                accountId: "acct.main",
                asset: "BTC",
                side: "buy",
                quantity: 14.5,
                referencePrice: money(96_000),
                venue: "COINBASE",
                travelRuleRequired: true,
                coldWalletRequired: false
            });
        }
    }

    return orders;
}

function makeSampleRiskGrid(): Record<string, unknown> {
    const grid: Record<string, unknown> = {};

    for (let index = 0; index < RISK_CELL_COUNT; index += 1) {
        grid[`risk_${index}`] = {
            limit: money(10_000_000 + index * 10_000),
            current: money(1_000_000 + index * 1_000),
            stressLoss: signedMoney(-50_000 - index * 100),
            utilization: 0.10 + index / 2_000,
            volatilityBps: 1_000 + index,
            liquidityScore: 80,
            breached: false,
            lastMarkedAt: "2026-07-08T09:29:00.000Z",
            notes: ["intraday", `cell.${index}`]
        };
    }

    return grid;
}

function instrument(
    symbol: string,
    sector: "technology" | "financials" | "energy" | "healthcare" |
        "industrial" | "consumer" | "sovereign" | "crypto",
    price: number
): unknown {
    return {
        symbol,
        region: "US",
        currency: "USD",
        exchange: "XNAS",
        sector,
        price: money(price),
        bidAskBps: 2.5,
        halted: false,
        staleMs: 1_000
    };
}

function money(amount: number): unknown {
    return {
        amount,
        currency: "USD"
    };
}

function signedMoney(amount: number): unknown {
    return {
        amount,
        currency: "USD"
    };
}

function inspectSourceShape(source: string): SourceShapeStats {
    return Object.freeze({
        bytes: source.length,
        helperPredicates: countPattern(source, /function p\d+/g),
        helperCollectors: countPattern(source, /function c\d+/g),
        descriptorHelperCalls: countNeedle(source, "getOwnPropertyDescriptor"),
        ownNameScans: countNeedle(source, "Object.getOwnPropertyNames"),
        reflectOwnKeyScans: countNeedle(source, "Reflect.ownKeys"),
        regexpTests: countNeedle(source, ".test("),
        loops: countNeedle(source, "for(") + countNeedle(source, "for ("),
        failFastReturns: countNeedle(source, "return false"),
        sideTableReads: countNeedle(source, "l[") +
            countNeedle(source, "r[") +
            countNeedle(source, "k[") +
            countNeedle(source, "u["),
        directBracketReads: countPattern(source, /\[[a-z]\d+\]/g),
        discriminantDispatchHelpers: countNeedle(source, "const dj="),
        generatedFunctionStarts: countNeedle(source, "function ")
    });
}

function ratio(left: number, right: number): number {
    if (right === 0) {
        return 0;
    }

    return Math.round(left / right * 10_000) / 10_000;
}

function countNeedle(source: string, needle: string): number {
    let count = 0;
    let offset = 0;

    while (true) {
        const index = source.indexOf(needle, offset);

        if (index < 0) {
            return count;
        }

        count += 1;
        offset = index + needle.length;
    }
}

function countPattern(source: string, pattern: RegExp): number {
    const matches = source.match(pattern);
    return matches === null ? 0 : matches.length;
}

if (process.argv[1]?.endsWith("typesea-jit-optimization-lab.js") === true) {
    console.log(JSON.stringify(runTypeSeaJitOptimizationLab(), null, 2));
}
