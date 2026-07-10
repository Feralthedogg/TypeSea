import type { PageServerLoad } from './$types';
import { highlightCode } from '$lib/server/syntax-highlight';

const quickStart = `import { compile, t, type Infer } from "typesea";

const User = t.strictObject({
    id: t.string.uuid(),
    age: t.number.int().gte(0),
    role: t.enum(["admin", "user"])
});

type User = Infer<typeof User>;
const isUser = compile(User);

if (isUser(input)) {
    input.id;
}`;

const migrationEnglish = `// Existing import
import { z } from "zod";

// Compatibility experiment
import { z } from "typesea/v4";

const User = z.object({
    id: z.string().uuid(),
    email: z.string().email()
}).strict();`;

const migrationKorean = `// 기존 import
import { z } from "zod";

// TypeSea 호환 계층 적용
import { z } from "typesea/v4";

const User = z.object({
    id: z.string().uuid(),
    email: z.string().email()
}).strict();`;

export const load: PageServerLoad = async () => {
    const [quickStartHtml, migrationEnglishHtml, migrationKoreanHtml] = await Promise.all([
        highlightCode(quickStart, 'typescript'),
        highlightCode(migrationEnglish, 'typescript'),
        highlightCode(migrationKorean, 'typescript')
    ]);

    return {
        codeExamples: {
            quickStart: quickStartHtml,
            migration: {
                en: migrationEnglishHtml,
                ko: migrationKoreanHtml
            }
        }
    };
};
