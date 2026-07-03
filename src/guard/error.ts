/**
 * @file error.ts
 * @brief TypeSea assertion error.
 */

import type { Issue } from "../issue/index.js";
import { copyIssueArray } from "../issue/index.js";
import { defineReadonlyProperty } from "./props.js";

/**
 * @brief type sea assertion error class contract.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class TypeSeaAssertionError extends Error {

  /**
   * @brief issues field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  public declare readonly issues: readonly Issue[];

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
   * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(issues: readonly Issue[]) {
    super("TypeSea assertion failed");
    this.name = "TypeSeaAssertionError";
    defineReadonlyProperty(this, "issues", copyIssueArray(issues), true);
  }
}
