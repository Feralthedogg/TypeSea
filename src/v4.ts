/**
 * @file v4.ts
 * @brief Zod v4-shaped compatibility subpath.
 * @details This file exists so package-alias migrations can resolve
 * `zod/v4` to TypeSea without changing import specifiers.
 */

export * from "./zod.js";

import zod from "./zod.js";

export default zod;
