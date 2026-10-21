import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, businessMetrics } from './metrics.js';
const directory=process.argv[2]?resolve(process.argv[2]):dirname(fileURLToPath(import.meta.url));
const read=name=>parseCsv(readFileSync(resolve(directory,`${name}.csv`),'utf8'));
console.log(JSON.stringify(businessMetrics({interviews:read('interviews'),participants:read('participants'),customers:read('customers')}),null,2));
