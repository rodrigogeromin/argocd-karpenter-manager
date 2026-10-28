import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const project = JSON.parse(await readFile(new URL('../extension/extension-project.json', import.meta.url)));
const source = await readFile(new URL('../extension/src/argocd/register.ts', import.meta.url), 'utf8');
const help = await readFile(new URL('../extension/src/app/HelpFlyout.tsx', import.meta.url), 'utf8');

test('extension targets Argo CD system-level registration', () => {
  assert.equal(project.profile, 'system-level');
  assert.equal(project.registration.path, '/karpenter');
  assert.equal(project.hostContract.method, 'registerSystemLevelExtension');
  assert.equal(project.hostContract.profile, 'system-level');
  assert.deepEqual(project.hostContract.props, []);
  assert.deepEqual(project.hostContract.flyoutProps, []);
  assert.equal(project.hostContract.runtime.react, '19.2.6');
  assert.deepEqual(project.hostContract.argumentMap, [
    'component', 'registration.title', 'registration.path', 'registration.icon',
  ]);
});

test('extension registers manifest metadata after host mount', () => {
  assert.match(source, /project\.registration\.title/);
  assert.match(source, /project\.registration\.path/);
  assert.match(source, /project\.registration\.icon/);
  assert.match(source, /new MutationObserver/);
});

test('feature help renders bundled Markdown in an accessible dialog', () => {
  assert.match(help, /import helpMarkdown from '\.\.\/\.\.\/README\.md'/);
  assert.match(help, /<ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}>/);
  assert.match(help, /role="dialog" aria-modal="true"/);
  assert.match(help, /event\.key==='Escape'/);
  assert.match(help, /previous\?\.focus\(\)/);
});

test('Karpenter feature continues to use the authenticated proxy route', async () => {
  const feature = await readFile(new URL('../extension/src/features/karpenter/KarpenterManager.tsx', import.meta.url), 'utf8');
  assert.match(feature, /\/extensions\/karpenter\/api\/v1/);
  assert.match(feature, /Argocd-Application-Name/);
  assert.match(feature, /Argocd-Project-Name/);
  assert.match(feature, /<HelpFlyout onClose=/);
});

test('extension uses a host registration adapter', () => {
  assert.match(source, /registerSystemLevelExtension/);
  assert.match(source, /new MutationObserver/);
});
