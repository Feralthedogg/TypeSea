/**
 * @file compile/guard.ts
 * @brief Compiled guard construction and receiver validation.
 */

import {
  BaseGuard,
  TypeSeaAssertionError,
  type Guard,
  type Presence,
  type RuntimeValue
} from "../guard/index.js";
import type { CheckResult } from "../issue/index.js";
import { finalizeIssueArray } from "../issue/index.js";
import { err, ok } from "../result/index.js";
import {
  freezeSchema,
  isSchemaValue,
  type Schema
} from "../schema/index.js";
import {
  makeDynamicCheck,
  makeDynamicIssueCheck,
  strictKeys,
  type BooleanPredicate,
  type IsFactory,
  type IssueCollectorRoot
} from "./runtime.js";
import { emitCompiledSourceBundle } from "./source.js";
import type {
  CompileOptions,
  CompiledGuard
} from "./types.js";

/**
 * @brief constructed compiled guards constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const constructedCompiledGuards = new WeakSet<object>();

/**
 * @brief compiled base guard class contract.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class CompiledBaseGuard<
  TValue,
  TPresence extends Presence = "required"
> extends BaseGuard<TValue, TPresence> implements CompiledGuard<TValue, TPresence> {

  /**
   * @brief source field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  public declare readonly source: string;

  /**
   * @brief test field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  private declare readonly test: BooleanPredicate;

  /**
   * @brief collect field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  private declare readonly collect: IssueCollectorRoot;

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
   * @param test Borrowed input slot named test; validation or normalization happens before stored state changes.
   * @param collect Borrowed input slot named collect; validation or normalization happens before stored state changes.
   * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
   * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(
    schema: Schema,
    test: BooleanPredicate,
    collect: IssueCollectorRoot,
    source: string
  ) {
    if (typeof test !== "function") {
      throw new TypeError("compiled guard test must be a function");
    }
    if (typeof collect !== "function") {
      throw new TypeError("compiled guard collector must be a function");
    }
    if (typeof source !== "string") {
      throw new TypeError("compiled guard source must be a string");
    }
    super(schema);
    defineReadonlyProperty(this, "test", test, false);
    defineReadonlyProperty(this, "collect", collect, false);
    defineReadonlyProperty(this, "source", source, true);
    constructedCompiledGuards.add(this);
    Object.freeze(this);
  }

  /**
   * @brief is routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is; ownership of newly created aggregates is transferred to the caller.
   */
  public override is(
    this: unknown,
    value: unknown
  ): value is RuntimeValue<TValue, TPresence> {
    return isStrictTrue(readCompiledTest(this)(value));
  }

  /**
   * @brief check routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for check; ownership of newly created aggregates is transferred to the caller.
   */
  public override check(
    this: unknown,
    value: unknown
  ): CheckResult<RuntimeValue<TValue, TPresence>> {
    return runCompiledCheck<RuntimeValue<TValue, TPresence>>(this, value);
  }

  /**
   * @brief assert routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @post No result value is produced; effects are limited to the documented receiver or output buffer.
   */
  public override assert(
    this: unknown,
    value: unknown
  ): asserts value is RuntimeValue<TValue, TPresence> {
    const result = runCompiledCheck<RuntimeValue<TValue, TPresence>>(this, value);
    if (!result.ok) {
      throw new TypeSeaAssertionError(result.error);
    }
  }
}

/**
 * @brief compile function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for compile; ownership of newly created aggregates is transferred to the caller.
 */
export function compile<TValue, TPresence extends Presence>(
  guard: Guard<TValue, TPresence>,
  options?: Partial<CompileOptions>
): CompiledBaseGuard<TValue, TPresence> {
  const schema = readCompileSchema(guard);
  const name = readCompileName(options);
  const bundle = emitCompiledSourceBundle(schema, name);
  // compile() intentionally emits source so V8 can optimize the validator body.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    "l",
    "r",
    "k",
    "u",
    "d",
    "m",
    "sk",
    bundle.source
  ) as IsFactory;
  const dynamicCheck = makeDynamicCheck(bundle.dynamicSchemas);
  const runtime = factory(
    bundle.literals,
    bundle.regexps,
    bundle.keysets,
    bundle.strings,
    dynamicCheck,
    makeDynamicIssueCheck(bundle.dynamicSchemas),
    strictKeys
  );
  return new CompiledBaseGuard<TValue, TPresence>(
    schema,
    runtime.is,
    runtime.check,
    bundle.source
  );
}

/**
 * @brief read compile schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for read compile schema; ownership of newly created aggregates is transferred to the caller.
 */
function readCompileSchema(guard: unknown): Schema {
  if (!isRecord(guard)) {
    throw new TypeError("compile guard must be a TypeSea guard");
  }
  const schema = guard["schema"];
  if (!isSchemaValue(schema)) {
    throw new TypeError("compile guard must contain a valid TypeSea schema");
  }
  return freezeSchema(schema);
}

/**
 * @brief is strict true function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is strict true; ownership of newly created aggregates is transferred to the caller.
 */
function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief run compiled check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for run compiled check; ownership of newly created aggregates is transferred to the caller.
 */
function runCompiledCheck<TValue>(
  guard: unknown,
  value: unknown
): CheckResult<TValue> {
  const issues = finalizeIssueArray(readCompiledCollect(guard)(value));
  if (issues.length === 0) {
    return ok(value as TValue);
  }
  return err(issues);
}

/**
 * @brief read compiled test function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for read compiled test; ownership of newly created aggregates is transferred to the caller.
 */
function readCompiledTest(guard: unknown): BooleanPredicate {
  if (isConstructedCompiledGuard(guard)) {
    return guard["test"] as BooleanPredicate;
  }
  if (!isRecord(guard)) {
    throw new TypeError("compiled guard receiver must be a TypeSea guard");
  }
  const test = guard["test"];
  if (typeof test !== "function") {
    throw new TypeError("compiled guard receiver must contain a test function");
  }
  return test as BooleanPredicate;
}

/**
 * @brief read compiled collect function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for read compiled collect; ownership of newly created aggregates is transferred to the caller.
 */
function readCompiledCollect(guard: unknown): IssueCollectorRoot {
  if (isConstructedCompiledGuard(guard)) {
    return guard["collect"] as IssueCollectorRoot;
  }
  if (!isRecord(guard)) {
    throw new TypeError("compiled guard receiver must be a TypeSea guard");
  }
  const collect = guard["collect"];
  if (typeof collect !== "function") {
    throw new TypeError("compiled guard receiver must contain a collector function");
  }
  return collect as IssueCollectorRoot;
}

/**
 * @brief define readonly property function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param target Borrowed input slot named target; validation or normalization happens before stored state changes.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param enumerable Borrowed input slot named enumerable; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function defineReadonlyProperty(
  target: object,
  key: string,
  value: unknown,
  enumerable: boolean
): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable,
    value,
    writable: false
  });
}

/**
 * @brief read compile name function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for read compile name; ownership of newly created aggregates is transferred to the caller.
 */
function readCompileName(options: unknown): string {
  if (options === undefined) {
    return "typesea_is";
  }
  if (!isRecord(options)) {
    throw new TypeError("compile options must be an object");
  }
  const name = options["name"];
  if (name === undefined) {
    return "typesea_is";
  }
  if (typeof name !== "string") {
    throw new TypeError("compile name must be a string");
  }
  return name;
}

/**
 * @brief is record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is record; ownership of newly created aggregates is transferred to the caller.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is constructed compiled guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is constructed compiled guard; ownership of newly created aggregates is transferred to the caller.
 */
function isConstructedCompiledGuard(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && constructedCompiledGuards.has(value);
}
