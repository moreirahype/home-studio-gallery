# Estratégia comercial do Home Studio

## Escada de ofertas

1. Entrada: R$ 7,90
   - Gera 15 opções com GPT Image 2 em 1K.
   - Inclui 1 foto.
   - Fotos adicionais usam desconto progressivo.
2. Complemento no checkout: vídeo vertical por R$ 14,90
   - Um vídeo vertical de aproximadamente 15 segundos.
   - Usa até 3 fotos escolhidas pelo cliente.
   - Cada foto ganha movimento e os trechos são unidos com transições.
   - Inclui uma trilha instrumental licenciada, com volume suave.
3. Pós-compra: novo ensaio VIP por R$ 14,90
   - 15 opções e 3 fotos incluídas.
   - Novo tema e nova referência opcional.
   - Não concorre com a entrada de R$ 7,90, porque entrega mais fotos já
     liberadas.
   - Repete o upsell de fotos adicionais e pode receber novamente a oferta de
     vídeo.
4. Recusa da oferta VIP
   - Não oferecer um downsell pago menor dentro do mesmo fluxo.
   - Mostrar instalação do app e ativação de notificações como retenção.
   - Usar notificações para temas novos, vantagens e ofertas pontuais.
5. Recompra pelo PWA
   - Novo ensaio padrão com 15 opções por R$ 7,90.
   - Inclui 1 foto e mantém a mesma lógica de galeria com fotos adicionais.
   - Primeiro lembrete 7 dias após a ativação.
   - Próximos lembretes a cada 14 dias.

## Vídeo

- Modelo inicial: `bytedance/v1-pro-fast-image-to-video`.
- Formato: vertical 9:16.
- Entrada: as primeiras 3 fotos selecionadas.
- O cliente pode alterar essas fotos em um controle opcional no checkout.
- A escolha não cria uma etapa obrigatória antes do pagamento.
- Se houver apenas 1 foto, são criados 3 movimentos diferentes dela.
- Se houver 2 fotos, uma delas recebe uma segunda variação de movimento.
- Saída: um vídeo final de aproximadamente 12 a 18 segundos.
- Gerações: até 3 clipes curtos em paralelo.
- Música: faixa instrumental licenciada, adicionada automaticamente.
- Prazo comercial sugerido: até 15 minutos.
- Preço inicial: R$ 14,90.

O vídeo fica como order bump porque entra no mesmo pagamento das fotos e evita
uma segunda cobrança. Para clientes que levarem somente a foto incluída, a
oferta aparece antes da liberação gratuita.

## Pagamento

- Pix deve aparecer primeiro e aberto por padrão.
- Cartão deve ficar disponível no mesmo Payment Brick.
- Não oferecer parcelamento abaixo de R$ 50.
- Para valores baixos, Pix preserva margem.
- Cartão reduz abandono quando o cliente não consegue ou não quer trocar de
  aplicativo para pagar.

## Métricas para encontrar o sweet spot

Medir separadamente:

- conversão da entrada;
- abertura da galeria;
- quantidade média de fotos levadas;
- adesão ao vídeo;
- adesão ao novo ensaio;
- ticket médio total;
- receita por comprador;
- margem depois de IA, pagamentos e tráfego;
- recompra em 7, 21 e 45 dias.

Primeiro teste recomendado:

- vídeo: R$ 14,90 versus R$ 19,90;
- novo ensaio VIP: R$ 14,90 com 3 fotos incluídas;
- não alterar simultaneamente o preço de entrada;
- escolher o vencedor por margem por 100 compradores, não apenas por taxa de
  conversão do complemento.
