import {readFileSync} from 'node:fs';
const project=JSON.parse(readFileSync(new URL('../extension/extension-project.json',import.meta.url),'utf8'));
const pkg=JSON.parse(readFileSync(new URL('../extension/package.json',import.meta.url),'utf8'));
const expected=project.hostContract.runtime;
for(const [field,name] of [['react','react'],['reactDom','react-dom']]) {
  if(pkg.dependencies[name]!==expected[field]) throw new Error(`${name} must match audited Argo CD runtime ${expected[field]}`);
}
console.log(`Runtime setup verified for Argo CD ${project.argoCdVersion} (React ${expected.react})`);
