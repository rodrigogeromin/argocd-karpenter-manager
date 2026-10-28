# Karpenter Manager

O Karpenter Manager é uma extensão de sistema do Argo CD para consultar e editar configurações dos recursos `NodePool` e `EC2NodeClass` do Karpenter. Este documento também é a ajuda exibida dentro da extensão. Ele é incluído no pacote, então funciona sem depender de um serviço externo de documentação.

## O que a extensão faz

- Lista os recursos personalizados `NodePool` e `EC2NodeClass` disponíveis pela API configurada.
- Abre cada recurso em um formulário guiado com opções comuns de configuração.
- Valida localmente os valores mais comuns e pede que você revise o impacto antes de aplicar as alterações.
- Preserva seletores e mapeamentos avançados que o formulário não consegue simplificar com segurança.
- Exibe erros da API, estado de carregamento, listas vazias e confirmação de sucesso.
- Disponibiliza esta orientação no Argo CD pelo botão **Ajuda**.

## Como usar

1. No menu de sistema do Argo CD, abra **Karpenter**.
2. Escolha **NodePools** ou **EC2NodeClasses**.
3. Selecione um recurso para abrir o formulário guiado de configuração.
4. Altere os campos disponíveis, clique em **Revisar alterações** e confira o resumo antes de aplicar.
5. Use **Atualizar** para carregar novamente a lista de recursos. Abra **Ajuda** para consultar estas orientações.

As alterações são enviadas pelo backend diretamente à API do Kubernetes. Controladores GitOps podem reconciliar os recursos ou substituir as alterações feitas pela extensão. Os formulários cobrem opções comuns de capacidade, limites, interrupções, identidade, descoberta de rede, metadados e AMI. Seletores avançados e mapeamentos EBS existentes são mantidos como estão, a menos que o formulário ofereça suporte explícito a eles. Antes de editar recursos de produção, confira o resumo das alterações e a fonte de verdade do seu GitOps.

## Configuração

A extensão é registrada como uma extensão de sistema usando `extension/extension-project.json`:

- Título: `Karpenter`
- Caminho: `/karpenter`
- Caminho base da API: `/extensions/karpenter/api/v1`
- Cabeçalhos de contexto da API: `Argocd-Application-Name` e `Argocd-Project-Name`
- Valores dos headers: lidos em tempo de execução de `window.karpenterManagerConfig`, fornecido pelo ConfigMap `karpenter-manager-config` montado no `argocd-server`.

A configuração do backend é separada. Mantenha os valores de Application e Project do ConfigMap da interface do Argo CD alinhados com o ConfigMap `karpenter-manager-context` usado pela API. Quando qualquer um desses valores mudar, reinicie `argocd-server` e o Deployment `karpenter-manager` para recarregar a configuração montada e as variáveis de ambiente da API. Consulte o guia de instalação do repositório para configurar o proxy da extensão do Argo CD e as credenciais do Kubernetes. A API deve fornecer `GET /nodepools`, `GET /nodepools/{name}`, `PATCH /nodepools/{name}` e as rotas equivalentes para `/ec2nodeclasses`.

## Pré-requisitos

- Interface do Argo CD com extensões de sistema habilitadas e compatível com o contrato do host registrado no manifesto do projeto.
- API do Karpenter Manager implantada atrás do proxy de extensões do Argo CD.
- Permissão de acesso à API do Kubernetes para que a conta de serviço do backend possa listar, consultar e alterar recursos `NodePool` e `EC2NodeClass` do Karpenter.
- Regras adequadas de RBAC e políticas de rede para a API.

## Limitações

- O formulário guiado oferece um conjunto específico de opções. Configurações avançadas do Karpenter são preservadas, mas não podem ser editadas por esta interface.
- A etapa de revisão resume as áreas afetadas, mas não mostra uma comparação completa campo a campo e não há opção de desfazer.
- As regras de admissão do Kubernetes e a validação do Karpenter são as fontes definitivas. Um documento JSON sintaticamente válido ainda pode ser rejeitado pelo cluster.
- A extensão não autentica usuários de forma independente; as solicitações dependem da sessão do Argo CD e da configuração de autorização do backend.
- O protótipo oferece suporte apenas às rotas da API listadas acima. As respostas de listagem devem conter um array `items`; as respostas de consulta e alteração devem conter o objeto do recurso.
- Este conteúdo é exibido como Markdown, sem HTML bruto, e acompanha a extensão para uso mesmo sem conexão com um serviço externo de documentação.
