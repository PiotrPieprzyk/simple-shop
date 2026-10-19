import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Zips the contents of `dir` (not the folder itself) into `zipPath`, without npm dependencies.
 *   - Windows and macOS: bsdtar, which writes zip files (`tar -a` picks the format from .zip).
 *     On Windows the system one is called by full path: Git Bash's GNU tar can't write zips.
 *     PowerShell's Compress-Archive isn't used: 5.1 writes backslashes into entry names,
 *     which Lambda can't unpack.
 *   - Linux: Info-ZIP `zip`.
 */
export function zipDir(dir, zipPath) {
    // Top-level names rather than '.', so entries are 'index.mjs', not './index.mjs'.
    const entries = readdirSync(dir);
    if (process.platform === 'linux') {
        execFileSync('zip', ['-qr', '-y', zipPath, ...entries], {cwd: dir, stdio: 'inherit'});
        return;
    }
    const tar = process.platform === 'win32'
        ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
        : 'tar';
    execFileSync(tar, ['-a', '-c', '-f', zipPath, '-C', dir, ...entries], {stdio: 'inherit'});
}
