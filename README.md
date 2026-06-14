# Home Studio Gallery

Galeria de fotos geradas por IA com seleção, pagamento por Pix e liberação
automática dos arquivos comprados.

## Fluxo planejado

1. O ZapData valida o comprovante da compra inicial de R$ 4,90.
2. O ZapData chama `POST /api/webhooks/zapdata`.
3. O backend cria o projeto e agenda 20 gerações no Kie.ai.
4. O callback do Kie.ai envia os resultados para `POST /api/webhooks/kie`.
5. O backend armazena os originais de forma privada e gera prévias com marca d'água.
6. O cliente escolhe as fotos na galeria.
7. O backend cria uma cobrança Pix no Mercado Pago.
8. Após confirmação e consulta do pagamento, libera links temporários.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000/g/demo` para visualizar a primeira versão da galeria.

## Webhook inicial do ZapData

Envie `x-webhook-secret` no cabeçalho e o seguinte JSON:

```json
{
  "contactId": "contato-123",
  "contactName": "Cliente",
  "phone": "5511999999999",
  "sourceImageUrl": "https://url-temporaria-da-foto",
  "prompt": "Ensaio profissional em estúdio",
  "receiptId": "identificador-unico-do-comprovante"
}
```

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
- Seleção numerada de até 20 fotos
- Desconto progressivo aplicado automaticamente
- Incentivo contextual para o próximo pacote
- Resumo fixo com economia, desconto e valor por foto
- Contratos iniciais dos três webhooks
- Migração inicial do Supabase
- Persistência, geração real, marca d'água e Pix ainda serão conectados

## Régua inicial de preços

| Quantidade | Total | Valor médio |
| --- | ---: | ---: |
| 1 foto | R$ 9,90 | R$ 9,90 |
| 3 fotos | R$ 24,90 | R$ 8,30 |
| 5 fotos | R$ 34,90 | R$ 6,98 |
| 10 fotos | R$ 54,90 | R$ 5,49 |
| 15 fotos | R$ 69,90 | R$ 4,66 |
| 20 fotos | R$ 79,90 | R$ 4,00 |

As quantidades intermediárias também têm preços próprios, sempre crescentes. O
cliente não escolhe um pacote manualmente: o sistema aplica o melhor valor para
a quantidade selecionada.
