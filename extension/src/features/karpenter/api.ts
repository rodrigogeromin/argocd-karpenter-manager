export type Resource = {
  apiVersion?: string;
  kind?: string;
  metadata: {name: string; resourceVersion?: string};
  spec: Record<string, unknown>;
  status?: Record<string, unknown>;
};

export type ResourceKind = 'nodepools' | 'ec2nodeclasses';
const API = '/extensions/karpenter/api/v1';
const ARGO_CONTEXT = {'Argocd-Application-Name':'argocd:karpenter-manager','Argocd-Project-Name':'appset'};
const isRecord=(value:unknown):value is Record<string,unknown> => typeof value==='object'&&value!==null&&!Array.isArray(value);

function parseResource(value:unknown):Resource {
  if(!isRecord(value)||!isRecord(value.metadata)||typeof value.metadata.name!=='string'||!isRecord(value.spec)) {
    throw new Error('A API retornou um recurso Karpenter em formato inválido.');
  }
  return value as Resource;
}

async function request(path:string,init?:RequestInit):Promise<unknown> {
  const response=await fetch(`${API}${path}`,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...ARGO_CONTEXT,...(init?.headers||{})}});
  const body=await response.json().catch(()=>null);
  if(!response.ok) {
    const message=isRecord(body)&&typeof body.detail==='string'?body.detail:`API respondeu ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export async function listResources(kind:ResourceKind):Promise<Resource[]> {
  const body=await request(`/${kind}`);
  if(!isRecord(body)||!Array.isArray(body.items)) throw new Error('A API retornou uma lista de recursos em formato inválido.');
  return body.items.map(parseResource);
}

export async function getResource(kind:ResourceKind,name:string):Promise<Resource> {
  return parseResource(await request(`/${kind}/${encodeURIComponent(name)}`));
}

export async function patchResource(kind:ResourceKind,name:string,spec:Record<string,unknown>):Promise<Resource> {
  return parseResource(await request(`/${kind}/${encodeURIComponent(name)}`,{method:'PATCH',body:JSON.stringify({spec})}));
}
