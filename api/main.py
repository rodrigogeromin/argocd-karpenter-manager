"""Karpenter API that targets clusters registered in Argo CD."""
from contextlib import asynccontextmanager
import base64
import json
import os
from pathlib import Path
import re
import ssl
from urllib.parse import quote

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

CONTEXT = {
    "argocd-application-name": os.getenv("ARGOCD_APPLICATION", "argocd:karpenter-manager"),
    "argocd-project-name": os.getenv("ARGOCD_PROJECT", "appset"),
}
RESOURCES = {
    "nodepools": ("karpenter.sh", "v1", "nodepools", "NodePool"),
    "ec2nodeclasses": ("karpenter.k8s.aws", "v1", "ec2nodeclasses", "EC2NodeClass"),
}
SERVICE_ACCOUNT = Path("/var/run/secrets/kubernetes.io/serviceaccount")
DEMO = os.getenv("KARPENTER_DEMO_MODE", "false").lower() == "true"
NAME_RE = re.compile(r"^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$")
CLUSTER_LABEL = "argocd.argoproj.io/secret-type"

FIXTURES = {
    "clusters": [{"id": "demo-cluster", "name": "demo-cluster", "server": "https://demo.example.invalid", "project": "default", "connectionType": "demo"}],
    "nodepools": [{"apiVersion": "karpenter.sh/v1", "kind": "NodePool", "metadata": {"name": "general-purpose", "resourceVersion": "1"}, "spec": {"template": {"spec": {"requirements": [{"key": "kubernetes.io/arch", "operator": "In", "values": ["amd64"]}]}}}, "status": {"conditions": [{"type": "Ready", "status": "True"}]}}],
    "ec2nodeclasses": [{"apiVersion": "karpenter.k8s.aws/v1", "kind": "EC2NodeClass", "metadata": {"name": "default", "resourceVersion": "1"}, "spec": {"amiSelectorTerms": [{"alias": "al2023@latest"}], "role": "KarpenterNodeRole-demo"}, "status": {"conditions": [{"type": "Ready", "status": "True"}]}}],
}


class SpecPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spec: dict = Field(..., description="Replacement/merge content for the resource spec")


def decode_secret_data(secret: dict) -> dict:
    result = {}
    for key, value in secret.get("data", {}).items():
        try:
            result[key] = base64.b64decode(value).decode("utf-8")
        except (ValueError, UnicodeDecodeError, TypeError):
            raise HTTPException(502, "Argo CD cluster Secret contains invalid data") from None
    return result


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.kube = None
    app.state.kube_config = None
    if not DEMO:
        host = os.getenv("KUBERNETES_SERVICE_HOST")
        token_path, ca_path = SERVICE_ACCOUNT / "token", SERVICE_ACCOUNT / "ca.crt"
        if not host or not token_path.is_file() or not ca_path.is_file():
            raise RuntimeError("In-cluster Kubernetes credentials are unavailable; set KARPENTER_DEMO_MODE=true for fixtures")
        app.state.kube_config = {
            "server": f"https://{host}:{os.getenv('KUBERNETES_SERVICE_PORT_HTTPS', '443')}",
            "token": token_path.read_text().strip(), "ca": str(ca_path),
        }
        app.state.kube = httpx.AsyncClient(
            base_url=app.state.kube_config["server"],
            headers={"Authorization": f"Bearer {app.state.kube_config['token']}"},
            verify=app.state.kube_config["ca"], timeout=httpx.Timeout(8.0, connect=3.0), trust_env=False,
        )
    yield
    if app.state.kube:
        await app.state.kube.aclose()


app = FastAPI(title="Karpenter Manager API", version="0.2.0", lifespan=lifespan, docs_url="/docs", redoc_url=None)


def authorize(request: Request):
    # These headers provide Argo CD proxy context; they are not authentication by themselves.
    if any(request.headers.get(key) != value for key, value in CONTEXT.items()):
        raise HTTPException(status_code=403, detail="Contexto do proxy Argo CD inválido")


def resource_path(kind: str, name: str | None = None) -> str:
    group, version, plural, _ = RESOURCES[kind]
    path = f"/apis/{group}/{version}/{plural}"
    return f"{path}/{quote(name, safe='')}" if name else path


