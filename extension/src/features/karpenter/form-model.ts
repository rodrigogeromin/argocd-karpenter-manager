import type {ResourceKind} from './api';

export type FormErrors=Record<string,string>;
export type SelectorStatus={value:string;editable:boolean;reason?:string};

export function isRecord(value:unknown):value is Record<string,unknown> {
  return typeof value==='object'&&value!==null&&!Array.isArray(value);
}

export function getAtPath(value:unknown,path:ReadonlyArray<string|number>):unknown {
  let current=value;
  for(const part of path){
    if(!current||typeof current!=='object') return undefined;
    current=(current as Record<string|number,unknown>)[part];
  }
  return current;
}

export function setAtPath<T extends Record<string,unknown>>(value:T,path:ReadonlyArray<string|number>,next:unknown):T {
  const copy=JSON.parse(JSON.stringify(value)) as T;
  let current=copy as Record<string|number,unknown>;
  for(let i=0;i<path.length-1;i++){
    const part=path[i];
    const existing=current[part];
    if(!existing||typeof existing!=='object') current[part]=typeof path[i+1]==='number'?[]:{};
    current=current[part] as Record<string|number,unknown>;
  }
  const last=path[path.length-1];
  if(next===undefined) delete current[last];
  else current[last]=next;
  return copy;
}

export function readRequirement(spec:Record<string,unknown>,key:string):SelectorStatus {
  const requirements=getAtPath(spec,['template','spec','requirements']);
  if(!Array.isArray(requirements)) return {value:'',editable:true};
  const matches=requirements.filter(item=>isRecord(item)&&item.key===key);
  if(matches.length===0) return {value:'',editable:true};
  if(matches.length!==1||!isRecord(matches[0])||matches[0].operator!=='In'||!Array.isArray(matches[0].values)){
    return {value:'',editable:false,reason:'Esta regra usa uma configuração avançada e será preservada.'};
  }
  return {value:(matches[0].values as unknown[]).filter((v):v is string=>typeof v==='string').join(','),editable:true};
}

export function toggleRequirementValue(spec:Record<string,unknown>,key:string,value:string,checked:boolean):Record<string,unknown> {
  const requirements=getAtPath(spec,['template','spec','requirements']);
  const list=Array.isArray(requirements)?requirements:[];
  const matches=list.filter(item=>isRecord(item)&&item.key===key);
  if(matches.length>1||(matches.length===1&&(!isRecord(matches[0])||matches[0].operator!=='In'||!Array.isArray(matches[0].values)))) return spec;
  const existing=matches.length===1&&isRecord(matches[0])&&Array.isArray(matches[0].values)?matches[0].values.filter((v):v is string=>typeof v==='string'):[];
  const values=checked?Array.from(new Set([...existing,value])):existing.filter(item=>item!==value);
  const updated=list.filter(item=>!(isRecord(item)&&item.key===key));
  if(values.length){
    if(matches.length===1&&isRecord(matches[0])) updated.push({...matches[0],values});
    else updated.push({key,operator:'In',values});
  }
  return setAtPath(spec,['template','spec','requirements'],updated.length?updated:undefined);
}

export function inspectDiscoverySelector(spec:Record<string,unknown>,path:ReadonlyArray<string>):SelectorStatus {
  const terms=getAtPath(spec,path);
  if(terms===undefined) return {value:'',editable:true};
  if(!Array.isArray(terms)||terms.length!==1||!isRecord(terms[0])||!isRecord(terms[0].tags)) return {value:'',editable:false,reason:'O seletor atual combina IDs, nomes ou várias tags. Ele será mantido sem alterações.'};
  const tags=terms[0].tags;
  if(Object.keys(tags).length!==1||typeof tags['karpenter.sh/discovery']!=='string') return {value:'',editable:false,reason:'O seletor atual contém regras adicionais. Ele será mantido sem alterações.'};
  return {value:tags['karpenter.sh/discovery'],editable:true};
}

