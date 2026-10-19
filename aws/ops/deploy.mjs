// Builds web/ with OpenNext and deploys it: assets to S3, code to Lambda, then a CloudFront
// invalidation and a smoke test.
//
//   node aws/ops/deploy.mjs                (npm ci + open-next build, then deploy)
//   node aws/ops/deploy.mjs --skip-build   (deploy the existing web/.open-next output)
import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {aws, awsStreamed, log, main, tempPath} from './lib/aws.mjs';
import {openNextDir, repoDir, tf, webDir} from './lib/outputs.mjs';
import {zipDir} from './lib/zip.mjs';

const {values: args} = parseArgs({options: {'skip-build': {type: 'boolean'}}});

const assetsDir = join(openNextDir, 'assets');
const serverDir = join(openNextDir, 'server-functions', 'default');
// Direct upload limit of update-function-code --zip-file.
const MAX_ZIP_BYTES = 50 * 1024 * 1024;
// Shown by the page when Sanity content can't be loaded (web/app/page.tsx).
const ERROR_MARKER = 'Content unavailable';

const git = (...gitArgs) => execFileSync('git', gitArgs, {cwd: repoDir, encoding: 'utf8'}).trim();

/** Short commit hash, with -dirty when there are uncommitted changes (which get deployed too). */
function version() {
    const dirty = git('status', '--porcelain') !== '';
    if (dirty) {
        console.warn('WARNING: the working tree has uncommitted changes. They are deployed too.');
    }
    return git('rev-parse', '--short', 'HEAD') + (dirty ? '-dirty' : '');
}

function build() {
    log('Building web/ with OpenNext');
    // npm is npm.cmd on Windows, which Node only runs through a shell.
    const run = (command, commandArgs) => {
        console.log(`$ ${command} ${commandArgs.join(' ')}`);
        execFileSync(command, commandArgs, {cwd: webDir, stdio: 'inherit', shell: process.platform === 'win32'});
    };
    run('npm', ['ci']);
    run('npx', ['open-next', 'build']);
}

/** Top-level asset entries must match the CloudFront behaviors (static_paths in terraform.tfvars). */
function checkStaticPaths() {
    const found = readdirSync(assetsDir, {withFileTypes: true})
        .filter((entry) => !['_next', 'BUILD_ID'].includes(entry.name))
        .map((entry) => entry.name + (entry.isDirectory() ? '/' : ''))
        .sort();
    const expected = [...tf().static_paths].sort();
    if (found.join() !== expected.join()) {
        console.warn(
            `WARNING: top-level files in web/public (and app/favicon.ico) don't match CloudFront's behaviors.\n` +
            `  Built:     ${JSON.stringify(found)}\n` +
            `  Terraform: ${JSON.stringify(expected)}\n` +
            `  Set static_paths in aws/infra/terraform.tfvars to the built list and run terraform apply.\n` +
            `  Until then the missing ones are answered by the server function (404).`,
        );
    }
}

/**
 * Assets go up BEFORE the code switch, so pages from the new version never reference missing files.
 * No --delete for _next/: browsers still on the old version need the old hashed files.
 */
function uploadAssets() {
    log('Uploading assets');
    const bucket = `s3://${tf().assets_bucket}`;
    awsStreamed(['s3', 'sync', join(assetsDir, '_next'), `${bucket}/_next`,
        '--cache-control', 'public,max-age=31536000,immutable', '--no-progress']);
    // Un-hashed files (favicon.ico, public/*): browsers revalidate, CloudFront keeps them until
    // the invalidation below.
    awsStreamed(['s3', 'sync', assetsDir, bucket,
        '--exclude', '_next/*', '--exclude', 'BUILD_ID',
        '--cache-control', 'public,max-age=0,s-maxage=31536000,must-revalidate', '--no-progress']);
}

function updateFunction(deployVersion) {
    log('Updating the server function');
    const zipPath = tempPath('server.zip');
    console.log(`Zipping ${serverDir}`);
    zipDir(serverDir, zipPath);
    const size = statSync(zipPath).size;
    console.log(`${(size / 1024 / 1024).toFixed(1)} MB`);
    if (size > MAX_ZIP_BYTES) {
        throw new Error(`The zip is over the 50 MB direct upload limit. Upload it to S3 and use --s3-bucket/--s3-key instead.`);
    }
    const name = tf().function_name;
    aws(['lambda', 'update-function-code', '--function-name', name, '--zip-file', `fileb://${zipPath}`]);
    aws(['lambda', 'wait', 'function-updated', '--function-name', name]);
    // A numbered version records what was deployed (see status.mjs). The function URL keeps
    // serving $LATEST, which is the same code.
    const published = aws(['lambda', 'publish-version', '--function-name', name, '--description', deployVersion]);
    console.log(`Published version ${published.Version} (${deployVersion})`);
}

function invalidate() {
    log('Invalidating the CloudFront cache');
    // Only the un-hashed files need it, but "/*" is simple and the first 1,000 paths a month are free.
    const result = aws(['cloudfront', 'create-invalidation', '--distribution-id', tf().distribution_id, '--paths', '/*']);
    console.log(`Invalidation ${result.Invalidation.Id}: ${result.Invalidation.Status}`);
}

async function smokeTest() {
    log('Smoke test');
    const appUrl = tf().app_url;
    let failure;
    // A few tries: the first request after a code update is a cold start.
    for (let attempt = 1; attempt <= 3; attempt++) {
        const response = await fetch(appUrl, {redirect: 'manual'});
        const body = await response.text();
        failure = response.status !== 200 ? `HTTP ${response.status}`
            : body.includes(ERROR_MARKER) ? `the page shows "${ERROR_MARKER}" (see: node aws/ops/logs.mjs)`
            : undefined;
        if (!failure) {
            break;
        }
        console.log(`  attempt ${attempt}: ${failure}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (failure) {
        throw new Error(`${appUrl}: ${failure}`);
    }
    console.log(`${appUrl}: 200, content loaded`);

    // Requests that bypass CloudFront have no x-origin-verify header and must be rejected.
    const direct = await fetch(tf().function_url, {redirect: 'manual'});
    if (direct.status !== 403) {
        throw new Error(`${tf().function_url} answered ${direct.status}, expected 403. Check web/proxy.ts.`);
    }
    console.log(`${tf().function_url}: 403 (CloudFront only)`);
}

main(async () => {
    const deployVersion = version();
    if (args['skip-build']) {
        console.log('Skipping the build: deploying the existing web/.open-next output.');
    } else {
        build();
    }
    if (!existsSync(join(serverDir, 'index.mjs'))) {
        throw new Error(`${serverDir}/index.mjs not found. Run the build (without --skip-build).`);
    }
    checkStaticPaths();
    uploadAssets();
    updateFunction(deployVersion);
    invalidate();
    await smokeTest();
    log('Done');
    console.log(`Deployed ${deployVersion} to ${tf().app_url}`);
});