async def kube_request(request: Request, method: str, path: str, *, json_body=None, client=None):
    owned_client = client is not None
    client = client or request.app.state.kube
    try:
        response = await client.request(method, path, json=json_body,
                                        headers={"Content-Type": "application/merge-patch+json"} if method == "PATCH" else None)
    except httpx.TimeoutException:
        raise HTTPException(504, "Tempo limite ao acessar a API Kubernetes") from None
    except httpx.HTTPError:
        raise HTTPException(502, "Falha ao acessar a API Kubernetes") from None
    finally:
        if owned_client:
            await client.aclose()
    if response.status_code == 404:
        raise HTTPException(404, "Cluster ou recurso Karpenter não encontrado")
    if response.status_code == 401:
        raise HTTPException(502, "A autenticação configurada para o cluster foi rejeitada")
    if response.status_code == 403:
        raise HTTPException(403, "A credencial do cluster não tem permissão para esta operação")
    if response.is_error:
        detail = "A API Kubernetes rejeitou a solicitação"
        try:
            detail = response.json().get("message", detail)
        except ValueError:
            pass
        raise HTTPException(response.status_code, detail)
    return response.json()


async def cluster_secrets(request: Request) -> list[dict]:
    """Read only Argo CD's registered cluster Secrets; never accept a caller supplied URL."""
    try:
        response = await request.app.state.kube.get(
            "/api/v1/namespaces/argocd/secrets",
            params={"labelSelector": f"{CLUSTER_LABEL}=cluster"},
        )
    except httpx.HTTPError:
        raise HTTPException(502, "Não foi possível consultar o inventário de clusters do Argo CD") from None
    if response.status_code == 403:
        raise HTTPException(503, "A API não tem permissão para ler os Secrets de cluster do namespace argocd")
    if response.is_error:
        raise HTTPException(502, "Não foi possível consultar o inventário de clusters do Argo CD")
    items = response.json().get("items", [])
    # Argo CD's implicit in-cluster target has no cluster Secret; expose it as a virtual entry.
    if not any(item.get("metadata", {}).get("name") == "in-cluster" for item in items):
        items.append({"metadata": {"name": "in-cluster", "resourceVersion": "local"}, "data": {
            "name": base64.b64encode(b"in-cluster").decode(),
            "server": base64.b64encode(request.app.state.kube_config["server"].encode()).decode(),
            "project": base64.b64encode(b"default").decode(),
            "config": base64.b64encode(json.dumps({"localServiceAccount": True}).encode()).decode(),
        }})
    return items


async def get_cluster(request: Request, cluster_id: str) -> tuple[dict, dict]:
    if not NAME_RE.fullmatch(cluster_id):
        raise HTTPException(404, "Cluster não encontrado no Argo CD")
    for secret in await cluster_secrets(request):
        if secret.get("metadata", {}).get("name") == cluster_id:
            data = decode_secret_data(secret)
            try:
                config = json.loads(data.get("config", "{}"))
            except json.JSONDecodeError:
                raise HTTPException(502, "Configuração do cluster no Argo CD é inválida") from None
            return secret, {**data, "config": config}
    raise HTTPException(404, "Cluster não encontrado no inventário do Argo CD")


def cluster_summary(secret: dict) -> dict:
    data = decode_secret_data(secret)
    try:
        config = json.loads(data.get("config", "{}"))
    except json.JSONDecodeError:
        config = {}
    auth = config.get("awsAuthConfig")
    connection_type = "awsAuthConfig" if isinstance(auth, dict) else "bearerToken" if data.get("bearerToken") else "unsupported"
    return {"id": secret.get("metadata", {}).get("name"), "name": data.get("name") or secret.get("metadata", {}).get("name"),
            "server": data.get("server"), "project": data.get("project") or "default", "connectionType": connection_type}


def aws_eks_token(auth: dict) -> str:
    """Create an EKS token using the API pod's AWS identity, optionally assuming Argo's role."""
    try:
        import boto3
        from botocore.auth import SigV4QueryAuth
        from botocore.awsrequest import AWSRequest
        from botocore.credentials import Credentials
        from botocore.session import get_session
        cluster_name = auth.get("clusterName")
        if not cluster_name:
            raise ValueError("clusterName ausente")
        session = boto3.Session()
        role_arn = auth.get("roleARN")
        if role_arn:
            credentials = session.client("sts").assume_role(RoleArn=role_arn, RoleSessionName="karpenter-manager")["Credentials"]
            creds = Credentials(credentials["AccessKeyId"], credentials["SecretAccessKey"], credentials["SessionToken"])
        else:
            creds = get_session().get_credentials().get_frozen_credentials()
        request = AWSRequest(method="GET", url="https://sts.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15", headers={"x-k8s-aws-id": cluster_name})
        SigV4QueryAuth(creds, "sts", "us-east-1", expires=60).add_auth(request)
        token = base64.urlsafe_b64encode(request.url.encode()).decode().rstrip("=")
        return f"k8s-aws-v1.{token}"
    except Exception:
        raise HTTPException(502, "Não foi possível gerar credencial AWS para este cluster; confira awsAuthConfig e a identidade IAM da API") from None


