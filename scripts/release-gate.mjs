import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
    ["full project check", npm, ["run", "check"]],
    ["clean consumer install", npm, ["run", "check:consumer"]],
    ["benchmark smoke", npm, ["run", "bench", "--", "--run"]],
    ["package dry run", npm, ["run", "pack:dry"]]
];

const result = runSteps(steps);
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run steps.
 */
function runSteps(items) {
    for (let index = 0; index < items.length; index += 1) {
        const step = items[index];
        if (step === undefined) {
            continue;
        }
        const [label, command, args] = step;
        console.log(`\n==> ${label}`);
        const result = run(command, args);
        if (!result.ok) {
            return result;
        }
    }
    console.log("\nrelease gate ok");
    return ok(undefined);
}

/**
 * @brief Run local helper.
 */
function run(command, args) {
    const child = spawnSync(command, args, {
        stdio: "inherit"
    });
    if (child.error !== undefined) {
        return err(`${command} failed to start: ${String(child.error)}`);
    }
    if (child.status !== 0) {
        return err(`${command} ${args.join(" ")} failed with ${String(child.status)}`);
    }
    return ok(undefined);
}

/**
 * @brief Construct a successful result value.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 */
function err(error) {
    return { ok: false, error };
}
