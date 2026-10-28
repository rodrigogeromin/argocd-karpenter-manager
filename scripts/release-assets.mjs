import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../extension/package.json', import.meta.url), 'utf8'));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
assert.match(pkg.version, semver, 'extension/package.json must have a valid SemVer version');
const tag = process.env.RELEASE_TAG;
const repository = process.env.RELEASE_REPOSITORY;
assert.equal(tag, `v${pkg.version}`, 'release tag must equal v + extension/package.json.version');
assert.match(repository ?? '', /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/, 'invalid release repository');
if (process.argv.includes('--validate-only')) {
  console.log(`Release identity valid: ${repository}@${tag}`);
} else {
  const archive = await readFile(new URL('../dist/karpenter-manager.tar.gz', import.meta.url));
  const digest = createHash('sha256').update(archive).digest('hex');
  await writeFile(new URL('../dist/checksums.txt', import.meta.url), `${digest}  karpenter-manager.tar.gz\n`);
  await writeFile(new URL('../dist/release-info.txt', import.meta.url), `${repository}@${tag}\n`);
  console.log(`Release assets prepared for ${repository}@${tag}`);
}
