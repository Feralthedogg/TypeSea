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
 * @brief constructed compiled guards.
 */
const constructedCompiledGuards = new WeakSet<object>();

/**
 * @brief compiled base guard.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class CompiledBaseGuard<
  TValue,
  TPresence extends Presence = "required"
> extends BaseGuard<TValue, TPresence> implements CompiledGuard<TValue, TPresence> {
  public declare readonly source: string;
  private declare readonly test: BooleanPredicate;
  private declare readonly collect: IssueCollectorRoot;

  /**
   * @brief constructor.
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
   * @brief is.
           */
  public override is(
    this: unknown,
    value: unknown
  ): value is RuntimeValue<TValue, TPresence> {
    return isStrictTrue(readCompiledTest(this)(value));
  }

  /**
   * @brief check.
           */
  public override check(
    this: unknown,
    value: unknown
  ): CheckResult<RuntimeValue<TValue, TPresence>> {
    return runCompiledCheck<RuntimeValue<TValue, TPresence>>(this, value);
  }

  /**
   * @brief assert.
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
 * @brief compile.
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
 * @brief read compile schema.
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
 * @brief is strict true.
 */
function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief run compiled check.
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
 * @brief read compiled test.
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
 * @brief read compiled collect.
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
 * @brief define readonly property.
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
 * @brief read compile name.
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
 * @brief is record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is constructed compiled guard.
 */
function isConstructedCompiledGuard(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && constructedCompiledGuards.has(value);
}
