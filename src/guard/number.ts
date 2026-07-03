/**
 * @file number.ts
 * @brief Number guard implementation.
 */

import { NumberCheckTag, SchemaTag } from "../kind/index.js";
import type { NumberSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import {
  checkFiniteNumberBound,
  readNumberConstructorSchema,
  readNumberMethodSchema
} from "./read.js";
import type { Presence } from "./types.js";

/**
 * @brief number guard class contract.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class NumberGuard<
  TPresence extends Presence = "required"
> extends BaseGuard<number, TPresence> {

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
   * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(schema: NumberSchema) {
    super(readNumberConstructorSchema(schema));
    Object.freeze(this);
  }

  /**
   * @brief int routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for int; ownership of newly created aggregates is transferred to the caller.
   */
  public int(): NumberGuard<TPresence> {
    const schema = readNumberMethodSchema(this, "number int receiver");
    return new NumberGuard<TPresence>({
      tag: SchemaTag.Number,
      checks: [
        ...schema.checks,
        {
          tag: NumberCheckTag.Integer
        }
      ]
    });
  }

  /**
   * @brief gte routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for gte; ownership of newly created aggregates is transferred to the caller.
   */
  public gte(value: number): NumberGuard<TPresence> {
    const schema = readNumberMethodSchema(this, "number gte receiver");
    const bound = checkFiniteNumberBound(value, "gte");
    return new NumberGuard<TPresence>({
      tag: SchemaTag.Number,
      checks: [
        ...schema.checks,
        {
          tag: NumberCheckTag.Gte,
          value: bound
        }
      ]
    });
  }

  /**
   * @brief lte routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for lte; ownership of newly created aggregates is transferred to the caller.
   */
  public lte(value: number): NumberGuard<TPresence> {
    const schema = readNumberMethodSchema(this, "number lte receiver");
    const bound = checkFiniteNumberBound(value, "lte");
    return new NumberGuard<TPresence>({
      tag: SchemaTag.Number,
      checks: [
        ...schema.checks,
        {
          tag: NumberCheckTag.Lte,
          value: bound
        }
      ]
    });
  }
}