export function setDiscoverySelector(spec:Record<string,unknown>,path:ReadonlyArray<string>,value:string):Record<string,unknown> {
  const normalized=value.trim();
  return setAtPath(spec,path,normalized?[{tags:{'karpenter.sh/discovery':normalized}}]:[]);
}

export function validateSpec(kind:ResourceKind,spec:Record<string,unknown>):FormErrors {
  const errors:FormErrors={};
  if(kind==='nodepools'){
    const cpu=getAtPath(spec,['limits','cpu']);
    if(cpu!==undefined&&(!/^\d+(?:\.\d+)?$/.test(String(cpu))||Number(cpu)<=0)) errors.cpu='Informe CPU em cores, por exemplo 64.';
    const memory=getAtPath(spec,['limits','memory']);
    if(memory!==undefined&&(!/^\d+(?:\.\d+)?(?:Ki|Mi|Gi|Ti)$/.test(String(memory))||Number.parseFloat(String(memory))<=0)) errors.memory='Use um limite positivo com unidade, por exemplo 256Gi.';
    for(const [key,path] of [['consolidateAfter',['disruption','consolidateAfter']],['expireAfter',['template','spec','expireAfter']],['terminationGracePeriod',['template','spec','terminationGracePeriod']]] as const){
      const value=getAtPath(spec,path);
      if(value!==undefined&&!/^(?:Never|\d+(?:h|m|s)(?:\d+(?:h|m|s))*)$/.test(String(value))) errors[key]='Use uma duração como 30m, 12h ou 720h.';
    }
  } else {
    const role=String(spec.role??'').trim();
    const instanceProfile=String(spec.instanceProfile??'').trim();
    if((!role&&!instanceProfile)||(role&&instanceProfile)) errors.identity='Informe somente uma identidade: role IAM ou instance profile.';
    for(const [key,path,label] of [['subnets',['subnetSelectorTerms'],'subnets'],['securityGroups',['securityGroupSelectorTerms'],'grupos de segurança']] as const){
      const selector=getAtPath(spec,path);
      if(Array.isArray(selector)&&selector.length===0) errors[key]=`Selecione novamente os ${label} antes de salvar.`;
    }
    const hop=getAtPath(spec,['metadataOptions','httpPutResponseHopLimit']);
    if(hop!==undefined&&(!Number.isInteger(Number(hop))||Number(hop)<1||Number(hop)>64)) errors.hop='Informe um valor inteiro entre 1 e 64.';
    const tokens=getAtPath(spec,['metadataOptions','httpTokens']);
    if(tokens!==undefined&&!['required','optional'].includes(String(tokens))) errors.tokens='Escolha Required ou Optional.';
  }
  return errors;
}

function same(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b);}
export function describeChanges(kind:ResourceKind,before:Record<string,unknown>,after:Record<string,unknown>):string[] {
  const candidates=kind==='nodepools'?
    [['requirements',['template','spec','requirements']],['limits',['limits']],['disruption',['disruption']],['lifetime',['template','spec','expireAfter']],['drain',['template','spec','terminationGracePeriod']]] as const:
    [['ami',['amiSelectorTerms']],['identity',['role','instanceProfile']],['subnets',['subnetSelectorTerms']],['securityGroups',['securityGroupSelectorTerms']],['metadata',['metadataOptions']],['storage',['blockDeviceMappings']]] as const;
  const labels:Record<string,string>={requirements:'Regras de capacidade e agendamento',limits:'Limites de CPU e memória',disruption:'Política de consolidação',lifetime:'Tempo de vida dos nós',drain:'Prazo de drenagem dos nós',ami:'Imagem dos nós (AMI)',identity:'Identidade IAM',subnets:'Seleção de subnets',securityGroups:'Seleção de grupos de segurança',metadata:'Acesso a metadados IMDS',storage:'Armazenamento EBS'};
  return candidates.filter(([,path])=>!same(getAtPath(before,path),getAtPath(after,path))).map(([key])=>labels[key]);
}
