// Shows the server function, the last deploy, the CloudFront distribution and whether the site answers.
//
//   node aws/ops/status.mjs
import {aws, main} from './lib/aws.mjs';
import {tf} from './lib/outputs.mjs';

main(async () => {
    const fn = aws(['lambda', 'get-function-configuration', '--function-name', tf().function_name], {quiet: true});
    // Each deploy publishes a version whose description is the git commit (deploy.mjs).
    const versions = aws(['lambda', 'list-versions-by-function', '--function-name', tf().function_name], {quiet: true})
        .Versions.filter((v) => v.Version !== '$LATEST')
        .sort((a, b) => Number(a.Version) - Number(b.Version));
    const last = versions.at(-1);
    const dist = aws(['cloudfront', 'get-distribution', '--id', tf().distribution_id], {quiet: true}).Distribution;

    console.log('Lambda');
    console.log(`  ${fn.FunctionName}  ${fn.State}/${fn.LastUpdateStatus}  ${fn.Runtime} ${fn.Architectures.join()}  ` +
        `${fn.MemorySize} MB  code ${(fn.CodeSize / 1024 / 1024).toFixed(1)} MB  modified ${fn.LastModified}`);

    console.log('Last deploy');
    console.log(last
        ? `  version ${last.Version}  ${last.Description || '(no description)'}  ${last.LastModified}`
        : '  (none: still the placeholder code, run node aws/ops/deploy.mjs)');

    console.log('CloudFront');
    console.log(`  ${dist.Id}  ${dist.Status}  ${dist.DomainName}  aliases ${dist.DistributionConfig.Aliases.Items?.join() ?? '-'}`);

    console.log('Site');
    try {
        const response = await fetch(tf().app_url, {redirect: 'manual'});
        console.log(`  ${tf().app_url}  HTTP ${response.status}`);
    } catch (e) {
        console.log(`  ${tf().app_url}  unreachable (${e.cause?.code ?? e.message})`);
    }
});
