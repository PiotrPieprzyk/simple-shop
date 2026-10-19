// Prints the server function's CloudWatch logs.
//
//   node aws/ops/logs.mjs                 (last hour)
//   node aws/ops/logs.mjs --since 10m
//   node aws/ops/logs.mjs --follow        (keep streaming new lines, Ctrl+C to stop)
import {parseArgs} from 'node:util';
import {awsStreamed, main} from './lib/aws.mjs';
import {tf} from './lib/outputs.mjs';

const {values: args} = parseArgs({options: {since: {type: 'string', default: '1h'}, follow: {type: 'boolean'}}});

main(async () => {
    if (!/^\d+[smhdw]$/.test(args.since)) {
        console.error('Usage: node aws/ops/logs.mjs [--since 10m|2h|1d] [--follow]');
        process.exit(1);
    }
    awsStreamed(['logs', 'tail', tf().log_group, '--since', args.since, '--format', 'short',
        ...(args.follow ? ['--follow'] : [])]);
});