async def target_client(request: Request, cluster_id: str) -> httpx.AsyncClient | None:
    secret, data = await get_cluster(request, cluster_id)
    if cluster_id == "in-cluster":
        return None
    server = data.get("server")
    if not server or not server.startswith("https://"):
        raise HTTPException(502, "O cluster do Argo CD não possui um endpoint HTTPS válido")
    config = data["config"]
    headers = {}
    verify: bool | str = True
    tls = config.get("tlsClientConfig") or {}
    if tls.get("insecure") is True:
        verify = False
    elif tls.get("caData"):
        try:
            verify = ssl.create_default_context(cadata=base64.b64decode(tls["caData"]).decode("utf-8"))
        except (ValueError, TypeError, ssl.SSLError):
            raise HTTPException(502, "Certificado CA do cluster no Argo CD é inválido") from None
    if config.get("awsAuthConfig"):
        headers["Authorization"] = f"Bearer {aws_eks_token(config['awsAuthConfig'])}"
    elif data.get("bearerToken"):
        headers["Authorization"] = f"Bearer {data['bearerToken']}"
    else:
        raise HTTPException(501, "Este protótipo suporta clusters com bearerToken ou awsAuthConfig do EKS; este cluster usa outro provedor")
    if tls.get("certData") or tls.get("keyData"):
        raise HTTPException(501, "Autenticação por certificado de cliente ainda não é suportada neste protótipo")
    try:
        return httpx.AsyncClient(base_url=server.rstrip("/"), headers=headers, verify=verify,
                                   timeout=httpx.Timeout(10.0, connect=4.0), trust_env=False)
    except (ValueError, httpx.HTTPError):
        raise HTTPException(502, "Não foi possível configurar a conexão segura com o cluster") from None


@app.middleware("http")
async def safe_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/healthz")
async def health():
    return {"status": "ok", "mode": "demo" if DEMO else "argocd-clusters"}


@app.get("/api/v1/clusters", dependencies=[Depends(authorize)])
async def list_clusters(request: Request):
    if DEMO:
        return {"items": FIXTURES["clusters"]}
    return {"items": [cluster_summary(secret) for secret in await cluster_secrets(request)]}


@app.get("/api/v1/clusters/{cluster_id}/{kind}", dependencies=[Depends(authorize)])
async def list_resources(cluster_id: str, kind: str, request: Request):
    if kind not in RESOURCES:
        raise HTTPException(404, "Tipo de recurso Karpenter desconhecido")
    if DEMO:
        if cluster_id not in {c["id"] for c in FIXTURES["clusters"]}:
            raise HTTPException(404, "Cluster não encontrado")
        return {"items": FIXTURES[kind]}
    client = await target_client(request, cluster_id)
    result = await kube_request(request, "GET", resource_path(kind), client=client)
    return {"items": result.get("items", [])}


@app.get("/api/v1/clusters/{cluster_id}/{kind}/{name}", dependencies=[Depends(authorize)])
async def get_resource(cluster_id: str, kind: str, name: str, request: Request):
    if kind not in RESOURCES or not NAME_RE.fullmatch(name):
        raise HTTPException(404, "Recurso Karpenter não encontrado")
    if DEMO:
        if cluster_id not in {c["id"] for c in FIXTURES["clusters"]}:
            raise HTTPException(404, "Cluster não encontrado")
        for item in FIXTURES[kind]:
            if item["metadata"]["name"] == name:
                return item
        raise HTTPException(404, "Recurso Karpenter não encontrado")
    client = await target_client(request, cluster_id)
    return await kube_request(request, "GET", resource_path(kind, name), client=client)


@app.patch("/api/v1/clusters/{cluster_id}/{kind}/{name}", dependencies=[Depends(authorize)])
async def patch_resource(cluster_id: str, kind: str, name: str, patch: SpecPatch, request: Request):
    if kind not in RESOURCES or not NAME_RE.fullmatch(name):
        raise HTTPException(404, "Recurso Karpenter não encontrado")
    body = {"spec": patch.spec}
    if DEMO:
        if cluster_id not in {c["id"] for c in FIXTURES["clusters"]}:
            raise HTTPException(404, "Cluster não encontrado")
        for item in FIXTURES[kind]:
            if item["metadata"]["name"] == name:
                item["spec"].update(patch.spec)
                return item
        raise HTTPException(404, "Recurso Karpenter não encontrado")
    client = await target_client(request, cluster_id)
    return await kube_request(request, "PATCH", resource_path(kind, name), json_body=body, client=client)
