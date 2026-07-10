/**
 * @file number.ts
 * @brief Allocation-free numeric expressions shared by generated validators.
 */

/**
 * Emit the runtime counterpart of `isNumberMultipleOf` without adding a helper
 * call to generated number hot paths.
 */
export function numberMultipleOfExpression(subject: string, divisor: number): string {
    const ratio = `((${subject})/${String(divisor)})`;
    return `(Math.abs(${ratio}-Math.round(${ratio}))<` +
        `Number.EPSILON*Math.max(Math.abs(${ratio}),1))`;
}
