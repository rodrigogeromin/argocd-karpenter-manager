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

Download assets from a specific release and verify the checksum:

```sh
gh release download __TAG__ --repo __REPOSITORY__ \
  --pattern karpenter-manager.tar.gz --pattern checksums.txt \
  --pattern argocd-server-patch.yaml --pattern application.yaml \
  --pattern argocd-patches.yaml --pattern installation.md --dir release-__TAG__
(cd release-__TAG__ && sha256sum --check checksums.txt)
```

The release patch assumes `Deployment/argocd-server` in namespace `argocd`, container `argocd-server`, and a shared `/tmp` volume named `tmp`. The installer init container checks the SHA-256 checksum and installs the bundle into `/tmp/extensions/resources` in every server pod. Review existing volumes, init containers, deployment sources, and cluster policies before applying. If `/tmp` already uses another volume name, adapt the patch to reuse it. In Helm/GitOps-managed installations, make the equivalent change in the source of truth so reconciliation preserves it.

```sh
kubectl get deployment argocd-server -n argocd -o yaml > argocd-server-before.yaml
kubectl patch deployment argocd-server -n argocd --type strategic \
  --patch-file release-__TAG__/argocd-server-patch.yaml --dry-run=server -o yaml
kubectl patch deployment argocd-server -n argocd --type strategic \
  --patch-file release-__TAG__/argocd-server-patch.yaml
kubectl rollout status deployment/argocd-server -n argocd
```

The UI bundle is separate from the backend Application and Proxy Extension. The system page appears at `/karpenter`; calls go through `/extensions/karpenter`. The backend service account can only get/list/patch `nodepools.karpenter.sh` and `ec2nodeclasses.karpenter.k8s.aws`.
