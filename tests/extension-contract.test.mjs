import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const project = JSON.parse(await readFile(new URL('../extension/extension-project.json', import.meta.url)));
const source = await readFile(new URL('../extension/src/index.tsx', import.meta.url), 'utf8');

test('extension targets Argo CD system-level registration', () => {
  assert.equal(project.profile, 'system-level');
  assert.equal(project.registration.path, '/karpenter');
  assert.equal(project.hostContract.method, 'registerSystemLevelExtension');
  assert.deepEqual(project.hostContract.argumentMap, [
    'component', 'registration.title', 'registration.path', 'registration.icon',
  ]);
});

test('extension uses the authenticated proxy route and defers registration until host mount', () => {
  assert.match(source, /\/extensions\/karpenter\/api\/v1/);
  assert.match(source, /Argocd-Application-Name/);
  assert.match(source, /Argocd-Project-Name/);
  assert.match(source, /registerSystemLevelExtension\(Extension,'Karpenter','\/karpenter','fa-server'\)/);
  assert.match(source, /new MutationObserver/);
});
