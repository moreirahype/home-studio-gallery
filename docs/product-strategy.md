# Estratégia comercial do Home Studio

## Escada de ofertas

1. Entrada: R$ 7,90
   - Gera 15 opções com GPT Image 2 em 1K.
   - Inclui 1 foto.
   - Fotos adicionais usam desconto progressivo.
2. Complemento no checkout: vídeo vertical por R$ 14,90
   - Um Reel final.
   - Usa até 3 fotos escolhidas pelo cliente.
   - Cada foto vira um clipe curto; os clipes são unidos com transições.
3. Pós-compra: novo ensaio completo por R$ 29,90
   - 10 fotos liberadas.
   - Novo tema e nova referência opcional.
   - Não repete o upsell foto a foto.
   - Pode receber novamente a oferta de vídeo.
4. Recompra pelo PWA
   - Novo ensaio completo por R$ 29,90.
   - Primeiro lembrete 7 dias após a ativação.
   - Próximos lembretes a cada 14 dias.

## Vídeo

- Modelo inicial: `bytedance/v1-pro-fast-image-to-video`.
- Formato: vertical 9:16.
- Entrada: até 3 fotos selecionadas.
- Saída: um vídeo final de aproximadamente 12 a 18 segundos.
- Gerações: até 3 clipes curtos em paralelo.
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
- novo ensaio: R$ 29,90 fixo;
- não alterar simultaneamente o preço de entrada;
- escolher o vencedor por margem por 100 compradores, não apenas por taxa de
  conversão do complemento.
