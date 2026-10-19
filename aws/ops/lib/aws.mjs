import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {constants, tmpdir} from 'node:os';
import {join} from 'node:path';
import {tf} from './outputs.mjs';

export class AwsError extends Error {
    constructor(args, stderr) {
        super(`aws ${args.join(' ')}\n${stderr}`);
        this.stderr = stderr;
    }
}

const quoteForLog = (arg) => (/[\s"'{}[\]$*]/.test(arg) ? `'${arg}'` : arg);

/**
 * Runs `aws <args> --region <region> --output json` and returns parsed JSON
 * (or null when the command prints nothing, e.g. waiters).
 * Every command is echoed so the script output doubles as documentation.
 */
export function aws(args, {quiet = false} = {}) {
    if (!quiet) {
        console.log(`$ aws ${args.map(quoteForLog).join(' ')}`);
    }
    const fullArgs = [...args, '--region', tf().region, '--output', 'json', '--no-cli-pager'];
    try {
        const out = execFileSync('aws', fullArgs, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {...process.env, AWS_PAGER: ''},
            maxBuffer: 64 * 1024 * 1024,
        });
        return out.trim() ? JSON.parse(out) : null;
    } catch (e) {
        throw new AwsError(args, String(e.stderr || e.message).trim());
    }
}

/** Like aws(), but returns null when the error output matches `notFound`. */
export function tryAws(args, notFound, options) {
    try {
        return aws(args, options);
    } catch (e) {
        if (e instanceof AwsError && notFound.test(e.stderr)) {
            return null;
        }
        throw e;
    }
}

/** Runs a long aws command (s3 sync, logs tail) with its output streamed to this terminal. */
export function awsStreamed(args) {
    console.log(`$ aws ${args.map(quoteForLog).join(' ')}`);
    execFileSync('aws', [...args, '--region', tf().region], {stdio: 'inherit'});
}

// Temp files (the server zip). Removed on exit.
let tempDir;
let tempCounter = 0;
process.on('exit', () => tempDir && rmSync(tempDir, {recursive: true, force: true}));
// Signals terminate Node without firing 'exit'; turn them into a normal exit
// (conventional 128 + signal number code) so the cleanup above still runs.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => process.exit(128 + constants.signals[signal]));
}

export function tempPath(name) {
    tempDir ??= mkdtempSync(join(tmpdir(), 'simple-shop-aws-'));
    return join(tempDir, `${tempCounter++}-${name}`);
}

export const log = (message) => console.log(`\n==> ${message}`);

/** Wraps a script's main so AWS errors print cleanly instead of as a stack trace. */
export function main(fn) {
    fn().catch((e) => {
        console.error(`\nERROR: ${e.message}`);
        process.exit(1);
    });
}
