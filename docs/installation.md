# Build, release, and install

The extension targets the Argo CD **3.5.1** system-level API. GitHub Actions validates pushes to `main`, pull requests, and manual runs. It type-checks and compiles the extension, runs extension contract tests and FastAPI tests, checks the release bundle shape, runs `npm audit`, and uploads the tarball as a CI artifact.

## Publish a release

The release workflow runs on a `v*` tag and requires it to match `extension/package.json` (`__TAG__` for the current prototype). Push the reviewed version change before tagging:

```sh
git tag __TAG__
git push origin __TAG__
```

After all checks pass, the workflow publishes:

- `karpenter-manager.tar.gz`: only `resources/extension-karpenter-manager.js`.
- `checksums.txt`: SHA-256 checksum of the extension archive.
- `argocd-server-patch.yaml`: installer patch rendered with the exact repository and tag.
- `karpenter-manager-config.yaml`: ConfigMap that provides the Application/project context to the UI bundle.
- `application.yaml`: backend deployment and narrowly scoped Kubernetes RBAC.
- `argocd-patches.yaml`: Argo CD proxy configuration and example extension RBAC.
- `installation.md`: this guide.

Local release identity and package checks can be reproduced with:

```sh
(cd extension && npm ci && npm run typecheck && npm test && npm run build && npm run package)
RELEASE_TAG=__TAG__ RELEASE_REPOSITORY=__REPOSITORY__ node scripts/release-assets.mjs --validate-only
RELEASE_TAG=__TAG__ RELEASE_REPOSITORY=__REPOSITORY__ node scripts/release-assets.mjs
(cd dist && sha256sum --check checksums.txt)
```

## Install

Install the API Application and configure the Argo CD proxy first. Review and adapt `deploy/argocd-patches.yaml` to preserve existing `argocd-cm` and `argocd-rbac-cm` settings. The example RBAC line allows `role:admin` to invoke the extension; change it to the intended roles.

The extension reads `application` and `project` from `karpenter-manager-config.yaml`, following the Swagger UI extension's ConfigMap pattern. Set `application` to the Argo CD Application context in `namespace:name` format, and `project` to its AppProject. The API validates these headers against `ARGOCD_APPLICATION` and `ARGOCD_PROJECT` in the backend's `karpenter-manager-context` ConfigMap; keep both ConfigMaps in sync when customizing the context. Apply the UI ConfigMap before patching the `argocd-server` Deployment. After changing either context, restart both `argocd-server` and the `karpenter-manager` Deployment so their mounted script and environment values reload.

Download assets from a specific release and verify the checksum:

```sh
gh release download __TAG__ --repo __REPOSITORY__ \
  --pattern karpenter-manager.tar.gz --pattern checksums.txt \
  --pattern argocd-server-patch.yaml --pattern application.yaml \
  --pattern argocd-patches.yaml --pattern karpenter-manager-config.yaml \
  --pattern installation.md --dir release-__TAG__
(cd release-__TAG__ && sha256sum --check checksums.txt)
```

The release patch assumes `Deployment/argocd-server` in namespace `argocd`, container `argocd-server`, and a shared `/tmp` volume named `tmp`. The installer init container checks the SHA-256 checksum and installs the bundle into `/tmp/extensions/resources` in every server pod. Review existing volumes, init containers, deployment sources, and cluster policies before applying. If `/tmp` already uses another volume name, adapt the patch to reuse it. In Helm/GitOps-managed installations, make the equivalent change in the source of truth so reconciliation preserves it.

```sh
kubectl get deployment argocd-server -n argocd -o yaml > argocd-server-before.yaml
kubectl apply -f release-__TAG__/karpenter-manager-config.yaml
kubectl patch deployment argocd-server -n argocd --type strategic \
  --patch-file release-__TAG__/argocd-server-patch.yaml --dry-run=server -o yaml
kubectl patch deployment argocd-server -n argocd --type strategic \
  --patch-file release-__TAG__/argocd-server-patch.yaml
kubectl rollout status deployment/argocd-server -n argocd
```

When changing the context later, restart both workloads so the `argocd-server` mounted script and API environment values reload:

```sh
kubectl rollout restart deployment/argocd-server -n argocd
kubectl rollout restart deployment/karpenter-manager -n karpenter-manager
kubectl rollout status deployment/argocd-server -n argocd
kubectl rollout status deployment/karpenter-manager -n karpenter-manager
```

The UI bundle is separate from the backend Application and Proxy Extension. The system page appears at `/karpenter`; calls go through `/extensions/karpenter`.

The API lists Argo CD cluster Secrets in namespace `argocd` (`argocd.argoproj.io/secret-type=cluster`) to build the cluster selector and target connections. The supplied manifest grants the API ServiceAccount `get` and `list` on Secrets in that namespace. Kubernetes RBAC cannot restrict a `list` request to a Secret label, so this access includes other Secrets in `argocd`; treat the API as security-sensitive and limit who can invoke it. The API resolves cluster IDs only against this inventory and never accepts a Kubernetes endpoint from the browser.

For remote clusters, the credential stored in each Argo CD cluster Secret must authorize `get`, `list`, and `patch` on `nodepools.karpenter.sh` and `ec2nodeclasses.karpenter.k8s.aws`. For EKS `awsAuthConfig`, give the API pod an AWS identity that can assume the configured `roleARN`, when present, and ensure that role is mapped to Kubernetes permissions in the target cluster. The API supports `bearerToken` and EKS `awsAuthConfig`; other authentication providers are not supported in this prototype. The local `in-cluster` option uses the API ServiceAccount and the Karpenter ClusterRole in the manifest.
