/**
 * @file file.ts
 * @brief File guard implementation.
 * @details File predicates validate browser/Node File objects without requiring
 * the File constructor to exist at module load time.
 */

import { FileCheckTag, SchemaTag } from "../kind/index.js";
import type { FileSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { readCheckMessage } from "./check-message.js";
import {
    checkFileSizeBound,
    checkMimePatterns,
    readFileConstructorSchema,
    readFileMethodSchema
} from "./read.js";
import type { CheckMessageInput, Presence } from "./types.js";

/**
 * @brief Persistent builder for File predicates.
 * @details Size and MIME methods append normalized immutable checks while the
 * base schema stays frozen by construction.
 */
export class FileGuard<
    TPresence extends Presence = "required"
> extends BaseGuard<File, TPresence> {

    /**
     * @brief Construct a frozen File guard.
     * @param schema File schema backing this guard.
     */
    public constructor(schema: FileSchema) {
        super(readFileConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Require an inclusive minimum byte size.
     * @param value Non-negative integer byte count.
     * @returns Fresh FileGuard with an appended minimum size check.
     */
    public min(value: number, options?: CheckMessageInput): FileGuard<TPresence> {
        const schema = readFileMethodSchema(this, "file min receiver");
        const bound = checkFileSizeBound(value, "min");
        const message = readCheckMessage(options);
        return new FileGuard<TPresence>({
            tag: SchemaTag.File,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: FileCheckTag.Min,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require an inclusive maximum byte size.
     * @param value Non-negative integer byte count.
     * @returns Fresh FileGuard with an appended maximum size check.
     */
    public max(value: number, options?: CheckMessageInput): FileGuard<TPresence> {
        const schema = readFileMethodSchema(this, "file max receiver");
        const bound = checkFileSizeBound(value, "max");
        const message = readCheckMessage(options);
        return new FileGuard<TPresence>({
            tag: SchemaTag.File,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: FileCheckTag.Max,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require one or more MIME type patterns.
     * @param value Exact MIME type or top-level wildcard list.
     * @returns Fresh FileGuard with an appended MIME check.
     */
    public mime(
        value: string | readonly string[],
        options?: CheckMessageInput
    ): FileGuard<TPresence> {
        const schema = readFileMethodSchema(this, "file mime receiver");
        const message = readCheckMessage(options);
        return new FileGuard<TPresence>({
            tag: SchemaTag.File,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: FileCheckTag.Mime,
                    values: checkMimePatterns(value),
                    message
                }
            ]
        });
    }
}
