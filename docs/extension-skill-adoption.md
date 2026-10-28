# Argo CD UI extension contract

This repository applies `skills/argocd-ui-extension` from the `brainstorm` repository (template origin 2.2.1) to an existing Karpenter feature. The existing API and UI behavior were preserved while the extension registration and feature UI were separated into `src/argocd/`, `src/app/`, and `src/features/karpenter/`.

## Audited host profile

The project targets Argo CD 3.5.1 and registers a system-level extension with `registerSystemLevelExtension(component, title, path, icon)`. The `hostContract` in `extension/extension-project.json` records exact upstream source URLs, the zero-prop profile, automatic JSX globals, and React runtime versions. The project includes the skill's schema and validator so validation does not depend on fetching a moving branch during CI.

## Feature help

`extension/README.md` is the canonical feature guide. The production bundle imports it as text and renders it in the in-product Help panel using React Markdown with raw HTML disabled. The panel supports keyboard dismissal, focus restoration, and a close control. The system-level host profile has no host flyout props, so the panel belongs to the feature UI.

## Validation

Run `cd extension && npm ci && npm run validate`. This checks runtime versions, the project contract, TypeScript, extension contract tests, production compilation and packaging, and the bundled help evidence. The workflow also runs `npm audit` and the FastAPI test suite. These checks do not replace installation against a live Argo CD instance; that integration has not been run in this repository workflow.
