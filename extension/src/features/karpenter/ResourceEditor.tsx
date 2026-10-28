import React from 'react';
import type {ResourceKind} from './api';
import {getAtPath, inspectDiscoverySelector, readRequirement, setAtPath, setDiscoverySelector, toggleRequirementValue} from './form-model';

type Props={kind:ResourceKind;spec:Record<string,unknown>;errors:Record<string,string>;onChange:(spec:Record<string,unknown>)=>void};
const capacities=['spot','on-demand','reserved'];
const architectures=['amd64','arm64'];
const categories=['c','m','r','t','i','d'];
function Section({title,help,children}:{title:string;help?:string;children:React.ReactNode}){return <section className="km-form-section"><h3>{title}</h3>{help&&<p className="km-help-text">{help}</p>}{children}</section>}
function Field({label,help,error,children}:{label:string;help?:string;error?:string;children:React.ReactNode}){return <label className="km-field"><span>{label}</span>{children}{help&&<small>{help}</small>}{error&&<small className="km-field-error">{error}</small>}</label>}
function CheckGroup({label,help,values,selected,onToggle,disabled=false}:{label:string;help?:string;values:string[];selected:string[];onToggle:(value:string,checked:boolean)=>void;disabled?:boolean}){return <fieldset className="km-check-group" disabled={disabled}><legend>{label}</legend>{help&&<small>{help}</small>}<div className="km-checks">{values.map(value=><label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={e=>onToggle(value,e.target.checked)}/>{value}</label>)}</div></fieldset>}

export function ResourceEditor({kind,spec,errors,onChange}:Props){
  const set=(path:Array<string|number>,value:unknown)=>onChange(setAtPath(spec,path,value));
  if(kind==='nodepools'){
    const requirement=(key:string,choices:string[])=>{const current=readRequirement(spec,key);const selected=current.value?current.value.split(','):[];return <><CheckGroup label={key==='karpenter.sh/capacity-type'?'Tipo de capacidade':'Arquitetura'} values={choices} selected={selected} disabled={!current.editable} onToggle={(v,c)=>onChange(toggleRequirementValue(spec,key,v,c))}/>{!current.editable&&<p className="km-preserved">{current.reason}</p>}</>;};
    const categoriesState=readRequirement(spec,'karpenter.k8s.aws/instance-category');
    return <div className="km-form">
      <Section title="Capacidade" help="Escolha opções conhecidas. Deixe sem seleção para não adicionar uma restrição.">{requirement('karpenter.sh/capacity-type',capacities)}{requirement('kubernetes.io/arch',architectures)}<CheckGroup label="Famílias de instância" help="Exemplos de famílias comuns; valores avançados existentes são preservados." values={categories} selected={categoriesState.value?categoriesState.value.split(','):[]} disabled={!categoriesState.editable} onToggle={(v,c)=>onChange(toggleRequirementValue(spec,'karpenter.k8s.aws/instance-category',v,c))}/>{!categoriesState.editable&&<p className="km-preserved">{categoriesState.reason}</p>}</Section>
      <Section title="Limites de provisionamento" help="Limites ajudam a controlar o total de r��y����k�w��h.';
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
