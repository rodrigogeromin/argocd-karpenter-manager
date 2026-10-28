"""Prototype REST API for Karpenter resources, exposed behind Argo CD's proxy."""
from contextlib import asynccontextmanager
import os
from pathlib import Path
import re

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

CONTEXT = {
    "argocd-application-name": os.getenv("ARGOCD_APPLICATION", "argocd:karpenter-manager"),
    "argocd-project-name": os.getenv("ARGOCD_PROJECT", "appset"),
}
API_GROUP = "karpenter.sh"
API_VERSION = "v1"
RESOURCES = {
    "nodepools": ("karpenter.sh", "v1", "nodepools", "NodePool"),
    "ec2nodeclasses": ("karpenter.k8s.aws", "v1", "ec2nodeclasses", "EC2NodeClass"),
}
SERVICE_ACCOUNT = Path("/var/run/secrets/kubernetes.io/serviceaccount")
DEMO = os.getenv("KARPENTER_DEMO_MODE", "false").lower() == "true"
NAME_RE = re.compile(r"^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$")

FIXTURES = {
    "nodepools": [{"apiVersion": "karpenter.sh/v1", "kind": "NodePool", "metadata": {"name": "general-purpose", "resourceVersion": "1"}, "spec": {"template": {"spec": {"requirements": [{"key": "kubernetes.io/arch", "operator": "In", "values": ["amd64"]}]}}}, "status": {"conditions": [{"type": "Ready", "status": "True"}]}}],
    "ec2nodeclasses": [{"apiVersion": "karpenter.k8s.aws/v1", "kind": "EC2NodeClass", "metadata": {"name": "default", "resourceVersion": "1"}, "spec": {"amiSelectorTerms": [{"alias": "al2023@latest"}], "role": "KarpenterNodeRole-demo"}, "status": {"conditions": [{"type": "Ready", "status": "True"}]}}],
}


class SpecPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spec: dict = Field(..., description="Replacement/merge content for the resource spec")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.kube = None
    if not DEMO:
        host = os.getenv("KUBERNETES_SERVICE_HOST")
        token_path, ca_path = SERVICE_ACCOUNT / "token", SERVICE_ACCOUNT / "ca.crt"
        if not host or not token_path.is_file() or not ca_path.is_file():
            raise RuntimeError("In-cluster Kubernetes credentials are unavailable; set KARPENTER_DEMO_MODE=true for fixtures")
        app.state.kube = httpx.AsyncClient(
            base_url=f"https://{host}:{os.getenv('KUBERNETES_SERVICE_PORT_HTTPS', '443')}",
            headers={"Authorization": f"Bearer {token_path.read_text().strip()}"},
            verify=str(ca_path), timeout=httpx.Timeout(8.0, connect=3.0), trust_env=False,
        )
    yield
    if app.state.kube:
        await app.state.kube.aclose()


app = FastAPI(title="Karpenter Manager API", version="0.1.0", lifespan=lifespan, docs_url="/docs", redoc_url=None)


def authorize(request: Request):
    # Context headers come from the trusted Argo CD proxy; they are not authentication by themselves.
    if any(request.headers.get(key) != value for key, value in CONTEXT.items()):
        raise HTTPException(status_code=403, detail="Forbidden Argo CD proxy context")


def resource_path(kind: str, name: str | None = None) -> str:
    group, version, plural, _ = RESOURCES[kind]
    path = f"/apis/{group}/{version}/{plural}"
    return f"{path}/{name}" if name else path


async def kube_request(request: Request, method: str, path: str, *, json_body=None):
    client = request.app.state.kube
    try:
        response = await client.request(method, path, json=json_body,
                                        headers={"Content-Type": "application/merge-patch+json"} if method == "PATCH" else None)
    except httpx.TimeoutException:
        raise HTTPException(504, "Kubernetes API request timed out") from None
    except httpx.HTTPError:
        raise HTTPException(502, "Kubernetes API request failed") from None
    if response.status_code == 404:
        raise HTTPException(404, "Karpenter resource not found")
    if response.status_code == 403:
        raise HTTPException(403, "Kubernetes service account is not authorized for this operation")
    if response.is_error:
        detail = "Kubernetes API rejected the request"
        try:
            detail = response.json().get("message", detail)
        except ValueError:
            pass
        raise HTTPException(response.status_code, detail)
    return response.json()


@app.middleware("http")
async def safe_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/healthz")
async def health():
    return {"status": "ok", "mode": "demo" if DEMO else "in-cluster"}


@app.get("/api/v1/{kind}", dependencies=[Depends(authorize)])
async def list_resources(kind: str, request: Request):
    if kind not in RESOURCES:
        raise HTTPException(404, "Unknown Karpenter resource")
    if DEMO:
        return {"items": FIXTURES[kind]}
    result = await kube_request(request, "GET", resource_path(kind))
    return {"items": result.get("items", [])}


@app.get("/api/v1/{kind}/{name}", dependencies=[Depends(authorize)])
async def get_resource(kind: str, name: str, request: Request):
    if kind not in RESOURCES or not NAME_RE.fullmatch(name):
        raise HTTPException(404, "Karpenter resource not found")
    if DEMO:
        for item in FIXTURES[kind]:
            if item["metadata"]["name"] == name:
                return item
        raise HTTPException(404, "Karpenter resource not found")
    return await kube_request(request, "GET", resource_path(kind, name))


@app.patch("/api/v1/{kind}/{name}", dependencies=[Depends(authorize)])
async def patch_resource(kind: str, name: str, patch: SpecPatch, request: Request):
    if kind not in RESOURCES or not NAME_RE.fullmatch(name):
        raise HTTPException(404, "Karpenter resource not found")
    body = {"spec": patch.spec}
    if DEMO:
        for item in FIXTURES[kind]:
            if item["metadata"]["name"] == name:
                item["spec"].update(patch.spec)
                return item
        raise HTTPException(404, "Karpenter resource not found")
    return await kube_request(request, "PATCH", resource_path(kind, name), json_body=body)
