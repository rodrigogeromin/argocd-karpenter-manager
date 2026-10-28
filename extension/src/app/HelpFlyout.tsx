import React, {useEffect, useRef} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import helpMarkdown from '../../README.md';

type Props={onClose:()=>void};
export function HelpFlyout({onClose}:Props) {
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    panel.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return;}
      if(event.key==='Tab'&&panel.current){
        const controls=Array.from(panel.current.querySelectorAll<HTMLElement>('button,a[href],[tabindex]:not([tabindex="-1"])')).filter(el=>!el.hasAttribute('disabled'));
        if(!controls.length){event.preventDefault();return;}
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',onKeyDown);
    return ()=>{document.removeEventListener('keydown',onKeyDown);previous?.focus();};
  },[onClose]);
  return <div className="km-help-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside className="km-help" role="dialog" aria-modal="true" aria-labelledby="km-help-title" tabIndex={-1} ref={panel}>
      <div className="km-help-heading"><h2 id="km-help-title">Ajuda do Karpenter Manager</h2><button type="button" onClick={onClose} aria-label="Fechar ajuda">Fechar</button></div>
      <div className="km-help-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{helpMarkdown}</ReactMarkdown></div>
    </aside>
  </div>;
}
