import assert from 'node:assert/strict';
import {readdir, readFile, stat} from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../extension/extension-project.json', import.meta.url)));
const expected = `extension-${config.name}.js`;
const files = await readdir(new URL('../extension/dist/resources/', import.meta.url));
assert.deepEqual(files, [expected], 'production build must emit exactly one extension bundle');
const bundle = await readFile(new URL(`../extension/dist/resources/${expected}`, import.meta.url), 'utf8');
assert.ok(bundle.length > 1000, 'extension bundle is unexpectedly small');
assert.ok(!(await stat(new URL(`../extension/dist/resources/${expected}`, import.meta.url))).isDirectory());
for (const forbidden of ['swagger-gateway', 'swagger-ui-dist']) assert.ok(!bundle.includes(forbidden), `unexpected reference: ${forbidden}`);
console.log(`Bundle contract passed: ${expected} (${bundle.length} bytes)`);
