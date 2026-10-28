# Argo CD Karpenter Manager (prototype)

System-level Argo CD extension (`/karpenter`) with a FastAPI backend for reading and editing Karpenter `NodePool` and `EC2NodeClass` resources.

The design follows the `argocd-swagger-ui-extension` system page registration pattern and the authenticated Argo CD Proxy Extension used by `brainstorm/swagger-gateway/application.yaml`. The browser calls `/extensions/karpenter/*`; Argo CD forwards the request to the service, retaining Argo CD's user authentication and extension RBAC.

> Prototype warning: write operations patch the live Kubernetes API. Restrict access with Argo CD extension RBAC and Kubernetes RBAC, review diffs before applying, and use a non-production cluster first.

## Prototype scope

- System page available without selecting an Application.
- Lists Karpenter NodePools and EC2NodeClasses from the cluster where the backend runs.
- Reads one object and edits its `spec` through a JSON editor.
- Uses Kubernetes merge-patch and rejects patches outside `spec`.
- Has an in-memory fixture mode for local UI/API development.

This first slice does not implement audit history, approval workflows, multi-cluster selection, policy validation, or field-level forms. The JSON editor is deliberately a prototype.

## Run the API locally

```sh
cd api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
KARPENTER_DEMO_MODE=true uvicorn main:app --reload --port 8080
```

Open `http://localhost:8080/docs` or `http://localhost:8080/api/v1/nodepools`. In-cluster mode uses the pod service account token and Kubernetes CA; see `deploy/application.yaml` for the RBAC and service wiring. The service requires the Karpenter CRDs to be installed.

## Extension integration

- Register with `registerSystemLevelExtension(component, 'Karpenter', '/karpenter', 'fa-server')` after the host root `#app` has committed, matching the startup race fix in the reference extension. Release installs the JavaScript bundle into `/tmp/extensions/resources` in every `argocd-server` pod using the Argo CD extension installer.
- Configure Argo CD Proxy Extension `karpenter` to target `http://karpenter-manager.karpenter-manager.svc.cluster.local:8080`.
- Grant `extensions, invoke, karpenter, allow` only to the intended Argo CD roles.
- The extension uses relative `/extensions/karpenter` URLs, so installations below a base path continue to work.

The API expects Argo CD proxy context headers for the configured synthetic context (`argocd:karpenter-manager`, project `appset`). Update `api/main.py` and the frontend together if the configured context changes. These headers are context assertions only; authorization must remain in Argo CD RBAC and Kubernetes RBAC.

## API

- `GET /healthz`
- `GET /api/v1/nodepools`
- `GET /api/v1/nodepools/{name}`
- `PATCH /api/v1/nodepools/{name}` body: `{"spec": {...}}`
- `GET /api/v1/ec2nodeclasses`
- `GET /api/v1/ec2nodeclasses/{name}`
- `PATCH /api/v1/ec2nodeclasses/{name}` body: `{"spec": {...}}`

Patch uses Kubernetes `application/merge-patch+json` and only accepts a top-level `spec` key. Normal Kubernetes validation and Karpenter reconciliation still apply.

## CI, build and releases

GitHub Actions compiles the system extension, type-checks it, runs frontend contract tests and FastAPI tests, verifies that the production bundle contains only the expected extension, packages it, and runs `npm audit`. Pushes to `main`, pull requests and manual dispatch run `.github/workflows/validate.yml`; CI uploads `dist/karpenter-manager.tar.gz` for download.

The release workflow runs when a `v*` tag is pushed. Before dependency installation it checks that the tag matches `extension/package.json` (currently `v0.1.0`), then repeats the checks and creates a GitHub Release with the extension tarball, SHA-256 checksum, release identity, Argo CD Application manifest and proxy/RBAC patch. For example, after merging version changes to `main`:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The tag is the release trigger; the workflow publishes the release after all checks pass. Assets include the bundle, checksum, the release-specific `argocd-server` installer patch, backend and proxy manifests, and [installation instructions](docs/installation.md).

## Next prototype increments

1. Replace raw JSON editing with focused controls and before/after diff.
2. Add optimistic concurrency (`resourceVersion`) and audit events.
3. Add validation for Karpenter API versions and organization-specific change policies.
4. Build/package the extension bundle and install it into an Argo CD 3.5.1 test environment.
