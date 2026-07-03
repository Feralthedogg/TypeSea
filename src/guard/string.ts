/**
 * @file string.ts
 * @brief String guard implementation.
 */

import { SchemaTag, StringCheckTag } from "../kind/index.js";
import type { StringSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { isPlainRegExp } from "./props.js";
import {
  checkStringLengthBound,
  readStringConstructorSchema,
  readStringMethodSchema
} from "./read.js";
import type { Presence } from "./types.js";

/**
 * @brief string guard class contract.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class StringGuard<
  TPresence extends Presence = "required"
> extends BaseGuard<string, TPresence> {

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
   * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(schema: StringSchema) {
    super(readStringConstructorSchema(schema));
    Object.freeze(this);
  }

  /**
   * @brief min routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for min; ownership of newly created aggregates is transferred to the caller.
   */
  public min(value: number): StringGuard<TPresence> {
    const schema = readStringMethodSchema(this, "string min receiver");
    const bound = checkStringLengthBound(value, "min");
    return new StringGuard<TPresence>({
      tag: SchemaTag.String,
      checks: [
        ...schema.checks,
        {
          tag: StringCheckTag.Min,
          value: bound
        }
      ]
    });
  }

  /**
   * @brief max routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for max; ownership of newly created aggregates is transferred to the caller.
   */
  public max(value: number): StringGuard<TPresence> {
    const schema = readStringMethodSchema(this, "string max receiver");
    const bound = checkStringLengthBound(value, "max");
    return new StringGuard<TPresence>({
      tag: SchemaTag.String,
      checks: [
        ...schema.checks,
        {
          tag: StringCheckTag.Max,
          value: bound
        }
      ]
    });
  }

  /**
   * @brief regex routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param pattern Borrowed input slot named pattern; validation or normalization happens before stored state changes.
   * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
   * @returns Result for regex; ownership of newly created aggregates is transferred to the caller.
   */
  public regex(pattern: RegExp, name: string): StringGuard<TPresence> {
    if (!isPlainRegExp(pattern)) {
      throw new TypeError("regex pattern must be a plain RegExp");
    }
    if (typeof name !== "string") {
      throw new TypeError("regex name must be a string");
    }
    const schema = readStringMethodSchema(this, "string regex receiver");
    return new StringGuard<TPresence>({
      tag: SchemaTag.String,
      checks: [
        ...schema.checks,
        {
          tag: StringCheckTag.Regex,
          regex: new RegExp(pattern.source, pattern.flags),
          name
        }
      ]
    });
  }

  /**
   * @brief uuid routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for uuid; ownership of newly created aggregates is transferred to the caller.
   */
  public uuid(): StringGuard<TPresence> {
    const schema = readStringMethodSchema(this, "string uuid receiver");
    return new StringGuard<TPresence>({
      tag: SchemaTag.String,
      checks: [
        ...schema.checks,
        {
          tag: StringCheckTag.Uuid
        }
      ]
    });
  }
}
