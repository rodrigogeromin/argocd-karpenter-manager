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
  assert.match(feature, /listResources/);
  assert.match(feature, /getResource/);
  assert.match(feature, /patchResource/);
  const api = await readFile(new URL('../extension/src/features/karpenter/api.ts', import.meta.url), 'utf8');
  assert.match(api, /\/extensions\/karpenter\/api\/v1/);
  assert.match(api, /Argocd-Application-Name/);
  assert.match(api, /Argocd-Project-Name/);
  assert.match(api, /response\.json\(\)\.catch/);
  assert.match(api, /body\.items\.map\(parseResource\)/);
  assert.match(feature, /<HelpFlyout onClose=/);
});

test('Karpenter editing uses guided fields with validation and review instead of a JSON editor', async () => {
  const feature = await readFile(new URL('../extension/src/features/karpenter/KarpenterManager.tsx', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../extension/src/features/karpenter/ResourceEditor.tsx', import.meta.url), 'utf8');
  const model = await readFile(new URL('../extension/src/features/karpenter/form-model.ts', import.meta.url), 'utf8');
  const help = await readFile(new URL('../extension/README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(feature, /<textarea/);
  assert.match(feature, /<ResourceEditor/);
  assert.match(feature, /Revisar alterações/);
  assert.match(feature, /Aplicar alterações/);
  assert.match(editor, /Limites de provisionamento/);
  assert.match(editor, /Acesso à AWS/);
  assert.match(editor, /Rede/);
  assert.match(model, /validateSpec/);
  assert.match(model, /O seletor atual contém regras adicionais/);
  assert.match(help, /guided forms/);
});

test('Karpenter proxy context is read from the Argo CD server config map', async () => {
  const api = await readFile(new URL('../extension/src/features/karpenter/api.ts', import.meta.url), 'utf8');
  const context = await readFile(new URL('../extension/src/argocd/gateway-context.ts', import.meta.url), 'utf8');
  const config = await readFile(new URL('../deploy/karpenter-manager-config.yaml', import.meta.url), 'utf8');
  const patch = await readFile(new URL('../deploy/argocd-server-patch.yaml', import.meta.url), 'utf8');
  const application = await readFile(new URL('../deploy/application.yaml', import.meta.url), 'utf8');
  assert.match(context, /window\.karpenterManagerConfig/);
  assert.match(context, /namespace:name/);
  assert.match(api, /readGatewayContext\(\)/);
  assert.doesNotMatch(api, /argocd:karpenter-manager|appset/);
  assert.match(config, /extension-0-karpenter-manager-config\.js/);
  assert.match(config, /window\.karpenterManagerConfig/);
  assert.match(patch, /extension-0-karpenter-manager-config\.js/);
  assert.match(application, /name: ARGOCD_APPLICATION/);
  assert.match(application, /name: ARGOCD_PROJECT/);
});

test('extension uses a host registration adapter', () => {
  assert.match(source, /registerSystemLevelExtension/);
  assert.match(source, /new MutationObserver/);
});
