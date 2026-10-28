import React, {useEffect, useState} from 'react';
import './style.css';

declare global { interface Window { extensionsAPI?: {registerSystemLevelExtension?: (component: React.ComponentType, title: string, path: string, icon: string) => void} } }
const API = '/extensions/karpenter/api/v1';
type Resource = {apiVersion?: string;kind?: string;metadata:{name:string;resourceVersion?:string};spec:Record<string, unknown>;status?:Record<string,unknown>};

async function request(path:string, init?:RequestInit) {
  const response=await fetch(`${API}${path}`,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...(init?.headers||{})}});
  if(!response.ok) { const body=await response.json().catch(()=>({})); throw new Error(body.detail || `API respondeu ${response.status}`); }
  return response.json();
}
function Extension() {
  const [kind,setKind]=useState<'nodepools'|'ec2nodeclasses'>('nodepools');
  const [items,setItems]=useState<Resource[]>([]); const [selected,setSelected]=useState<Resource|null>(null);
  const [draft,setDraft]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  async function load(nextKind=kind) { setBusy(true); setError(''); setNotice(''); setSelected(null); try { const data=await request(`/${nextKind}`); setItems(data.items||[]); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(()=>{void load(kind);},[kind]);
  async function select(name:string) {setBusy(true);setError('');setNotice('');try {const obj=await request(`/${kind}/${encodeURIComponent(name)}`);setSelected(obj);setDraft(JSON.stringify(obj.spec,null,2));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function save() {if(!selected)return; let spec;try{spec=JSON.parse(draft);}catch{setError('JSON inválido.');return;} if(!spec||typeof spec!=='object'||Array.isArray(spec)){setError('spec precisa ser um objeto JSON.');return;} if(!window.confirm(`Aplicar alterações em ${selected.metadata.name}?`)) return;setBusy(true);setError('');try{const obj=await request(`/${kind}/${encodeURIComponent(selected.metadata.name)}`,{method:'PATCH',body:JSON.stringify({spec})});setSelected(obj);setDraft(JSON.stringify(obj.spec,null,2));setNotice('Alterações enviadas ao Kubernetes.');await load(kind);setSelected(obj);setDraft(JSON.stringify(obj.spec,null,2));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <main className="km"><header><div><p className="eyebrow">SYSTEM EXTENSION</p><h1>Karpenter Manager</h1><p>Inspecione e edite configurações de provisionamento do cluster.</p></div><button onClick={()=>void load()} disabled={busy}>Atualizar</button></header>
    <nav aria-label="Tipos de recursos"><button className={kind==='nodepools'?'active':''} onClick={()=>setKind('nodepools')}>NodePools</button><button className={kind==='ec2nodeclasses'?'active':''} onClick={()=>setKind('ec2nodeclasses')}>EC2NodeClasses</button></nav>
    {error&&<div className="alert" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}
    <div className="layout"><section className="panel"><h2>{kind==='nodepools'?'NodePools':'EC2NodeClasses'} <span>{items.length}</span></h2>{busy&&!items.length?<p>Carregando recursos…</p>:items.length===0?<p>Nenhum recurso encontrado.</p>:<ul>{items.map(item=><li key={item.metadata.name}><button className={selected?.metadata.name===item.metadata.name?'selected':''} onClick={()=>void select(item.metadata.name)}><strong>{item.metadata.name}</strong><small>{item.kind||kind}</small></button></li>)}</ul>}</section>
    <section className="panel editor"><h2>{selected?selected.metadata.name:'Selecione um recurso'}</h2>{selected?<><p className="hint">Edite o objeto <code>spec</code>. A gravação usa merge patch na API do Kubernetes.</p><textarea aria-label="spec JSON" spellCheck={false} value={draft} onChange={e=>setDraft(e.target.value)}/><button className="primary" onClick={()=>void save()} disabled={busy}>Salvar alterações</button></>:<p>Escolha um recurso para visualizar ou modificar sua configuração.</p>}</section></div>
    <footer>As alterações são aplicadas diretamente ao cluster e podem ser reconciliadas pelo Karpenter.</footer></main>;
}
function registerWhenHostMounted(){const root=document.getElementById('app');if(!root)throw new Error('Argo CD #app root não encontrado');const register=()=>{const api=window.extensionsAPI;if(!api?.registerSystemLevelExtension)throw new Error('registerSystemLevelExtension indisponível');api.registerSystemLevelExtension(Extension,'Karpenter','/karpenter','fa-server');};if(root.childElementCount>0){register();return;}const observer=new MutationObserver(()=>{if(root.childElementCount){observer.disconnect();register();}});observer.observe(root,{childList:true});}
registerWhenHostMounted();
