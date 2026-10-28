import type React from 'react';
import {KarpenterManager} from '../features/karpenter/KarpenterManager';
import project from '../../extension-project.json';

type ExtensionsAPI={registerSystemLevelExtension?:(component:React.ComponentType,title:string,path:string,icon:string)=>void};
declare global { interface Window { extensionsAPI?: ExtensionsAPI } }

export function registerKarpenterManager() {
  const root=document.getElementById('app');
  if(!root) throw new Error('Argo CD #app root não encontrado');
  const register=()=>{
    const api=window.extensionsAPI;
    if(!api?.registerSystemLevelExtension) throw new Error('registerSystemLevelExtension indisponível');
    api.registerSystemLevelExtension(KarpenterManager,project.registration.title,project.registration.path,project.registration.icon);
  };
  if(root.childElementCount>0){register();return;}
  const observer=new MutationObserver(()=>{if(root.childElementCount){observer.disconnect();register();}});
  observer.observe(root,{childList:true});
}
