/**
 * @file error.ts
 * @brief TypeSea assertion error.
 */

import type { Issue } from "../issue/index.js";
import { copyIssueArray } from "../issue/index.js";
import { defineReadonlyProperty } from "./props.js";

/**
 * @brief type sea assertion error.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class TypeSeaAssertionError extends Error {
  public declare readonly issues: readonly Issue[];

  /**
   * @brief constructor.
       * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(issues: readonly Issue[]) {
    super("TypeSea assertion failed");
    this.name = "TypeSeaAssertionError";
    defineReadonlyProperty(this, "issues", copyIssueArray(issues), true);
  }
}
