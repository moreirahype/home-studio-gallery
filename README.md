# Home Studio Gallery

Galeria de fotos geradas por IA com seleção, pagamento por Pix e liberação
automática dos arquivos comprados.

## Fluxo planejado

1. O ZapData valida o comprovante da compra inicial.
2. O ZapData chama `POST /api/webhooks/zapdata`.
3. O backend cria o projeto e agenda as gerações configuradas no Kie.ai.
4. O callback do Kie.ai envia os resultados para `POST /api/webhooks/kie`.
5. O backend armazena os originais de forma privada e gera prévias com marca d'água.
6. O cliente escolhe as fotos na galeria.
7. O backend cria uma cobrança Pix no Mercado Pago.
8. Após confirmação e consulta do pagamento, libera links temporários.
9. O upsell aprovado é enviado ao Home Studio BI com origem
   `Home Studio Gallery`.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000/g/demo` para visualizar a primeira versão da galeria.

Para testar outras ofertas sem banco, use os parâmetros da demonstração:

```text
/g/demo?paidAmount=6.90&includedPhotos=1
/g/demo?paidAmount=13.90&includedPhotos=3
```

A curva inteira é escalada automaticamente para que o valor e a quantidade
informados sejam o crédito inicial da compra. Em produção, os mesmos dados
serão lidos do projeto salvo pelo token e não da URL.

## Webhook inicial do ZapData

Use um único bloco HTTP depois da aprovação do OCR. Envie
`x-webhook-secret` no cabeçalho e o seguinte JSON:

```json
{
  "foto_cliente": "https://url-temporaria-da-foto",
  "contexto_final": "Ensaio profissional em estúdio",
  "nicheId": "executivo",
  "includedPhotos": 1,
  "paidAmount": 7.90,
  "generationCount": 15
}
```

`contactId`, `contactName`, `phone` e `receiptId` também podem ser enviados e
serão usados na persistência quando o fluxo sair da homologação.

Não é necessário criar um webhook para cada prompt ou nicho. O
`contexto_final` entra no prompt-base e o backend acrescenta 20 instruções
diferentes de cena, composição, pose e câmera. Se algum nicho precisar de
regras estruturais próprias, envie também `nicho` e mantenha essa diferença no
backend, sem duplicar o fluxo do ZapData.

Resposta esperada:

```json
{
  "ok": true,
  "projectId": "uuid",
  "status": "queued",
  "galleryUrl": "https://dominio.com/g/token"
}
```

## Estado atual

- Galeria responsiva e mobile-first
- Seleção numerada de até 20 fotos, com 15 por padrão
- Desconto progressivo aplicado automaticamente
- Incentivo contextual para o próximo pacote
- Resumo fixo com economia, desconto e valor por foto
- Contratos iniciais dos três webhooks
- Migração inicial do Supabase
- Um único webhook atende todos os nichos usando `contexto_final`
- Plano centralizado com 20 variações reais de cena e composição
- Contrato para registrar somente upsells aprovados no Home Studio BI
- Oferta complementar de vídeo no checkout
- Oferta pós-compra de um novo ensaio completo com 10 fotos
- Instalação como PWA no Android e iPhone
- Notificações de recompra programadas
- Formulário amigável para enviar referência e descrever um novo tema
- Persistência, geração real, marca d'água e Pix ainda serão conectados

## Home Studio BI

Somente o valor pago dentro da galeria deve ser enviado ao BI depois que o
Mercado Pago retornar o pagamento como aprovado. A entrada do front continua
chegando pelo fluxo atual e não é repetida.

As transações são registradas com:

```text
atendente=Galeria
origem=Home Studio Gallery
valor=apenas o saldo pago no upsell
```

Configure na galeria:

```text
HSBI_WEBHOOK_URL=https://script.google.com/macros/s/SEU_ID/exec
HSBI_WEBHOOK_SECRET=uma-chave-forte
```

No Apps Script do BI, crie a propriedade:

```text
GALLERY_WEBHOOK_SECRET=mesma-chave-forte
```

Cada upsell usa o identificador do pagamento do Mercado Pago como ID da
transação e a origem `Home Studio Gallery`. Assim, reenvios do webhook não
duplicam o faturamento.

## Régua inicial de preços

| Quantidade | Total | Valor médio |
| --- | ---: | ---: |
| 1 foto | R$ 7,90 | R$ 7,90 |
| 3 fotos | R$ 22,80 | R$ 7,60 |
| 5 fotos | R$ 32,80 | R$ 6,56 |
| 10 fotos | R$ 52,80 | R$ 5,28 |
| 15 fotos | R$ 67,80 | R$ 4,52 |

As quantidades intermediárias também têm preços próprios, sempre crescentes. O
cliente não escolhe um pacote manualmente: o sistema aplica o melhor valor para
a quantidade selecionada. Como os R$ 7,90 da entrada já foram pagos, a galeria
inclui a primeira foto e cobra no Pix apenas a diferença do pacote escolhido.

Os R$ 7,90 são apenas a oferta padrão. `paidAmount`, `includedPhotos` e
`generationCount` enviados
pelo ZapData passam a ser a fonte oficial para calcular o crédito e escalar a
curva de desconto de cada cliente.

O vídeo vertical custa R$ 14,90 por padrão e o novo ensaio custa R$ 29,90.
Esses valores podem ser alterados com `VIDEO_UPSELL_PRICE` e
`NEW_SHOOT_UPSELL_PRICE`.

A estratégia comercial completa está em
[`docs/product-strategy.md`](docs/product-strategy.md).
