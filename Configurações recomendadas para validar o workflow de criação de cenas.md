# Configurações recomendadas para validar o workflow de criação de cenas

## 1. Diagnóstico rápido

O workflow recebe uma imagem por `multipart/form-data`, faz uma análise visual, combina a entrada com a análise, transforma o conteúdo em uma estrutura JSON e responde pelo webhook.

A arquitetura geral é adequada para uma primeira versão, mas o nó **“Validar JSON da Cena”** atualmente valida somente se a resposta pode ser interpretada como JSON. Um objeto como `{ "erro": false }` seria considerado sucesso, embora não contenha os campos exigidos pela estrutura da cena.

Também é importante tratar explicitamente: ausência ou formato inválido da imagem, timeout da API de visão, resposta do agente com markdown, JSON incompleto, erro do Merge e demora superior ao timeout esperado pelo cliente do webhook.

## 2. Configuração recomendada por nó

| Nó | Configuração recomendada | Motivo |
|---|---|---|
| **Webhook - Rascunho** | `POST`, caminho versionado como `/v1/criar-cena`, resposta por `Respond to Webhook`, propriedade binária `data` | Evita quebra futura de clientes e mantém o contrato de resposta explícito. |
| **Webhook - Rascunho** | Ativar autenticação por header ou credencial equivalente; não deixar o endpoint público sem proteção | O endpoint consome créditos de IA e pode receber conteúdo não confiável. |
| **Webhook - Rascunho** | Validar `Content-Type`, tamanho máximo do arquivo, extensão/MIME permitido e presença de `data` | Impede que o fluxo tente analisar texto, arquivo vazio ou formato não suportado. |
| **IA Visão - Analisar Rascunho** | Para testes: `detail: low` ou equivalente e limite menor de tokens; para produção: `high` apenas quando a qualidade do desenho exigir | Reduz custo e tempo durante a validação. Aumente a qualidade depois de medir o ganho real. |
| **IA Visão - Analisar Rascunho** | Manter instruções para separar “visível”, “inferido” e “incerto”; pedir formato previsível, preferencialmente JSON | Facilita a validação automática e reduz alucinações. |
| **Preservar Rascunho + Análise** | Confirmar que há exatamente um item em cada entrada e que o binário `data` continua presente após o Merge | `combineByPosition` funciona bem com um item por ramo, mas pode produzir resultados incorretos se algum ramo gerar zero ou vários itens. |
| **Diretor de Arte - Estruturar Cena** | Usar saída estruturada/JSON Schema ou um Structured Output Parser, em vez de depender apenas de “Retorne SOMENTE o JSON” | Prompt não é garantia de JSON válido nem de campos completos. |
| **Diretor de Arte - Estruturar Cena** | Definir temperatura baixa, quando a opção estiver disponível, e limitar o tamanho da resposta | A tarefa é de extração e organização, não de criação livre. Menor variabilidade facilita os testes. |
| **OpenAI Chat Model** | Usar um modelo estável e adequado para extração estruturada; registrar o modelo como configuração versionada | Permite comparar versões e identificar regressões de comportamento. |
| **Validar JSON da Cena** | Validar sintaxe, campos obrigatórios, tipos, enumerações, limites e coerência mínima | Esta deve ser uma validação de contrato, não apenas um `JSON.parse`. |
| **Responder API** | `200` somente para sucesso; `400` para entrada inválida; `422` para cena não estruturável; `502` para falha de IA; `500` para erro interno | O consumidor consegue decidir se deve corrigir a entrada, repetir a tentativa ou abrir incidente. |
| **Tratamento de erros** | Criar uma rota de erro ou workflow de erro com `runId`, etapa, código e mensagem sanitizada | Evita que o cliente receba timeout sem explicação e permite auditoria sem expor prompt ou credenciais. |

## 3. Contrato mínimo recomendado

A saída deve conter os seguintes campos:

```json
{
  "tipo_ambiente": "string",
  "layout": "string",
  "perspectiva": "string",
  "elementos_principais": [],
  "modulo_esquerdo": {},
  "modulo_central": {},
  "modulo_direito": {},
  "elementos_superiores": [],
  "aberturas": [],
  "detalhes_anotados": [],
  "materiais_informados": [],
  "iluminacao_informada": [],
  "informacoes_do_usuario": "string",
  "restricoes": [],
  "incertezas": []
}
```

Para os testes, recomendo distinguir três estados:

- `sucesso: true`: JSON válido e contrato completo;
- `sucesso: false, codigo: JSON_INVALIDO`: a IA não retornou JSON utilizável;
- `sucesso: false, codigo: SCHEMA_INVALIDO`: JSON parseável, mas com campos ausentes ou tipos incorretos.

Não use a própria presença de `erro` como único critério de sucesso. O teste `!parsed.erro` permite que respostas incompletas sejam marcadas como válidas.

## 4. Validações que faltam no nó Code

A lógica deve, no mínimo:

1. localizar a resposta da IA (`output`, `text` ou outro campo real observado na execução);
2. remover cercas de markdown com segurança;
3. fazer o parse;
4. verificar se o resultado é objeto e não array, `null` ou string;
5. verificar todos os campos obrigatórios;
6. validar os tipos dos campos;
7. preservar uma resposta bruta limitada para diagnóstico, sem registrar dados sensíveis desnecessários;
8. retornar um código de erro determinístico.

Exemplo de regra de contrato em JavaScript para adaptar ao nó Code:

