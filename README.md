# Argo CD Karpenter Manager (protótipo)

Extensão system-level do Argo CD (`/karpenter`) com uma API FastAPI para consultar e editar recursos Karpenter `NodePool` e `EC2NodeClass` em clusters registrados no Argo CD.

A interface não depende de uma Application que possua os recursos. O usuário escolhe um cluster do inventário do Argo CD; a API resolve a conexão registrada e acessa diretamente a API Kubernetes desse cluster. O cluster local aparece como `in-cluster`.

> As operações de escrita alteram o recurso diretamente no cluster. Restrinja quem pode invocar a extensão e revise as mudanças antes de aplicar.

## Escopo do protótipo

- Página system-level, disponível sem selecionar uma Application.
- Seletor de cluster com nome, projeto e tipo de autenticação configurada.
- Consulta e edição dos NodePools e EC2NodeClasses diretamente no cluster escolhido.
- Formulário guiado para opções comuns, com preservação das configurações avançadas não editadas.
- Modo de fixtures em memória para desenvolvimento local da API.

O protótipo reconhece clusters com `bearerToken` ou `awsAuthConfig` do EKS (com role opcional). Outros provedores, autenticação por certificado cliente e configuração via exec ainda não são suportados; a API retorna erro explícito nesses casos.

## Segurança e permissões

Para montar conexões remotas, a ServiceAccount da API lê os Secrets de cluster no namespace `argocd`, identificados pelo label `argocd.argoproj.io/secret-type=cluster`. O RBAC é limitado ao namespace `argocd`, mas `list` de Secrets pode revelar qualquer Secret desse namespace. Portanto, considere este acesso sensível e restrinja o namespace e a invocação da extensão.

As operações no cluster remoto usam a credencial registrada no Secret do Argo CD. Essa credencial precisa ter `get`, `list` e `patch` em `nodepools.karpenter.sh` e `ec2nodeclasses.karpenter.k8s.aws`. A identidade IAM do pod precisa poder assumir `roleARN`, se configurada em `awsAuthConfig`. A API nunca aceita endpoint de cluster fornecido pelo navegador; o ID é resolvido exclusivamente pelo inventário do Argo CD.

Em produção, prefira credenciais dedicadas com privilégio mínimo por cluster ou um agente por cluster. A API deve ser tratada como componente com acesso a todas as credenciais guardadas nos Secrets de cluster do Argo CD.

## Executar a API localmente

```sh
cd api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
KARPENTER_DEMO_MODE=true uvicorn main:app --reload --port 8080
```

No modo local, consulte `http://localhost:8080/docs`. Em produção, a conexão ao cluster de controle usa o token e a CA da ServiceAccount; a conexão ao cluster remoto usa os dados registrados pelo Argo CD. Veja `deploy/application.yaml` para o RBAC e a implantação.

## Integração com Argo CD

- Registre com `registerSystemLevelExtension(component, 'Karpenter', '/karpenter', 'fa-server')` após a montagem do `#app`, usando o padrão system-level.
- Configure o Argo CD Proxy Extension `karpenter` para `http://karpenter-manager.karpenter-manager.svc.cluster.local:8080`.
- Conceda `extensions, invoke, karpenter, allow` apenas às roles autorizadas.
- A extensão usa URLs relativas em `/extensions/karpenter`, compatíveis com instalações sob um base path.

Os headers de Application e Project vêm da configuração do proxy da extensão. Eles afirmam o contexto do proxy e não autenticam nem selecionam o cluster de destino.

## API

- `GET /healthz`
- `GET /api/v1/clusters`
- `GET /api/v1/clusters/{clusterId}/nodepools`
- `GET /api/v1/clusters/{clusterId}/nodepools/{name}`
- `PATCH /api/v1/clusters/{clusterId}/nodepools/{name}` com `{"spec": {...}}`
- Os mesmos endpoints para `ec2nodeclasses`.

O `clusterId` deve ser um ID do inventário Argo CD. O patch usa `application/merge-patch+json` e aceita apenas a chave de topo `spec`. Validações Kubernetes e reconciliação do Karpenter continuam valendo.

## CI, build e releases

O GitHub Actions compila a extensão system-level, verifica tipos, executa os testes de contrato, cria o bundle e publica artefatos de CI. A workflow de release é acionada por uma tag `v*`, que deve corresponder à versão em `extension/package.json`. Após atualizar a versão na branch principal:

```sh
git tag v0.2.6
git push origin v0.2.6
```

A release publica o bundle, checksum, identidade da release e manifests da extensão, API, proxy e instruções de instalação.
