import assert from 'node:assert/strict';
import {mkdir, readdir, readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(resolve(root, 'extension/extension-project.json')));
const name = config.name;
const bundle = `extension-${name}.js`;
const extensionDist = resolve(root, 'extension/dist');
const dist = resolve(root, 'dist');
assert.deepEqual(await readdir(resolve(extensionDist, 'resources')), [bundle]);
await mkdir(dist, {recursive: true});
const archivePath = resolve(dist, `${name}.tar.gz`);
execFileSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', archivePath, '-C', extensionDist, `resources/${bundle}`]);
assert.equal(execFileSync('tar', ['-tzf', archivePath], {encoding: 'utf8'}).trim(), `resources/${bundle}`);
console.log(`Created ${archivePath}`);
