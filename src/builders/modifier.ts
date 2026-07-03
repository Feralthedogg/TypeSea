/**
 * @file modifier.ts
 * @brief Presence, lazy, and refinement guard builders.
 */

import { SchemaTag } from "../kind/index.js";
import {
  BaseGuard,
  type Guard,
  type GuardPresence,
  type GuardValue,
  type Infer,
  type Presence
} from "../guard/index.js";
import type { Schema } from "../schema/index.js";
import { isStrictTrue, readGuardSchema } from "../internal/index.js";

/**
 * @brief optional function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for optional; ownership of newly created aggregates is transferred to the caller.
 */
export function optional<TGuard extends Guard<unknown, Presence>>(
  guard: TGuard
): BaseGuard<GuardValue<TGuard>, "optional"> {
  return new BaseGuard<GuardValue<TGuard>, "optional">({
    tag: SchemaTag.Optional,
    inner: readGuardSchema(guard, "optional inner")
  });
}

/**
 * @brief undefinedable function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for undefinedable; ownership of newly created aggregates is transferred to the caller.
 */
export function undefinedable<TGuard extends Guard<unknown, Presence>>(
  guard: TGuard
): BaseGuard<GuardValue<TGuard> | undefined, GuardPresence<TGuard>> {
  return new BaseGuard<GuardValue<TGuard> | undefined, GuardPresence<TGuard>>({
    tag: SchemaTag.Undefinedable,
    inner: readGuardSchema(guard, "undefinedable inner")
  });
}

/**
 * @brief nullable function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for nullable; ownership of newly created aggregates is transferred to the caller.
 */
export function nullable<TGuard extends Guard<unknown, Presence>>(
  guard: TGuard
): BaseGuard<GuardValue<TGuard> | null, GuardPresence<TGuard>> {
  return new BaseGuard<GuardValue<TGuard> | null, GuardPresence<TGuard>>({
    tag: SchemaTag.Nullable,
    inner: readGuardSchema(guard, "nullable inner")
  });
}

/**
 * @brief lazy function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param get Borrowed input slot named get; validation or normalization happens before stored state changes.
 * @returns Result for lazy; ownership of newly created aggregates is transferred to the caller.
 */
export function lazy<TGuard extends Guard<unknown, Presence>>(
  get: () => TGuard
): BaseGuard<Infer<TGuard>> {
  if (typeof get !== "function") {
    throw new TypeError("lazy resolver must be a function");
  }
  let cached: Schema | undefined;
  return new BaseGuard<Infer<TGuard>>({
    tag: SchemaTag.Lazy,
    get: (): Schema => {
      cached ??= readGuardSchema(get(), "lazy result");
      return cached;
    }
  });
}

/**
 * @brief refine function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @returns Result for refine; ownership of newly created aggregates is transferred to the caller.
 */
export function refine<TGuard extends Guard<unknown, Presence>>(
  guard: TGuard,
  predicate: (value: Infer<TGuard>) => boolean,
  name: string
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
  if (typeof predicate !== "function") {
    throw new TypeError("refinement predicate must be a function");
  }
  if (typeof name !== "string") {
    throw new TypeError("refinement name must be a string");
  }
  return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>({
    tag: SchemaTag.Refine,
    inner: readGuardSchema(guard, "refine inner"),
    predicate: (value: unknown): boolean =>
      isStrictTrue(predicate(value as Infer<TGuard>)),
    name
  });
}
