import React, {useCallback, useEffect, useState} from 'react';
import {HelpFlyout} from '../../app/HelpFlyout';
import '../../style.css';
import {getResource, listResources, patchResource, type Resource, type ResourceKind} from './api';

export function KarpenterManager() {
  const [kind,setKind]=useState<ResourceKind>('nodepools');
  const [items,setItems]=useState<Resource[]>([]); const [selected,setSelected]=useState<Resource|null>(null);
  const [draft,setDraft]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [helpOpen,setHelpOpen]=useState(false);
  const closeHelp=useCallback(()=>setHelpOpen(false),[]);
  async function load(nextKind=kind) { setBusy(true); setError(''); setNotice(''); setSelected(null); try { const data=await listResources(nextKind); setItems(data); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(()=>{void load(kind);},[kind]);
  async function select(name:string) {setBusy(true);setError('');setNotice('');try {const obj=await getResource(kind,name);setSelected(obj);setDraft(JSON.stringify(obj.spec,null,2));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function save() {if(!selected)return; let spec;try{spec=JSON.parse(draft);}catch{setError('JSON inválido.');return;} if(!spec||typeof spec!=='object'||Array.isArray(spec)){setError('spec precisa ser um objeto JSON.');return;} if(!window.confirm(`Aplicar alterações em ${selected.metadata.name}?`)) return;setBusy(true);setError('');try{const obj=await patchResource(kind,selected.metadata.name,spec);setSelected(obj);setDraft(JSON.stringify(obj.spec,null,2));setNotice('Alterações enviadas ao Kubernetes.');await load(kind);setSelected(obj);setDraft(JSON.stringify(obj.spec,null,2));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <main className="km"><header><div><p className="eyebrow">SYSTEM EXTENSION</p><h1>Karpenter Manager</h1><p>Inspecione e edite configurações de provisionamento do cluster.</p></div><div className="km-header-actions"><button onClick={()=>setHelpOpen(true)} aria-haspopup="dialog">Ajuda</button><button onClick={()=>void load()} disabled={busy}>Atualizar</button></div></header>
    <nav aria-label="Tipos de recursos"><button className={kind==='nodepools'?'active':''} aria-pressed={kind==='nodepools'} onClick={()=>setKind('nodepools')}>NodePools</button><button className={kind==='ec2nodeclasses'?'active':''} aria-pressed={kind==='ec2nodeclasses'} onClick={()=>setKind('ec2nodeclasses')}>EC2NodeClasses</button></nav>
    {error&&<div className="alert" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}
    <div className="layout"><section className="panel"><h2>{kind==='nodepools'?'NodePools':'EC2NodeClasses'} <span>{items.length}</span></h2>{busy&&!items.length?<p>Carregando recursos…</p>:items.length===0?<p>Nenhum recurso encontrado.</p>:<ul>{items.map(item=><li key={item.metadata.name}><button className={selected?.metadata.name===item.metadata.name?'selected':''} aria-current={selected?.metadata.name===item.metadata.name?'true':undefined} onClick={()=>void select(item.metadata.name)}><strong>{item.metadata.name}</strong><small>{item.kind||kind}</small></button></li>)}</ul>}</section>
    <section className="panel editor"><h2>{selected?selected.metadata.name:'Selecione um recurso'}</h2>{selected?<><p className="hint">Edite o objeto <code>spec</code>. A gravação usa merge patch na API do Kubernetes.</p><textarea aria-label="spec JSON" spellCheck={false} value={draft} onChange={e=>setDraft(e.target.value)}/><button className="primary" onClick={()=>void save()} disabled={busy}>Salvar alterações</button></>:<p>Escolha um recurso para visualizar ou modificar sua configuração.</p>}</section></div>
    <footer>As alterações são aplicadas diretamente ao cluster e podem ser reconciliadas pelo Karpenter.</footer>
    {helpOpen&&<HelpFlyout onClose={closeHelp}/>}</main>;
}
