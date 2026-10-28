import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
export const schema=JSON.parse(readFileSync(new URL('../references/parameters.schema.json',import.meta.url),'utf8'));
export const schemaVersion=2;
export const templateVersion='2.2.1';
const methodsByProfile={
  'resource-tab':'registerResourceExtension',
  'system-level':'registerSystemLevelExtension',
  'status-panel':'registerStatusPanelExtension',
  'top-bar-action':'registerTopBarActionMenuExt',
  'app-view':'registerAppViewExtension'
};
const propsByProfile={'resource-tab':['application','resource','tree'],'system-level':[],'status-panel':['application','openFlyout'],'top-bar-action':['application','tree','openFlyout'],'app-view':['application','tree']};
const mapsByProfile={
  'resource-tab':['component','registration.group','registration.kind','registration.tabTitle','registration.iconOptions'],
  'system-level':['component','registration.title','registration.path','registration.icon'],
  'status-panel':['component','registration.title','registration.id','component.flyout'],
  'top-bar-action':['component','registration.title','registration.id','component.flyout','callback.shouldDisplay','registration.icon','registration.isMiddle'],
  'app-view':['component','registration.title','registration.icon','callback.shouldDisplay']
};
const sourceFiles=['ui/src/app/shared/services/extensions-service.ts','ui/src/app/index.tsx','ui/package.json','ui/pnpm-lock.yaml'];
// Presets are transcribed from exact tagged upstream sources. Other releases can
// provide an audited contract object in the generation parameters.
export const contracts={
  '3.0.0':{tag:'v3.0.0',globals:['React','ReactDOM'],jsxMode:'classic',methods:{
    'resource-tab':'registerResourceExtension(component, group, kind, tabTitle, opts?)',
    'system-level':'registerSystemLevelExtension(component, title, path, icon)',
    'status-panel':'registerStatusPanelExtension(component, title, id, flyout?)',
    'top-bar-action':'registerTopBarActionMenuExt(component, title, id, flyout, shouldDisplay?, iconClassName?, isMiddle?)',
    'app-view':'registerAppViewExtension(component, title, icon)'
  },props:propsByProfile,lock:'yarn.lock',runtime:{react:'16.14.0',reactDom:'16.14.0',typesReact:'16.14.15',typesReactDom:'16.9.14'}},
  '3.5.3':{tag:'v3.5.3',globals:['React','ReactDOM','ReactJSXRuntime'],jsxMode:'automatic',methods:{
    'resource-tab':'registerResourceExtension(component, group, kind, tabTitle, opts?)',
    'system-level':'registerSystemLevelExtension(component, title, path, icon)',
    'status-panel':'registerStatusPanelExtension(component, title, id, flyout?)',
    'top-bar-action':'registerTopBarActionMenuExt(component, title, id, flyout, shouldDisplay?, iconClassName?, isMiddle?)',
    'app-view':'registerAppViewExtension(component, title, icon, shouldDisplay?)'
  },props:propsByProfile,lock:'pnpm-lock.yaml',runtime:{react:'19.2.6',reactDom:'19.2.6',typesReact:'19.2.14',typesReactDom:'19.2.3'}}
};
contracts['3.5.1']={...contracts['3.5.3'],tag:'v3.5.1'};
function validate(value,rule,location){
  if(value===undefined&&Object.hasOwn(rule,'default'))value=rule.default;
  if(value===undefined)return value;
  if(Object.hasOwn(rule,'const')&&value!==rule.const)throw new Error(`${location} must equal ${rule.const}`);
  if(rule.enum&&!rule.enum.includes(value))throw new Error(`${location} must be one of: ${rule.enum.join(', ')}`);
  if(rule.type==='string'){
    if(typeof value!=='string')throw new Error(`${location} must be a string`);
    value=value.trim();if(value.length<(rule.minLength??0)||value.length>(rule.maxLength??Infinity))throw new Error(`${location} has invalid length`);
    if(rule.pattern&&!new RegExp(rule.pattern).test(value))throw new Error(`${location} has invalid format`);
  }
  if(rule.type==='boolean'&&typeof value!=='boolean')throw new Error(`${location} must be a boolean`);
  if(rule.type==='array'){
    if(!Array.isArray(value)||(rule.minItems!==undefined&&value.length<rule.minItems))throw new Error(`${location} must be an array with at least ${rule.minItems??0} item(s)`);
    value=value.map((item,index)=>validate(item,rule.items,`${location}[${index}]`));
    if(rule.uniqueItems&&new Set(value).size!==value.length)throw new Error(`${location} items must be unique`);
  }
  if(rule.type==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${location} must be an object`);
    if(rule.additionalProperties===false)for(const key of Object.keys(value))if(!Object.hasOwn(rule.properties,key))throw new Error(`Unknown parameter: ${location}.${key}`);
    for(const key of rule.required??[])if(!Object.hasOwn(value,key))throw new Error(`${location}.${key} is required`);
    value=Object.fromEntries(Object.entries(rule.properties).map(([key,child])=>[key,validate(value[key],child,`${location}.${key}`)]).filter(([,child])=>child!==undefined));
  }
  return value;
}
function officialSource(url,tag){
  let parsed;try{parsed=new URL(url);}catch{throw new Error(`Host contract source must be an official Argo CD URL: ${url}`);}
  if(parsed.protocol!=='https:'||parsed.hostname!=='github.com'||parsed.pathname.split('/')[1]!=='argoproj'||parsed.pathname.split('/')[2]!=='argo-cd'||parsed.pathname.split('/')[3]!=='blob'||parsed.pathname.split('/')[4]!==tag||!parsed.pathname.split('/').slice(5).join('/').startsWith('ui/'))throw new Error(`Host contract source must point to official Argo CD tag ${tag}: ${url}`);
}
function contractFor(version,profile,input){
  const raw=input??(()=>{
    const preset=contracts[version];
    if(!preset)throw new Error(`No preset host contract for Argo CD ${version}. Supply an audited hostContract from the exact official tag.`);
    if(!preset.methods[profile])throw new Error(`Profile ${profile} is unavailable in ${preset.tag}. Available profiles: ${Object.keys(preset.methods).join(', ')}`);
    const method=methodsByProfile[profile];
    return {sourceKind:'official',tag:preset.tag,sources:sourceFiles.map(file=>file==='ui/pnpm-lock.yaml'?`ui/${preset.lock}`:file).map(file=>`https://github.com/argoproj/argo-cd/blob/${preset.tag}/${file}`),profile,method,signature:preset.methods[profile],props:preset.props[profile],globals:preset.globals,jsxMode:preset.jsxMode,runtime:preset.runtime,flyoutProps:['status-panel','top-bar-action'].includes(profile)?['application','tree']:[],argumentMap:mapsByProfile[profile].filter(token=>token!=='callback.shouldDisplay'||preset.methods[profile].includes('shouldDisplay'))};
  })();
  const c=validate(raw,schema.properties.hostContract,'parameters.hostContract');
  if(c.sourceKind==='official'&&c.tag!==`v${version}`)throw new Error(`hostContract.tag must be v${version} to match argoCdVersion ${version}`);
  if(c.sourceKind==='custom'&&!c.tag.trim())throw new Error('Custom hostContract.tag must identify the fork tag or commit');
  if(c.profile!==profile)throw new Error(`hostContract.profile must match selected profile ${profile}`);
  if(c.sourceKind==='official')c.sources.forEach(url=>officialSource(url,c.tag));
  else for(const url of c.sources){let parsed;try{parsed=new URL(url);}catch{throw new Error(`Custom host contract source must be an HTTPS source URL: ${url}`);}if(parsed.protocol!=='https:')throw new Error(`Custom host contract source must be an HTTPS source URL: ${url}`);}
  for(const required of ['extensions-service.ts','index.tsx','package.json'])if(!c.sources.some(url=>url.endsWith(required)))throw new Error(`hostContract.sources must include official evidence for ${required}`);
  if(!c.sources.some(url=>/\/(?:yarn.lock|pnpm-lock.yaml|package-lock.json)$/.test(url)))throw new Error('hostContract.sources must include an existing yarn, pnpm or npm lockfile');
  if(c.method!==methodsByProfile[profile])throw new Error(`hostContract.method ${c.method} does not match profile ${profile} method ${methodsByProfile[profile]}`);
  if(!c.signature.startsWith(`${c.method}(`))throw new Error('hostContract.signature must document the selected method and its arguments');
  if(c.props.some(prop=>!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prop)))throw new Error('hostContract.props must use valid TypeScript property names');
  if(c.argumentMap[0]!=='component')throw new Error('hostContract.argumentMap must start with component');
  const allowed={
    'resource-tab':['component','registration.group','registration.kind','registration.tabTitle','registration.iconOptions','registration.icon'],
    'system-level':['component','registration.title','registration.path','registration.icon'],
    'status-panel':['component','registration.title','registration.id','component.flyout','undefined'],
    'top-bar-action':['component','registration.title','registration.id','component.flyout','callback.shouldDisplay','registration.icon','registration.isMiddle','undefined'],
    'app-view':['component','registration.title','registration.icon','callback.shouldDisplay','undefined']
  }[profile];
  if(c.argumentMap.some(token=>!allowed.includes(token)))throw new Error(`hostContract.argumentMap has an argument unsupported by profile ${profile}`);
  const signatureArgs=c.signature.slice(c.signature.indexOf('(')+1,c.signature.lastIndexOf(')')).split(',').map(arg=>arg.trim()).filter(Boolean);
  const parameterToken={component:'component',group:'registration.group',kind:'registration.kind',tabTitle:'registration.tabTitle',opts:'registration.iconOptions',options:'registration.iconOptions',title:'registration.title',path:'registration.path',icon:'registration.icon',iconClassName:'registration.icon',id:'registration.id',flyout:'component.flyout',shouldDisplay:'callback.shouldDisplay',isMiddle:'registration.isMiddle'};
  if(c.argumentMap.length>signatureArgs.length)throw new Error('hostContract.argumentMap has more arguments than the selected method signature');
  for(let index=0;index<c.argumentMap.length;index++){
    const parameter=signatureArgs[index].replace(/\s*=.*$/,'').replace(/\?$/,'').trim();
    const optional=/\?|=/.test(signatureArgs[index]);
    if(c.argumentMap[index]!==parameterToken[parameter]&&!(c.argumentMap[index]==='undefined'&&optional))throw new Error(`hostContract.argumentMap[${index}] must map signature parameter ${parameter}`);
  }
  for(let index=c.argumentMap.length;index<signatureArgs.length;index++)if(!/[?=]/.test(signatureArgs[index]))throw new Error(`hostContract.argumentMap is missing required signature parameter ${signatureArgs[index]}`);
  if(c.argumentMap.includes('callback.shouldDisplay')&&!c.signature.includes('shouldDisplay'))throw new Error('hostContract.argumentMap includes shouldDisplay but signature does not');
  if(!c.globals.includes('React'))throw new Error('hostContract.globals must include React');
  if(c.jsxMode==='automatic'&&!c.globals.includes('ReactJSXRuntime'))throw new Error('Automatic JSX mode requires ReactJSXRuntime in hostContract.globals');
  if(c.flyoutProps?.some(prop=>!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prop)))throw new Error('hostContract.flyoutProps must use valid property names');
  if(c.runtime&&c.runtime.react.split('.')[0]!==c.runtime.reactDom.split('.')[0])throw new Error('Host React and ReactDOM major versions must match');
  return c;
}
export function normalize(input){
  const p=validate(input,schema,'parameters');if(!p)throw new Error('Parameters required');
  const contract=contractFor(p.argoCdVersion,p.profile,p.hostContract);
  const candidates={
    'resource-tab':['group','kind','tabTitle','icon'],
    'system-level':['title','path','icon'],
    'status-panel':['title','id','flyout'],
    'top-bar-action':['title','id','icon','isMiddle',...(contract.argumentMap.includes('callback.shouldDisplay')?['shouldDisplay']:[]),'flyout'],
    'app-view':['title','icon',...(contract.argumentMap.includes('callback.shouldDisplay')?['shouldDisplay']:[])]
  }[p.profile];
  const fields=candidates.filter(key=>key==='flyout'?contract.argumentMap.includes('component.flyout'):key==='icon'?contract.argumentMap.some(token=>['registration.icon','registration.iconOptions'].includes(token)):key==='shouldDisplay'?contract.argumentMap.includes('callback.shouldDisplay'):contract.argumentMap.includes(`registration.${key}`));
  for(const key of Object.keys(p.registration??{}))if(!fields.includes(key))throw new Error(`Registration parameter ${key} is not supported by profile ${p.profile} in ${contract.tag}`);
  const defaults={group:'argoproj.io',kind:'Application',tabTitle:p.name,title:p.name,id:p.name,path:`/${p.name}`,icon:'fa-puzzle-piece',shouldDisplay:true,isMiddle:false,flyout:p.profile==='top-bar-action'};
  const registration=Object.fromEntries(fields.map(key=>[key,p.registration?.[key]??defaults[key]]));
  if(p.profile==='top-bar-action'&&contract.argumentMap.includes('component.flyout')&&!/flyout[?=]/.test(contract.signature)&&p.registration?.flyout===false)throw new Error(`Profile top-bar-action in ${contract.tag} requires a flyout component`);
  return {...p,schemaVersion,templateVersion,registration,hostContract:contract};
}
export function validateProject(project){
  if(!project||typeof project!=='object'||Array.isArray(project))throw new Error('Project configuration must be an object');
  const normalized=normalize(Object.fromEntries(Object.keys(schema.properties).filter(k=>Object.hasOwn(project,k)).map(k=>[k,project[k]])));
  if(project.schemaVersion!==schemaVersion)throw new Error('Unsupported project schema version; explicit manifest migration required');
  if(typeof project.templateVersion!=='string'||!new RegExp(schema.properties.argoCdVersion.pattern).test(project.templateVersion))throw new Error('Project templateVersion must record a valid SemVer origin');
  if(!isDeepStrictEqual(project.hostContract,normalized.hostContract))throw new Error('Host contract provenance does not match the audited release');
  if(!isDeepStrictEqual(project.registration,normalized.registration))throw new Error('Project registration must include normalized values; defaults cannot replace missing manifest fields');
  return {...normalized,templateVersion:project.templateVersion};
}
