import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const infraDir = join(repoDir, 'aws', 'infra');

let cached;

/**
 * Terraform's outputs as a plain object ({region: 'eu-central-1', assets_bucket: '…', …}).
 * Terraform is the single source of truth for names, so the ops scripts have no config of their own.
 * Reads the remote state: needs `terraform init` done in aws/infra and AWS credentials.
 */
export function tf() {
    if (cached) {
        return cached;
    }
    let out;
    try {
        out = execFileSync('terraform', [`-chdir=${infraDir}`, 'output', '-json'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (e) {
        throw new Error(`Could not read Terraform outputs from ${infraDir}.\n` +
            `Run 'terraform init' and 'terraform apply' there first (and sign in to AWS).\n${String(e.stderr || e.message).trim()}`);
    }
    const parsed = JSON.parse(out);
    if (!parsed.assets_bucket) {
        throw new Error(`Terraform outputs are empty: the stack in ${infraDir} has not been applied yet.`);
    }
    cached = Object.fromEntries(Object.entries(parsed).map(([name, output]) => [name, output.value]));
    return cached;
}

// Not infrastructure: where the app and its OpenNext build output are in the repo.
export const webDir = join(repoDir, 'web');
export const openNextDir = join(webDir, '.open-next');
