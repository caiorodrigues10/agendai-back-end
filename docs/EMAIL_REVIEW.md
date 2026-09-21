# Revisão do lote de e-mails — 2026-09-21

Este lote entrega o catálogo de templates para usuários do salão e sua resolução nas filas existentes. Não ativa novos disparos para clientes finais.

Correções da revisão:

- Datas aceitam strings ISO após serialização nas filas.
- Links apontam para agenda, assinatura e recuperação de senha existentes.
- URLs aceitam apenas HTTP/HTTPS, sem credenciais, e são escapadas nos atributos HTML.
- Layout responsivo com cores claras/escuras, conteúdo escapado e texto simples.
- Resend recebe chave de idempotência estável por job/delivery; retries mantêm a chave.
- Erros de configuração e permanentes encerram retries nas duas filas; rede, 429 e 5xx permitem retry.
- Falha de renovação e encerramento de teste têm tipos próprios no ledger.
- Modelo de preferências sem consumidores retirado do lote: nenhuma migration ou alteração de banco necessária.

Ainda pendente do plano completo:

- Preferências individuais com API, autorização, interface, migration e aplicação antes de enviar.
- Integração dos novos templates aos eventos reais de senha, equipe, assinatura e agenda.
- Scheduler do resumo às 18h no fuso do salão e seleção dos destinatários.
- Galeria de desenvolvimento e avaliação visual em clientes de e-mail.
- Validação de entrega real com destinatário autorizado e configuração do domínio Resend.

Os builders e a fila disponíveis não significam que os eventos acima já foram conectados. Não foram enviados e-mails reais nesta revisão.

## Validação

- Typecheck, build, Prisma validate e docs:check passaram.
- 25 testes direcionados de e-mail passaram, incluindo provider mockado.
- Suíte geral: 621 testes passaram; 1 falhou em `barbershops.spec.ts`, na desativação.
  Esse teste usa o identificador fictício `shop-1`, mas o use case chama uma
  transação Prisma real, que rejeita o UUID. Os arquivos envolvidos não foram
  alterados neste lote. O teste precisa isolar o Prisma; não é evidência de
  falha do envio de e-mail.
- Entrega real, Redis e aparência em Gmail/Outlook não foram validados.
