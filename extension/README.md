# Karpenter Manager

Karpenter Manager is a system-level Argo CD UI extension for inspecting and editing Karpenter `NodePool` and `EC2NodeClass` specifications. This document is also the in-product Help content and is bundled with the extension so it works without an external documentation service.

## What it does

- Lists `NodePool` and `EC2NodeClass` custom resources available through the configured API.
- Loads an individual resource into guided forms for common NodePool and EC2NodeClass options.
- Validates common values locally and asks the operator to review the impact before applying changes.
- Preserves selectors and mappings that use advanced configurations the form cannot safely simplify.
- Shows API errors, loading state, empty state, and a success message.
- Provides this guide in the Argo CD UI through the **Ajuda** button.

## How to use it

1. Open **Karpenter** from the Argo CD system navigation.
2. Choose **NodePools** or **EC2NodeClasses**.
3. Select a resource to open its guided configuration form.
4. Change the available fields, choose **Revisar alterações**, then review and apply the summary.
5. Use **Atualizar** to reload the current resource list. Open **Ajuda** for this guide.

Changes are sent directly to the Kubernetes API by the backend and may be reconciled or overwritten by GitOps controllers. The form covers commonly used capacity, limits, disruption, identity, network discovery, metadata, and AMI settings. Advanced selectors and EBS mappings stay unchanged unless explicitly supported by the form. Review the summary and your GitOps source of truth before editing production resources.

## Configuration

The extension is registered as a system-level extension using `extension/extension-project.json`:

- Title: `Karpenter`
- Path: `/karpenter`
- API base path: `/extensions/karpenter/api/v1`
- API context headers: `Argocd-Application-Name` and `Argocd-Project-Name`
- Header values: read at runtime from `window.karpenterManagerConfig`, supplied by the `karpenter-manager-config` ConfigMap mounted into `argocd-server`.

The backend is configured separately. Keep the Application/project values in the Argo CD UI ConfigMap aligned with the `karpenter-manager-context` ConfigMap used by the API. When either value changes, restart `argocd-server` and the `karpenter-manager` Deployment so the mounted configuration and API environment reload. See the repository's deployment guide for the Argo CD extension proxy and Kubernetes credentials. The API must provide `GET /nodepools`, `GET /nodepools/{name}`, `PATCH /nodepools/{name}`, and corresponding `/ec2nodeclasses` endpoints.

## Prerequisites

- Argo CD UI with system-level extensions enabled and compatible with the host contract recorded in the project manifest.
- The Karpenter Manager API deployed behind the Argo CD extension proxy.
- Kubernetes API access for the backend service account to list, read, and patch Karpenter `NodePool` and `EC2NodeClass` resources.
- Appropriate RBAC and network policies for the API service.

## Limitations

- The guided form intentionally exposes a focused set of options; advanced Karpenter configuration remains preserved and is not editable here.
- The review step summarizes affected areas, but is not a complete field-by-field diff and there is no rollback.
- Kubernetes admission and Karpenter validation are authoritative. A syntactically valid JSON document may still be rejected by the cluster.
- The extension does not independently authenticate users; requests rely on the Argo CD session and backend authorization configuration.
- The prototype only supports the API routes listed above and assumes their response shape contains an `items` array for list responses and a resource object for detail or patch responses.
- This help content is rendered as Markdown with raw HTML disabled and is bundled into the extension for offline use.
