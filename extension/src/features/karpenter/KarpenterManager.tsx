import React, {useCallback, useEffect, useState} from 'react';
import {HelpFlyout} from '../../app/HelpFlyout';
import '../../style.css';
import {getResource, listResources, patchResource, type Resource, type ResourceKind} from './api';
import {describeChanges, validateSpec} from './form-model';
import {ResourceEditor} from './ResourceEditor';

export function KarpenterManager() {
  const [kind,setKind]=useState<ResourceKind>('nodepools');
  const [items,setItems]=useState<Resource[]>([]); const [selected,setSelected]=useState<Resource|null>(null);
  const [draft,setDraft]=useState<Record<string,unknown>|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [helpOpen,setHelpOpen]=useState(false); const [reviewOpen,setReviewOpen]=useState(false);
  const closeHelp=useCallback(()=>setHelpOpen(false),[]);
  async function load(nextKind=kind,clear=true) { setBusy(true); setError(''); if(clear){setNotice('');setSelected(null);setDraft(null);} try { const data=await listResources(nextKind); setItems(data); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(()=>{void load(kind);},[kind]);
  async function select(name:string) {setBusy(true);setError('');setNotice('');try {const obj=await getResource(kind,name);setSelected(obj);setDraft(JSON.parse(JSON.stringify(obj.spec)));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const errors=draft?validateSpec(kind,draft):{};
  const dirty=!!selected&&!!draft&&JSON.stringify(selected.spec)!==JSON.stringify(draft);
  async function apply() {if(!selected||!draft)return;setBusy(true);setError('');try{const obj=await patchResource(kind,selected.metadata.name,draft);setSelected(obj);setDraft(JSON.parse(JSON.stringify(obj.spec)));setNotice('Alterações enviadas ao Kubernetes.');setReviewOpen(false);await load(kind,false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <main className="km"><header><div><p className="eyebrow">SYSTEM EXTENSION</p><h1>Karpenter Manager</h1><p>Gerencie capacidade e configuração dos nós com opções guiadas.</p></div><div className="km-header-actions"><button onClick={()=>setHelpOpen(true)} aria-haspopup="dialog">Ajuda</button><button onClick={()=>void load(kind,false)} disabled={busy}>Atualizar</button></div></header>
    <nav aria-label="Tipos de recursos"><button className={kind==='nodepools'?'active':''} aria-pressed={kind==='nodepools'} onClick={()=>setKind('nodepools')}>NodePools</button><button className={kind==='ec2nodeclasses'?'active':''} aria-pressed={kind==='ec2nodeclasses'} onClick={()=>setKind('ec2nodeclasses')}>EC2NodeClasses</button></nav>
    {error&&<div className="alert" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}
    <div className="layout"><section className="panel"><h2>{kind==='nodepools'?'NodePools':'EC2NodeClasses'} <span>{items.length}</span></h2>{busy&&!items.length?<p>Carregando recursos…</p>:items.length===0?<p>Nenhum recurso encontrado.</p>:<ul>{items.map(item=><li key={item.metadata.name}><button className={selected?.metadata.name===item.metadata.name?'selected':''} aria-current={selected?.metadata.name===item.metadata.name?'true':undefined} onClick={()=>void select(item.metadata.name)}><strong>{item.metadata.name}</strong><small>{item.kind||kind}</small></button></li>)}</ul>}</section>
    <section className="panel editor"><div className="km-editor-heading"><div><h2>{selected?selected.metadata.name:'Selecione um recurso'}</h2>{selected&&<p className="hint">Formulário guiado para as opções mais usadas. Regras avançadas não reconhecidas permanecem preservadas.</p>}</div>{selected&&<span className="km-badge">{kind==='nodepools'?'NodePool':'EC2NodeClass'}</span>}</div>{selected&&draft?<><ResourceEditor kind={kind} spec={draft} errors={errors} onChange={setDraft}/><div className="km-savebar"><span>{dirty?'Há alterações não salvas.':'Configuração atual'}</span><button className="primary" onClick={()=>setReviewOpen(true)} disabled={busy||!dirty||Object.keys(errors).length>0}>Revisar alterações</button></div></>:<p>Escolha um recurso para visualizar ou modificar sua configuração.</p>}</section></div>
    <footer>Alterações aplicadas diretamente ao cluster podem iniciar reconciliação do Karpenter. Revise o resumo antes de confirmar.</footer>
    {reviewOpen&&selected&&draft&&<div className="km-modal-backdrop"><section className="km-modal" role="dialog" aria-modal="true" aria-labelledby="km-review-title"><h2 id="km-review-title">Revise antes de aplicar</h2><p>As alterações serão enviadas para <strong>{selected.metadata.name}</strong>. O Karpenter poderá criar, consolidar ou drenar nós conforme as novas configurações.</p><ul>{describeChanges(kind,selected.spec,draft).map(change=><li key={change}>{change}</li>)}</ul>{Object.keys(errors).length>0&&<div className="alert">Corrija os campos inválidos antes de aplicar.</div>}<div className="km-modal-actions"><button onClick={()=>setReviewOpen(false)} disabled={busy}>Voltar e revisar</button><button className="primary" onClick={()=>void apply()} disabled={busy||Object.keys(errors).length>0}>{busy?'Aplicando…':'Aplicar alterações'}</button></div></section></div>}
    {helpOpen&&<HelpFlyout onClose={closeHelp}/>}</main>;
}
