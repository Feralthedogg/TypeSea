/**
 * @file base.ts
 * @brief Base guard implementation.
 */

import { SchemaTag } from "../kind/index.js";
import { checkSchema, isSchema } from "../evaluate/index.js";
import { lowerSchema } from "../lower/index.js";
import { optimizeGraph } from "../optimize/index.js";
import type { CheckResult } from "../issue/index.js";
import type { Graph } from "../ir/index.js";
import type { Schema } from "../schema/index.js";
import { TypeSeaAssertionError } from "./error.js";
import {
  checkRefinementInput,
  readConstructorSchema,
  readGuardSchema
} from "./read.js";
import { defineReadonlyProperty, isStrictTrue } from "./props.js";
import { registerConstructedGuard } from "./registry.js";
import type {
  Brand,
  Guard,
  Infer,
  Presence,
  PresenceSymbol,
  RuntimeValue,
  TypeSymbol
} from "./types.js";

/**
 * @brief base guard class contract.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class BaseGuard<
  TValue,
  TPresence extends Presence = "required"
> implements Guard<TValue, TPresence> {

  /**
   * @brief type symbol field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  public declare readonly [TypeSymbol]: TValue;

  /**
   * @brief presence symbol field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  public declare readonly [PresenceSymbol]: TPresence;

  /**
   * @brief schema field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  public declare readonly schema: Schema;

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
   * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(schema: Schema) {
    defineReadonlyProperty(this, "schema", readConstructorSchema(schema), true);
    registerConstructedGuard(this);
    if (new.target === BaseGuard) {
      Object.freeze(this);
    }
  }

  /**
   * @brief is routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is; ownership of newly created aggregates is transferred to the caller.
   */
  public is(
    this: unknown,
    value: unknown
  ): value is RuntimeValue<TValue, TPresence> {
    return isSchema(readGuardSchema(this, "guard receiver"), value);
  }

  /**
   * @brief check routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for check; ownership of newly created aggregates is transferred to the caller.
   */
  public check(
    this: unknown,
    value: unknown
  ): CheckResult<RuntimeValue<TValue, TPresence>> {
    return checkSchema<RuntimeValue<TValue, TPresence>>(
      readGuardSchema(this, "guard receiver"),
      value
    );
  }

  /**
   * @brief assert routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @post No result value is produced; effects are limited to the documented receiver or output buffer.
   */
  public assert(
    this: unknown,
    value: unknown
  ): asserts value is RuntimeValue<TValue, TPresence> {
    const result = checkSchema<RuntimeValue<TValue, TPresence>>(
      readGuardSchema(this, "guard receiver"),
      value
    );
    if (!result.ok) {
      throw new TypeSeaAssertionError(result.error);
    }
  }

  /**
   * @brief graph routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @returns Result for graph; ownership of newly created aggregates is transferred to the caller.
   */
  public graph(this: unknown): Graph {
    return optimizeGraph(lowerSchema(readGuardSchema(this, "guard receiver")));
  }

  /**
   * @brief optional routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for optional; ownership of newly created aggregates is transferred to the caller.
   */
  public optional(): BaseGuard<TValue, "optional"> {
    return new BaseGuard<TValue, "optional">({
      tag: SchemaTag.Optional,
      inner: readGuardSchema(this, "optional inner")
    });
  }

  /**
   * @brief undefinedable routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for undefinedable; ownership of newly created aggregates is transferred to the caller.
   */
  public undefinedable(): BaseGuard<TValue | undefined, TPresence> {
    return new BaseGuard<TValue | undefined, TPresence>({
      tag: SchemaTag.Undefinedable,
      inner: readGuardSchema(this, "undefinedable inner")
    });
  }

  /**
   * @brief nullable routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for nullable; ownership of newly created aggregates is transferred to the caller.
   */
  public nullable(): BaseGuard<TValue | null, TPresence> {
    return new BaseGuard<TValue | null, TPresence>({
      tag: SchemaTag.Nullable,
      inner: readGuardSchema(this, "nullable inner")
    });
  }

  /**
   * @brief array routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for array; ownership of newly created aggregates is transferred to the caller.
   */
  public array(): BaseGuard<RuntimeValue<TValue, TPresence>[]> {
    return new BaseGuard<RuntimeValue<TValue, TPresence>[]>({
      tag: SchemaTag.Array,
      item: readGuardSchema(this, "array item")
    });
  }

  /**
   * @brief brand routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for brand; ownership of newly created aggregates is transferred to the caller.
   */
  public brand<TBrand extends string>(): BaseGuard<
    Brand<TValue, TBrand>,
    TPresence
  > {
    return new BaseGuard<Brand<TValue, TBrand>, TPresence>({
      tag: SchemaTag.Brand,
      inner: readGuardSchema(this, "brand inner"),
      brand: ""
    });
  }

  /**
   * @brief refine routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
   * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
   * @returns Result for refine; ownership of newly created aggregates is transferred to the caller.
   */
  public refine(
    predicate: (value: RuntimeValue<TValue, TPresence>) => boolean,
    name: string
  ): BaseGuard<TValue, TPresence> {
    checkRefinementInput(predicate, name);
    return new BaseGuard<TValue, TPresence>({
      tag: SchemaTag.Refine,
      inner: readGuardSchema(this, "refine inner"),
      predicate: (value: unknown): boolean =>
        isStrictTrue(predicate(value)),
      name
    });
  }

  /**
   * @brief or routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param other Borrowed input slot named other; validation or normalization happens before stored state changes.
   * @returns Result for or; ownership of newly created aggregates is transferred to the caller.
   */
  public or<TOther extends Guard<unknown, Presence>>(
    other: TOther
  ): BaseGuard<RuntimeValue<TValue, TPresence> | Infer<TOther>> {
    return new BaseGuard<
      RuntimeValue<TValue, TPresence> | Infer<TOther>
    >({
      tag: SchemaTag.Union,
      options: [
        readGuardSchema(this, "union option 0"),
        readGuardSchema(other, "union option 1")
      ]
    });
  }

  /**
   * @brief intersect routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param other Borrowed input slot named other; validation or normalization happens before stored state changes.
   * @returns Result for intersect; ownership of newly created aggregates is transferred to the caller.
   */
  public intersect<TOther extends Guard<unknown, Presence>>(
    other: TOther
  ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>> {
    return new BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>>({
      tag: SchemaTag.Intersection,
      left: readGuardSchema(this, "intersection left"),
      right: readGuardSchema(other, "intersection right")
    });
  }
}
