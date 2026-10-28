import {readFileSync} from 'node:fs';
import {validateProject} from './contract.mjs';
const path=new URL('../extension/extension-project.json',import.meta.url);
const project=JSON.parse(readFileSync(path,'utf8'));
const normalized=validateProject(project);
if(normalized.profile!=='system-level') throw new Error('Karpenter Manager must remain a system-level extension');
console.log(`Project contract valid: Argo CD ${normalized.argoCdVersion} / ${normalized.profile}`);
