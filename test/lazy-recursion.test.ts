import { describe, expect, test } from "vitest";
import { compile, t, type Guard } from "../src/index.js";

interface Node {
    readonly value: string;
    readonly children: Node[];
    readonly parent?: Node;
}

interface MutableNode {
    value: string;
    children: MutableNode[];
    parent?: MutableNode;
}

describe("lazy recursive schemas", () => {
    test("memoizes lazy resolution and terminates on cyclic object graphs", () => {
        let resolves = 0;
        const NodeGuard: Guard<Node> = t.lazy((): Guard<Node> => {
            resolves += 1;
            return t.object({
                value: t.string.min(1),
                children: t.array(NodeGuard),
                parent: t.optional(NodeGuard)
            });
        });
        const FastNode = compile(NodeGuard, { name: "recursiveNode" });
        const Forest = t.object({
            root: NodeGuard,
            alias: NodeGuard
        });
        const FastForest = compile(Forest, { name: "recursiveForest" });

        const root = makeNode("root");
        const child = makeNode("child");
        root.children.push(child, root);
        child.parent = root;

        expect(resolves).toBe(0);
        expect(NodeGuard.is(root)).toBe(true);
        expect(NodeGuard.check(root).ok).toBe(true);
        expect(FastNode.is(root)).toBe(true);
        expect(FastNode.check(root)).toEqual(NodeGuard.check(root));
        expect(FastForest.check({ root, alias: root })).toEqual(
            Forest.check({ root, alias: root })
        );
        expect(resolves).toBe(1);
    });

    test("revalidates shared references after leaving the active recursion path", () => {
        const NodeGuard: Guard<Node> = t.lazy((): Guard<Node> =>
            t.object({
                value: t.string.min(1),
                children: t.array(NodeGuard)
            })
        );
        const FastNode = compile(NodeGuard, { name: "sharedInvalidNode" });

        const shared = makeNode("");
        const root = makeNode("root");
        root.children.push(shared, shared);

        const interpreted = NodeGuard.check(root);
        const compiled = FastNode.check(root);

        expect(compiled).toEqual(interpreted);
        expect(interpreted.ok).toBe(false);
        if (!interpreted.ok) {
            expect(interpreted.error.map((issue) => issue.path)).toEqual([
                ["children", 0, "value"],
                ["children", 1, "value"]
            ]);
        }
    });

    test("preserves compiled fallback diagnostics through back edges", () => {
        const NodeGuard: Guard<Node> = t.lazy((): Guard<Node> =>
            t.object({
                value: t.string.min(1),
                children: t.array(NodeGuard),
                parent: t.optional(NodeGuard)
            })
        );
        const Forest = t.object({
            root: NodeGuard,
            alias: NodeGuard
        });
        const FastForest = compile(Forest, { name: "invalidRecursiveForest" });

        const root = makeNode("root");
        const child = makeNode("");
        root.children.push(child);
        child.parent = root;
        const value = {
            root,
            alias: root
        };

        const interpreted = Forest.check(value);
        const compiled = FastForest.check(value);

        expect(compiled).toEqual(interpreted);
        expect(interpreted.ok).toBe(false);
        if (!interpreted.ok) {
            expect(interpreted.error.map((issue) => issue.path)).toEqual([
                ["root", "children", 0, "value"],
                ["alias", "children", 0, "value"]
            ]);
        }
    });

    test("fails deep acyclic recursion through validation budget instead of throwing", () => {
        const NodeGuard: Guard<Node> = t.lazy((): Guard<Node> =>
            t.object({
                value: t.string.min(1),
                children: t.array(NodeGuard)
            })
        );
        const FastNode = compile(NodeGuard, { name: "deepRecursiveNode" });
        const deep = makeDeepNode(1_500);

        expect(() => NodeGuard.is(deep)).not.toThrow();
        expect(() => NodeGuard.check(deep)).not.toThrow();
        expect(() => FastNode.is(deep)).not.toThrow();
        expect(() => FastNode.check(deep)).not.toThrow();
        expect(NodeGuard.is(deep)).toBe(false);
        expect(FastNode.is(deep)).toBe(false);

        const interpreted = NodeGuard.check(deep);
        const compiled = FastNode.check(deep);
        expect(compiled).toEqual(interpreted);
        expect(interpreted.ok).toBe(false);
        if (!interpreted.ok) {
            expect(interpreted.error[0]?.code).toBe("expected_depth_limit");
        }
    });
});

/**
 * @brief Build node.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeNode(value: string): MutableNode {
    return {
        value,
        children: []
    };
}

/**
 * @brief Build deep node.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeDeepNode(depth: number): MutableNode {
    const root = makeNode("root");
    let cursor = root;
    for (let index = 0; index < depth; index += 1) {
        const child = makeNode("child");
        cursor.children.push(child);
        cursor = child;
    }
    return root;
}
