import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';

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
  await mkdir(new URL('../dist/', import.meta.url), {recursive: true});
  const archive = await readFile(new URL('../dist/karpenter-manager.tar.gz', import.meta.url));
  const digest = createHash('sha256').update(archive).digest('hex');
  await writeFile(new URL('../dist/checksums.txt', import.meta.url), `${digest}  karpenter-manager.tar.gz\n`);
  await writeFile(new URL('../dist/release-info.txt', import.meta.url), `${repository}@${tag}\n`);
  const patch = (await readFile(new URL('../deploy/argocd-server-patch.yaml', import.meta.url), 'utf8'))
    .replaceAll('__REPOSITORY__', repository).replaceAll('__TAG__', tag);
  assert(!/__REPOSITORY__|__TAG__/.test(patch), 'unresolved installer patch template value');
  await writeFile(new URL('../dist/argocd-server-patch.yaml', import.meta.url), patch);
  const guide = (await readFile(new URL('../docs/installation.md', import.meta.url), 'utf8'))
    .replaceAll('__REPOSITORY__', repository).replaceAll('__TAG__', tag);
  assert(!/__REPOSITORY__|__TAG__/.test(guide), 'unresolved installation guide template value');
  await Promise.all([
    copyFile(new URL('../deploy/application.yaml', import.meta.url), new URL('../dist/application.yaml', import.meta.url)),
    copyFile(new URL('../deploy/argocd-patches.yaml', import.meta.url), new URL('../dist/argocd-patches.yaml', import.meta.url)),
    writeFile(new URL('../dist/installation.md', import.meta.url), guide),
  ]);
  console.log(`Release assets prepared for ${repository}@${tag}`);
}