```javascript
const required = {
  tipo_ambiente: 'string',
  layout: 'string',
  perspectiva: 'string',
  elementos_principais: 'array',
  modulo_esquerdo: 'object',
  modulo_central: 'object',
  modulo_direito: 'object',
  elementos_superiores: 'array',
  aberturas: 'array',
  detalhes_anotados: 'array',
  materiais_informados: 'array',
  iluminacao_informada: 'array',
  informacoes_do_usuario: 'string',
  restricoes: 'array',
  incertezas: 'array',
};

function typeOfValue(value) {
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'object';
  return typeof value;
}

const raw = $json.output ?? $json.text ?? $json.response ?? '';
let scene;

try {
  const cleaned = String(raw)
    .replace(/^```json\\s*/i, '')
    .replace(/^```\\s*/i, '')
    .replace(/```\\s*$/i, '')
    .trim();
  scene = typeof raw === 'object' && raw !== null ? raw : JSON.parse(cleaned);
} catch {
  return {
    json: {
      sucesso: false,
      codigo: 'JSON_INVALIDO',
      etapa: 'estrutura_da_cena',
      mensagem: 'A resposta do modelo não é um JSON válido.'
    }
  };
}

const problemas = [];
if (scene === null || typeof scene !== 'object' || Array.isArray(scene)) {
  problemas.push('A cena deve ser um objeto JSON.');
} else {
  for (const [field, expected] of Object.entries(required)) {
    if (!(field in scene)) problemas.push(`Campo ausente: ${field}`);
    else if (typeOfValue(scene[field]) !== expected) {
      problemas.push(`Tipo inválido em ${field}: esperado ${expected}`);
    }
  }
}

if (problemas.length) {
  return {
    json: {
      sucesso: false,
      codigo: 'SCHEMA_INVALIDO',
      etapa: 'estrutura_da_cena',
      problemas,
      cena: scene
    }
  };
}

return {
  json: {
    sucesso: true,
    codigo: 'OK',
    etapa: 'estrutura_da_cena',
    cena: scene
  }
};
```

## 5. Casos de teste essenciais

| Caso | Entrada | Resultado esperado |
|---|---|---|
| Imagem simples | Desenho legível, sem texto adicional | `200`, cena completa, incertezas explícitas quando necessário |
| Imagem com anotações | Desenho com medidas e textos manuscritos | Textos aparecem em `detalhes_anotados`; medidas não são inventadas |
| Imagem ambígua | Desenho incompleto ou pouco legível | `200` com `incertezas` preenchidas, sem completar lacunas como fatos |
| Sem imagem | Apenas `pedido` textual | `400` se a imagem for obrigatória; não deixar a API de visão falhar de modo obscuro |
| Arquivo inválido | PDF, texto, arquivo vazio ou MIME falso | `400` antes de chamar o modelo |
| JSON com markdown | Modelo retorna ```json ... ``` | Deve ser aceito após limpeza controlada |
| JSON incompleto | Falta `modulo_central` ou outro campo | `422`, `SCHEMA_INVALIDO` |
| JSON com tipo errado | `elementos_principais` como string | `422`, com lista de problemas |
| Falha de visão | Timeout, rate limit ou credencial inválida | `502`, código interno e mensagem segura |
| Repetição | Reenvio do mesmo arquivo/pedido | Resultado consistente dentro da tolerância definida; registrar `runId` e modelo |
| Carga | Várias chamadas simultâneas | Sem mistura entre binários, análises ou respostas de itens diferentes |

## 6. Teste manual pelo terminal

Use um arquivo de imagem pequeno e válido. Substitua a URL e o token pelos valores do seu ambiente; não grave credenciais no workflow exportado nem no repositório.

```bash
curl -i -X POST 'https://SEU_HOST/webhook/v1/criar-cena' \
  -H 'Authorization: Bearer SEU_TOKEN' \
  -F 'data=@./rascunho.png;type=image/png' \
  -F 'pedido=Preservar a composição e marcar elementos ambíguos como incertos.'
```

Verifique, em cada execução, o status HTTP, o tempo total, o tamanho da imagem, a existência de `sucesso`, `codigo`, `etapa` e `cena`, além da preservação do binário antes e depois do Merge.

## 7. Observabilidade e controle de custo

Durante a validação, registre apenas metadados: `runId`, timestamp, duração por nó, tamanho e MIME do arquivo, modelo usado, código de resultado e número de tokens quando disponível. Evite registrar imagem, prompt completo e resposta bruta em logs permanentes, especialmente se os desenhos contiverem dados de clientes.

Configure timeout e tentativas limitadas para as chamadas externas. Uma política razoável é uma tentativa adicional apenas para erros transitórios, com backoff, e nenhuma repetição automática para entrada inválida, erro de autenticação ou JSON estruturalmente inválido. Coloque limite de tamanho no upload e um mecanismo de rate limiting no endpoint.

Para uma primeira bateria de validação, use `detail` menor na visão, poucos casos representativos e um conjunto fixo de desenhos anotados. Depois compare qualidade, latência, taxa de JSON válido, taxa de schema válido e custo antes de ativar o modo de maior detalhe.

## 8. Ordem ideal de implementação

1. Proteger e versionar o webhook.
2. Validar MIME, tamanho e presença do binário antes da IA.
3. Corrigir o contrato de saída com Structured Output Parser ou JSON Schema.
4. Substituir a validação booleana atual pela validação de schema.
5. Criar respostas HTTP específicas para entrada inválida, falha de IA e erro interno.
6. Adicionar rota de erro, `runId`, timeout e retry limitado.
7. Executar a matriz de testes acima com pelo menos um caso por categoria.
8. Medir qualidade e custo; só então decidir se `detail: high` é necessário em produção.

**Configuração de partida recomendada:** um item por execução, `data` como propriedade binária, autenticação por header, limite de upload, `detail` baixo durante testes, saída estruturada, temperatura baixa, validação de schema e respostas `400/422/502/500` diferenciadas.
