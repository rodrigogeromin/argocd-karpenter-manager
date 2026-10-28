# Extension build

Node.js **26.10.0** and npm **11.19.1** are the CI runtime versions.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package
```

The build emits exactly one Argo CD system-level bundle at `dist/resources/extension-karpenter-manager.js`. Packaging creates `../dist/karpenter-manager.tar.gz` with the single `resources/` bundle entry.
