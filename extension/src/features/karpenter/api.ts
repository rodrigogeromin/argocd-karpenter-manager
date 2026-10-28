export type Resource = {
  apiVersion?: string;
  kind?: string;
  metadata: {name: string; resourceVersion?: string};
  spec: Record<string, unknown>;
  status?: Record<string, unknown>;
};

export type ResourceKind = 'nodepools' | 'ec2nodeclasses';
export type Cluster = {id:string;name:string;server:string;project:string;connectionType:string};
import {readGatewayContext} from '../../argocd/gateway-context';
const API = '/extensions/karpenter/api/v1';
const isRecord=(value:unknown):value is Record<string,unknown> => typeof value==='object'&&value!==null&&!Array.isArray(value);

function parseResource(value:unknown):Resource {
  if(!isRecord(value)||!isRecord(value.metadata)||typeof value.metadata.name!=='string'||!isRecord(value.spec)) {
    throw new Error('A API retornou um recurso Karpenter em formato inválido.');
  }
  return value as Resource;
}

async function request(path:string,init?:RequestInit):Promise<unknown> {
  const context=readGatewayContext();
  const response=await fetch(`${API}${path}`,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json','Argocd-Application-Name':context.application,'Argocd-Project-Name':context.project,...(init?.headers||{})}});
  const body=await response.json().catch(()=>null);
  if(!response.ok) {
    const message=isRecord(body)&&typeof body.detail==='string'?body.detail:`API respondeu ${response.status}`;
    const requestId=response.headers.get('X-Request-ID');
    throw new Error(requestId?`${message} (request_id: ${requestId})`:message);
  }
  return body;
}

export async function listClusters():Promise<Cluster[]> {
  const body=await request('/clusters');
  if(!isRecord(body)||!Array.isArray(body.items)) throw new Error('A API retornou uma lista de clusters em formato inválido.');
  return body.items as Cluster[];
}

export async function listClusterResources(clusterId:string,kind:ResourceKind):Promise<Resource[]> {
  const body=await request(`/clusters/${encodeURIComponent(clusterId)}/${kind}`);
  if(!isRecord(body)||!Array.isArray(body.items)) throw new Error('A API retornou uma lista de recursos em formato inválido.');
  return body.items.map(parseResource);
}

export async function getResource(clusterId:string,kind:ResourceKind,name:string):Promise<Resource> {
  return parseResource(await request(`/clusters/${encodeURIComponent(clusterId)}/${kind}/${encodeURIComponent(name)}`));
}

export async function patchResource(clusterId:string,kind:ResourceKind,name:string,spec:Record<string,unknown>):Promise<Resource> {
  return parseResource(await request(`/clusters/${encodeURIComponent(clusterId)}/${kind}/${encodeURIComponent(name)}`,{method:'PATCH',body:JSON.stringify({spec})}));
}
