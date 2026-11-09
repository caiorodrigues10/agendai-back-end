# Spike: OCR de planilhas enviadas por foto/print

> **Validado só em prints sintéticos de tabela simples. Não validado: manuscrito, foto de celular, PDF escaneado.**

Execução: 2026-11-04T06:57:08.505Z · **66 imagens** · determinísticos com 1 execução; LLM com 2 execuções por imagem (exceto `ruido`).

Este spike responde **uma pergunta**: quando o cliente manda a planilha por foto em vez de arquivo, qual abordagem erra menos **de forma silenciosa**? A métrica central é o **falso confiante**: a célula sai errada da imagem e ainda **passa** pela validação de produção (`normalizePhone`/`normalizeMoney`), então entra no CRM como se estivesse certa.

**Status:** spike **encerrado em 2026-11-02**. Critérios aprovados com ajustes (C3 removido). Próximo passo: benchmark com 5–10 imagens reais anonimizadas. **Fase 2 não iniciada.**

## Portão da Fase 2

**Este spike não decide nada sozinho.** A Fase 2 só começa quando **5 a 10 imagens reais anonimizadas** (enviadas por clientes, com consentimento) passarem por **este mesmo benchmark**, com ground truth anotado à mão para elas e as mesmas métricas. Se os números reais não reproduzirem o comportamento aqui medido, o spike é reavaliado antes de qualquer implementação. Dataset sintético serve para definir o método e expor riscos; não substitui imagem real.

## Dataset

- **66 imagens sintéticas** com seed fixa (reprodutível): 36 de degradação (print, JPEG de WhatsApp, foto escurecida, baixa resolução, torta, ruído extremo) e 30 de estrutura (com grade, sem grade, linha TOTAL, nomes com acento, telefone com máscara).
- **429 linhas** de ground truth; telefone e valor são comparados **depois** dos normalizadores reais do backend; nome é comparação textual sem acento/caixa/espaço.
- Alinhamento linha a linha por pontuação (nome + telefone + valor). Célula: correta, ausente ou errada; das erradas separamos **falso confiante** (normaliza) de **erro detectável** (não normaliza).
- **Não coberto por este dataset:** manuscrito (letra de mão); PDF escaneado (documento inteiro, várias páginas); tabela com células mescladas; foto com fundo não branco / sombra forte; duas tabelas na mesma imagem.

## Matriz de decisão (medida)

`Revisão` = linhas com pelo menos uma célula errada/ausente (o que o dono teria de conferir); `linhas FC` = linhas com telefone/valor errado que ainda normaliza. Percentuais de linha usam o total de linhas avaliadas por candidato.

| Candidato | Telefone (exatos) | Falso confiante (tel.) | Valor (exatos) | Falso confiante (valor) | Nome | Revisão (linhas) | Linhas FC | Fantasma | Falhas | Tempo/imagem | Rede | Deployável |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A-tesseract-texto | 327/429 (76.2%) | **8** | 323/429 (75.3%) | **29** | 332/429 (77.4%) | 139/429 (32.4%) | 33 | 116 | 0/66 | 0.4 s | não | sim |
| B-tesseract-layout | 351/429 (81.8%) | **1** | 351/429 (81.8%) | 0 | 332/429 (77.4%) | 109/429 (25.4%) | 1 | 59 | 0/66 | 0.3 s | não | sim |
| C-macos-vision | 363/429 (84.6%) | **2** | 365/429 (85.1%) | **6** | 362/429 (84.4%) | 76/429 (17.7%) | 8 | 79 | 0/66 | 0.8 s | não | **não** (macOS — Vision/pyobjc) |
| D-llm-visao | 776/780 (99.5%) | **4** | 780/780 (100.0%) | 0 | 780/780 (100.0%) | 2/390 (0.5%) | 2 | 0 | 0/120 | 8.7 s | sim | sim |
| E-ocr+llm | 717/780 (91.9%) | **10** | 705/780 (90.4%) | **11** | 659/780 (84.5%) | 70/390 (17.9%) | 9 | 3 | 7/120 | 9.2 s | sim | sim |
| F*-gate-ablation | 776/780 (99.5%) | **4** | 780/780 (100.0%) | 0 | 780/780 (100.0%) | 2/390 (0.5%) | 2 | 0 | 0/120 | 8.7 s | sim | sim |
| G-paddleocr | 368/429 (85.8%) | **3** | 376/429 (87.6%) | **1** | 368/429 (85.8%) | 67/429 (15.6%) | 4 | 79 | 0/66 | 7.9 s | não | sim (Python no container: venv ~981 MB + modelos ~133 MB) |
- **Deployável / custo (G):** PaddleOCR é Apache-2.0 e roda local, mas precisa de runtime Python no container. Medido com `/usr/bin/time -l` no lote de 66 imagens (1 execução): venv ~981 MB (paddlepaddle + paddleocr + deps) e modelos ~133 MB (PP-OCRv6 médio det+rec, português/latino); pico de RAM ~1.2 GB. Custo de tempo: carga do modelo ~2,1 s (uma vez por processo Python) + inferência em lote ~5,0 s/imagem; como o runner reabre um processo Python por imagem, o `tempoMedioMs` medido em `run.ts` fica em ~7,9 s/imagem (contra ~0,35 s do B, que carrega o worker do Tesseract ~0,5 s e infere ~0,34 s/imagem com ~204 MiB de RAM).

> `F*` é uma **ablação**: pega as mesmas extrações do D e aplica o gate de produção, sem chamar o modelo de novo. É a comparação D × D+gate sem variância do LLM.

## Regime de qualidade aceitável (acima do piso)

As linhas abaixo excluem `baixa-resolucao` e `ruido` — as duas degradações que o pipeline deve **recusar** antes de tentar (ver piso de resolução). É neste regime que a extração aconteceria de verdade.

| Candidato | Telefone | FC tel. | Valor | FC valor | Nome | Acerto 3 colunas | Revisão (linhas) | Linhas FC |
|---|---|---|---|---|---|---|---|---|
| A-tesseract-texto | 319/351 (90.9%) | 0 | 319/351 (90.9%) | **18** | 320/351 (91.2%) | 91.0% | 61/351 (17.4%) | 18 |
| B-tesseract-layout | 351/351 (100.0%) | 0 | 351/351 (100.0%) | 0 | 320/351 (91.2%) | 97.1% | 31/351 (8.8%) | 0 |
| C-macos-vision | 335/351 (95.4%) | **1** | 341/351 (97.2%) | **1** | 337/351 (96.0%) | 96.2% | 20/351 (5.7%) | 2 |
| D-llm-visao | 700/702 (99.7%) | **2** | 702/702 (100.0%) | 0 | 702/702 (100.0%) | 99.9% | 1/351 (0.3%) | 1 |
| E-ocr+llm | 702/702 (100.0%) | 0 | 702/702 (100.0%) | 0 | 640/702 (91.2%) | 97.1% | 31/351 (8.8%) | 0 |
| F*-gate-ablation | 700/702 (99.7%) | **2** | 702/702 (100.0%) | 0 | 702/702 (100.0%) | 99.9% | 1/351 (0.3%) | 1 |
| G-paddleocr | 339/351 (96.6%) | 0 | 345/351 (98.3%) | 0 | 342/351 (97.4%) | 97.4% | 15/351 (4.3%) | 0 |

### Revisão real quando todo nome vai para revisão

A confiança do nome não é calibrável (há erros em 70–100), então a regra conservadora é **revisar todo nome**. Como toda linha tem nome, o número de linhas tocadas deixa de ser 8,8% e passa a ser 100%:

| Cenário (B) | Linhas revisadas | % |
|---|---|---|
| Só células com erro/ausência (acima do piso) | 31/351 | 8.8% |
| Todo nome em revisão (acima do piso) | 351/351 | 100,0% |
| Todo nome em revisão (dataset bruto) | 429/429 | 100,0% |

Na prática: **≈6,5 linhas por planilha, todas conferidas**. O B elimina a digitação de telefone/valor (acerta 100% acima do piso), mas **não reduz o número de linhas que o dono abre** — reduz o esforço dentro de cada linha. Se a Fase 2 prometer redução de conferência, ela não se sustenta com B; a promessa correta é redução de digitação.

## Varredura de resolução (A e B)

As 6 imagens de print limpo foram reduzidas para 100%, 75%, 50% e 35% da largura original; a coluna "largura da tabela" é a largura resultante da região da tabela (imagem menos as margens). Critério de "funciona": **telefone e valor ≥90% exatos e zero falso confiante** em telefone/valor.

| Escala | Largura da tabela | Candidato | Telefone | FC tel. | Valor | FC valor |
|---|---|---|---|---|---|---|
| 100% | 924 px | A-tesseract-texto | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 |
| 100% | 924 px | B-tesseract-layout | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 |
| 75% | 693 px | A-tesseract-texto | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 |
| 75% | 693 px | B-tesseract-layout | 39/39 (100.0%) | 0 | 32/39 (82.1%) | 0 |
| 50% | 462 px | A-tesseract-texto | 20/39 (51.3%) | 9 | 18/39 (46.2%) | 11 |
| 50% | 462 px | B-tesseract-layout | 13/39 (33.3%) | 4 | 6/39 (15.4%) | 0 |
| 35% | 323 px | A-tesseract-texto | 0/39 (0.0%) | 0 | 0/39 (0.0%) | 0 |
| 35% | 323 px | B-tesseract-layout | 0/39 (0.0%) | 0 | 0/39 (0.0%) | 0 |

**Piso medido: ~693 px de largura da REGIÃO DA TABELA** (menor escala em que algum candidato passa: 75%). Esse número é a largura da tabela, não da imagem: a 75% a foto tem ~720 px, mas a tabela em si fica em ~693 px por causa das margens. Quem sustenta o piso é o **A** (100% de telefone e valor); o **B**, recomendado adiante, mantém telefone em 100% mas o **valor cai para 82,1%** (32/39) nessa escala e só fica perfeito a 100% (~924 px da tabela). A 50% o A começa a **inventar** (9 falsos confiantes de telefone e 11 de valor) e o B passa a devolver ausências. **Isso foi medido só em prints sintéticos e NÃO foi validado com foto real** — perspectiva, foco e sombra podem exigir um piso maior. A imagem abaixo do piso deve ser recusada com pedido de reenvio.

## Calibração de confiança (Tesseract, candidato B)

Confiança da célula = **menor confiança de palavra** do Tesseract naquela célula (conservadora). Total de falso confiante em telefone/valor no dataset: **1**.

### Acerto por faixa de confiança

| Coluna | Faixa | Células | Corretas | Erradas | Ausentes | Falso confiante |
|---|---|---|---|---|---|---|
| nome | 0–49 | 75 | 5 | 4 | 66 | 4 |
| nome | 50–59 | 9 | 5 | 4 | 0 | 4 |
| nome | 60–69 | 7 | 5 | 2 | 0 | 2 |
| nome | 70–79 | 16 | 7 | 9 | 0 | 9 |
| nome | 80–89 | 38 | 30 | 8 | 0 | 8 |
| nome | 90–100 | 284 | 280 | 4 | 0 | 4 |
| telefone | 0–49 | 77 | 3 | 1 | 73 | 1 |
| telefone | 50–59 | 0 | 0 | 0 | 0 | 0 |
| telefone | 60–69 | 5 | 2 | 0 | 3 | 0 |
| telefone | 70–79 | 2 | 1 | 0 | 1 | 0 |
| telefone | 80–89 | 9 | 9 | 0 | 0 | 0 |
| telefone | 90–100 | 336 | 336 | 0 | 0 | 0 |
| valor | 0–49 | 78 | 0 | 0 | 78 | 0 |
| valor | 50–59 | 2 | 2 | 0 | 0 | 0 |
| valor | 60–69 | 1 | 1 | 0 | 0 | 0 |
| valor | 70–79 | 12 | 12 | 0 | 0 | 0 |
| valor | 80–89 | 100 | 100 | 0 | 0 | 0 |
| valor | 90–100 | 236 | 236 | 0 | 0 | 0 |

### Efeito do limiar de revisão

Célula com confiança **abaixo** do limiar vai para revisão humana; acima entra automática. `FC automático` é o falso confiante que entraria sem revisão.

| Limiar | Revisão (células) | Revisão (linhas) | Correção automática | FC automático | FC evitado |
|---|---|---|---|---|---|
| 50 | 155/858 (18.1%) | 88/429 (20.5%) | 699/703 | 0 | 1 |
| 60 | 157/858 (18.3%) | 96/429 (22.4%) | 697/701 | 0 | 1 |
| 70 | 163/858 (19.0%) | 103/429 (24.0%) | 694/695 | 0 | 1 |
| 75 | 169/858 (19.7%) | 115/429 (26.8%) | 689/689 | 0 | 1 |
| 80 | 177/858 (20.6%) | 129/429 (30.1%) | 681/681 | 0 | 1 |
| 85 | 203/858 (23.7%) | 159/429 (37.1%) | 655/655 | 0 | 1 |
| 90 | 286/858 (33.3%) | 244/429 (56.9%) | 572/572 | 0 | 1 |
| 95 | 523/858 (61.0%) | 419/429 (97.7%) | 335/335 | 0 | 1 |

**Limiar recomendado: 80.** Em telefone/valor, toda célula com confiança ≥80 está correta (0 falso confiante) e o único falso confiante do dataset fica abaixo de 50 — ou seja, o limiar 80 tem margem. Custo: ~20,6% das células e ~30% das linhas vão para revisão. O nome **não** se comporta igual: há erros nas faixas 70–89 (8 em 80–89 e 9 em 70–79), então nome não deve ser aceito só pela confiança. Na tabela de nome, `falso confiante` significa **nome errado não vazio** — não existe validação de nome equivalente a `normalizePhone`.

## Estruturas de tabela

| Estrutura | Candidato | Telefone | FC tel. | Valor | FC valor | Linhas fantasma |
|---|---|---|---|---|---|---|
| baseline | A-tesseract-texto | 164/234 (70.1%) | **8** | 160/234 (68.4%) | **11** | 78 |
| baseline | B-tesseract-layout | 156/234 (66.7%) | **1** | 156/234 (66.7%) | 0 | 53 |
| baseline | C-macos-vision | 174/234 (74.4%) | **2** | 170/234 (72.6%) | **6** | 43 |
| baseline | D-llm-visao | 388/390 (99.5%) | **2** | 390/390 (100.0%) | 0 | 0 |
| baseline | E-ocr+llm | 327/390 (83.8%) | **10** | 315/390 (80.8%) | **11** | 3 |
| baseline | F*-gate-ablation | 388/390 (99.5%) | **2** | 390/390 (100.0%) | 0 | 0 |
| baseline | G-paddleocr | 179/234 (76.5%) | **3** | 181/234 (77.4%) | **1** | 43 |
| grade | A-tesseract-texto | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| grade | B-tesseract-layout | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 0 |
| grade | C-macos-vision | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| grade | D-llm-visao | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| grade | E-ocr+llm | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| grade | F*-gate-ablation | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| grade | G-paddleocr | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| sem-grade | A-tesseract-texto | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| sem-grade | B-tesseract-layout | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 0 |
| sem-grade | C-macos-vision | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| sem-grade | D-llm-visao | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| sem-grade | E-ocr+llm | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| sem-grade | F*-gate-ablation | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| sem-grade | G-paddleocr | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| total | A-tesseract-texto | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 12 |
| total | B-tesseract-layout | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| total | C-macos-vision | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 12 |
| total | D-llm-visao | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| total | E-ocr+llm | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| total | F*-gate-ablation | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| total | G-paddleocr | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 12 |
| acentos | A-tesseract-texto | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| acentos | B-tesseract-layout | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 0 |
| acentos | C-macos-vision | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| acentos | D-llm-visao | 76/78 (97.4%) | **2** | 78/78 (100.0%) | 0 | 0 |
| acentos | E-ocr+llm | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| acentos | F*-gate-ablation | 76/78 (97.4%) | **2** | 78/78 (100.0%) | 0 | 0 |
| acentos | G-paddleocr | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 6 |
| mascara | A-tesseract-texto | 7/39 (17.9%) | 0 | 7/39 (17.9%) | **18** | 8 |
| mascara | B-tesseract-layout | 39/39 (100.0%) | 0 | 39/39 (100.0%) | 0 | 0 |
| mascara | C-macos-vision | 33/39 (84.6%) | 0 | 39/39 (100.0%) | 0 | 6 |
| mascara | D-llm-visao | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| mascara | E-ocr+llm | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| mascara | F*-gate-ablation | 78/78 (100.0%) | 0 | 78/78 (100.0%) | 0 | 0 |
| mascara | G-paddleocr | 33/39 (84.6%) | 0 | 39/39 (100.0%) | 0 | 6 |

Nos candidatos de LLM os totais de célula são 2× (REPEAT=2); os percentuais já normalizam isso. Linha fantasma é a linha extraída que não existe no ground truth — no caso da linha TOTAL, é o risco de importar o total como se fosse um cliente. Na importação real ela cai na validação de telefone (sem telefone, a linha é recusada), mas o dado aparece como erro na prévia.

## Achados

- **Layout decide mais que o motor.** A e B usam o mesmo Tesseract; acima do piso, o B acerta 351/351 (100.0%) de telefone e 351/351 (100.0%) de valor, contra 319/351 (90.9%) e 319/351 (90.9%) do A. O A ainda cria **18 falsos confiáveis de valor** nesse regime.
- **B acima do piso é um filtro seguro, não extração completa.** Telefone e valor ficam em 351/351 (100.0%) e 351/351 (100.0%), com 0 linha(s) falso(s)-confiável(is); mas o nome acerta 320/351 (91.2%) e sobram 31/351 linhas (8.8%) para conferência. Ou seja: serve para **decidir o que importar com segurança**, não para dispensar revisão.
- **Vision do macOS é teto, não opção.** Acima do piso acerta 335/351 (95.4%) de telefone, mas roda só no macOS — não entra no container Linux da API.
- **LLM de visão acerta quase tudo e concentra o risco no que sobra.** 700/702 (99.7%) de telefone, 702/702 (100.0%) de valor e 702/702 (100.0%) de nome, com apenas 1 linha(s) para revisar — mas o que sobra é **falso confiante** (1 por execução), isto é, exatamente o que passa pela validação.
- **OCR → LLM não paga o custo.** Acima do piso o E acerta 702/702 (100.0%) de telefone e 702/702 (100.0%) de valor (igual ao B em acerto de contato), mas custa 9.2 s/imagem, depende de rede e deixa 31 linhas para revisar. No regime ruim ele é o que mais produz número plausível e errado.
- **O gate não captura erro plausível — medido, não suposto.** Aplicado às mesmas extrações do D, o gate descartou **0** linha(s) e manteve os **1** falsos confiáveis: eles normalizam e passariam pela validação.
- **PaddleOCR (G) vs B — critério central é falso confiante, não acerto médio.** Dataset bruto (1 execução, 858 células de telefone+valor): G 368/429 (85.8%) de telefone (FC 3) e 376/429 (87.6%) de valor (FC 1), 4 falso(s) confiante(s) de 858; B 351/429 (81.8%) de telefone (FC 1) e 351/429 (81.8%) de valor (FC 0), 1 falso(s) confiante(s) de 858. Acima do piso: G 339/351 (96.6%) tel / 345/351 (98.3%) val (FC 0) contra B 351/351 (100.0%) tel / 351/351 (100.0%) val (FC 0). O G lê melhor o **nome** (368/429 (85.8%) vs 332/429 (77.4%) bruto), mas o B lê melhor telefone/valor acima do piso (B: 0 FC de tel+valor; G: 0 FC). Tempo (medido em lote, 66 imagens): G carrega o modelo ~2,1 s + infere ~5,0 s/imagem; B carrega o worker ~0,5 s + infere ~0,34 s/imagem. No run.ts cada imagem reabre um processo Python, daí G ~7,9 s/imagem vs B ~0,35 s/imagem. Não se declara que o G "é melhor": supera B em nome e acerto bruto de telefone/valor, mas perde no falso confiante e no tempo.
- **Máscara de telefone quebra regex, não layout.** Na estrutura com máscara variada, o A acerta 7/39 (17.9%) e o B 39/39 (100.0%).
- **Grade e ausência de grade não mudaram o resultado local** (as duas estruturas ficaram em 100% de telefone para A e B); a dificuldade veio da máscara e da resolução.
- **Ruído extremo falha, não corrompe:** o OCR local devolve texto ilegível (recusado pela validação) e o LLM devolve resposta vazia. Os erros perigosos estão nas degradações recuperáveis.

## Matriz ponderada (dois regimes lado a lado)

Pesos: **falso confiante 30% · acerto 25% · custo/CPU 20% · simplicidade 15% · licença 10%**. As duas tabelas usam a mesma fórmula e as mesmas notas de custo/simplicidade/licença; muda só o conjunto de imagens.

Fórmulas (notas de 0 a 10):

- `FC = clamp(10 − 500 × taxaFC, 0, 10)` — 0% → 10; 1% → 5; ≥2% → 0.
- `Acerto = 10 × acerto`.
- `Custo = clamp(10 × (1 − segundos/20), 0, 10)` — 0,3 s → 9,83; 8,7 s → 5,67; 9,2 s → 5,38.
- `Nota final = 0,30×FC + 0,25×Acerto + 0,20×Custo + 0,15×Simplicidade + 0,10×Licença`.

### Regime bruto — todas as 66 imagens, inclusive baixa resolução e ruído

| Candidato | Taxa FC | FC | Acerto | Acerto nota | Custo | Simpl. | Licença | Conta | Final |
|---|---|---|---|---|---|---|---|---|---|
| A-tesseract-texto | 4.31% | 0.00 | 76.3% | 7.63 | 9.82 | 9 | 10 | 0,30×0.00 + 0,25×7.63 + 0,20×9.82 + 0,15×9 + 0,10×10 | **6.22** |
| B-tesseract-layout | 0.12% | 9.42 | 80.3% | 8.03 | 9.83 | 8 | 10 | 0,30×9.42 + 0,25×8.03 + 0,20×9.83 + 0,15×8 + 0,10×10 | **9.00** |
| C-macos-vision | 0.93% | 5.34 | 84.7% | 8.47 | 9.62 | 4 | 3 | 0,30×5.34 + 0,25×8.47 + 0,20×9.62 + 0,15×4 + 0,10×3 | **6.54** |
| D-llm-visao | 0.26% | 8.72 | 99.8% | 9.98 | 5.67 | 5 | 4 | 0,30×8.72 + 0,25×9.98 + 0,20×5.67 + 0,15×5 + 0,10×4 | **7.39** |
| E-ocr+llm | 1.35% | 3.27 | 88.9% | 8.89 | 5.38 | 4 | 4 | 0,30×3.27 + 0,25×8.89 + 0,20×5.38 + 0,15×4 + 0,10×4 | **5.28** |
| F*-gate-ablation | 0.26% | 8.72 | 99.8% | 9.98 | 5.67 | 4 | 4 | 0,30×8.72 + 0,25×9.98 + 0,20×5.67 + 0,15×4 + 0,10×4 | **7.24** |
| G-paddleocr | 0.47% | 7.67 | 86.4% | 8.64 | 6.07 | 5 | 10 | 0,30×7.67 + 0,25×8.64 + 0,20×6.07 + 0,15×5 + 0,10×10 | **7.43** |

### Regime aceitável — acima do piso (exclui baixa resolução e ruído)

| Candidato | Taxa FC | FC | Acerto | Acerto nota | Custo | Simpl. | Licença | Conta | Final |
|---|---|---|---|---|---|---|---|---|---|
| A-tesseract-texto | 2.56% | 0.00 | 91.0% | 9.10 | 9.82 | 9 | 10 | 0,30×0.00 + 0,25×9.10 + 0,20×9.82 + 0,15×9 + 0,10×10 | **6.59** |
| B-tesseract-layout | 0.00% | 10.00 | 97.1% | 9.71 | 9.83 | 8 | 10 | 0,30×10.00 + 0,25×9.71 + 0,20×9.83 + 0,15×8 + 0,10×10 | **9.59** |
| C-macos-vision | 0.28% | 8.58 | 96.2% | 9.62 | 9.62 | 4 | 3 | 0,30×8.58 + 0,25×9.62 + 0,20×9.62 + 0,15×4 + 0,10×3 | **7.80** |
| D-llm-visao | 0.14% | 9.29 | 99.9% | 9.99 | 5.67 | 5 | 4 | 0,30×9.29 + 0,25×9.99 + 0,20×5.67 + 0,15×5 + 0,10×4 | **7.57** |
| E-ocr+llm | 0.00% | 10.00 | 97.1% | 9.71 | 5.38 | 4 | 4 | 0,30×10.00 + 0,25×9.71 + 0,20×5.38 + 0,15×4 + 0,10×4 | **7.50** |
| F*-gate-ablation | 0.14% | 9.29 | 99.9% | 9.99 | 5.67 | 4 | 4 | 0,30×9.29 + 0,25×9.99 + 0,20×5.67 + 0,15×4 + 0,10×4 | **7.42** |
| G-paddleocr | 0.00% | 10.00 | 97.4% | 9.74 | 6.07 | 5 | 10 | 0,30×10.00 + 0,25×9.74 + 0,20×6.07 + 0,15×5 + 0,10×10 | **8.40** |

**Por que B = 9.59 não é nota de produção.** É uma nota **relativa**, calculada (i) só em prints sintéticos, (ii) no regime em que as imagens ruins já foram descartadas. No regime bruto o mesmo B cai para 9.00 — e mesmo essa nota é generosa, porque 30 das 66 imagens são estruturas fáceis de print. A nota não mede: foto real de celular, manuscrito, PDF escaneado, o custo de revisar 100% dos nomes, a auditoria de licença, nem o fato de B não extrair nome com segurança (91,2%). Ela serve para **ranquear candidatos**, não para autorizar importação. O D, por exemplo, tem nota menor (7.57) por causa de rede/custo, mas acerta mais — o ranking não é uma medida de qualidade absoluta.

Justificativas de simplicidade e licença:

| Candidato | Simplicidade | Licença |
|---|---|---|
| A-tesseract-texto | 9 — 1 biblioteca, 1 arquivo, sem cluster de colunas. | 10 — tesseract.js: Apache-2.0. |
| B-tesseract-layout | 8 — 1 biblioteca + ~80 linhas de cluster de colunas. | 10 — tesseract.js: Apache-2.0. |
| C-macos-vision | 4 — runtime externo (Python/pyobjc) e só macOS. | 3 — framework Apple proprietário, só macOS. |
| D-llm-visao | 5 — API + prompt + parse + retry. | 4 — API de modelo; licença do provedor não auditada. |
| E-ocr+llm | 4 — OCR local + API + parse + retry (duas etapas). | 4 — API de modelo; licença do provedor não auditada. |
| F*-gate-ablation | 4 — D + gate (mais código, mesmo runtime de rede). | 4 — API de modelo; licença do provedor não auditada. |
| G-paddleocr | 5 — PaddleOCR local em CPU + ponte Python; modelo carregado uma vez por processo, sem custo por imagem, mas runtime Python no container. | 10 — PaddleOCR e PaddlePaddle: Apache-2.0, processamento local, sem envio de imagem a terceiros. |

## Critérios aprovados para a Fase 2 (2026-11-02)

Critérios aprovados pelo dono, com ajustes. A coluna "medição no spike" é **sintética**; ela não seleciona candidato. A seleção final depende do benchmark com imagens reais.

| # | Critério aprovado | Medição no spike (sintético) | Situação |
|---|---|---|---|
| C1 | Falso confiante ≤ 0,5% em telefone+valor; **alvo real: 0 acima da confiança 80** | A: 2.6% · B: 0.0% · C: 0.3% · D: 0.1% · E: 0.0% · F*: 0.1%. B: 0 FC com confiança ≥80 (calibração) | aprovado |
| C2 | Acerto ≥ 99% em telefone e valor, **medido em imagens reais** | A: 90.9% tel / 90.9% valor · B: 100.0% tel / 100.0% valor · C: 95.4% tel / 97.2% valor · D: 99.7% tel / 100.0% valor · E: 100.0% tel / 100.0% valor · F*: 99.7% tel / 100.0% valor | pendente de imagem real |
| C3 | **Removido** o limite de revisão ≤10%; substituído por **tempo de conferência por planilha**, medido com o dono | — | pendente de medição com o dono |
| C4 | ≤ 2 s/imagem no fluxo **síncrono**; até 30 s na **fila** do bot | A 0,4 s · B 0,3 s · C 0,8 s (não deployável) · D 8,7 s · E 9,2 s · F* 8,7 s | A/B aprovados no síncrono; D/E/F* só na fila |
| C5 | Só licença permissiva (Apache/MIT/BSD) e **sem envio de imagem a terceiros nesta entrega** | A/B: Apache-2.0, local · C: Apple proprietário · D/E/F*: enviam imagem a terceiro | aprovado — **A/B elegíveis; C/D/E/F* fora nesta entrega** |
| C6 | Piso de resolução **obrigatório, definido sobre imagens reais** | piso sintético: 693 px da tabela (telefone) e 924 px (valor) | pendente de imagem real |

Leitura dos critérios aprovados:

- **C1:** B mede 0% de falso confiante acima da confiança 80; o único FC do dataset está abaixo de 50. D/E/F* não têm confiança calibrada, então o alvo complementar não se aplica a eles.
- **C2:** os percentuais da tabela são sintéticos. A aprovação de 99% só vale depois de repetir a medição nas 5–10 imagens reais.
- **C3:** o spike continua medindo revisão por linha como diagnóstico, mas **não é mais critério**. O substituto (tempo de conferência por planilha) não é simulável: precisa de sessão de medição com o dono.
- **C4:** A/B passam no síncrono; D/E/F* só passariam na fila; C não entra porque não é deployável.
- **C5:** nesta entrega, só **A e B** são elegíveis — Apache-2.0 e processamento local. C é framework proprietário da Apple; D/E/F* enviam a imagem a um provedor externo, o que está fora do escopo aprovado.
- **C6:** obrigatório e ainda **não satisfeito**: o piso sintético (693/924 px) é referência de método, não valor de produção; o piso real será definido com as imagens reais.

**Consequência:** B é o único candidato que atende C1, C2 (sintético), C4 (síncrono) e C5. C3 (novo) e C6 dependem do dono e das imagens reais. **Nenhuma seleção é final até o benchmark real.**

## Recomendação (revisada)

1. **B não é extração suficiente — é filtro seguro.** Na linha de base bruta (incluindo as imagens abaixo do piso) ele acerta 156/234 (66.7%) de telefone e 156/234 (66.7%) de valor — por isso a leitura anterior de 66,7% estava certa nesse regime. Ele só vira 100% de telefone/valor **depois** de recusar imagem abaixo do piso. O que ele entrega é: nenhum telefone/valor errado passando (0 falso confiante acima do piso) e telefone/valor já preenchidos; se todo nome for revisado, **100% das linhas são tocadas** (ver seção "Revisão real").
2. **O trabalho de revisão que cada um deixa para o dono** (acima do piso, por 100 linhas): A ≈ 17.4 linhas de revisão (18 silenciosa(s)); B ≈ 8.8 linhas de revisão (0 silenciosa(s)); C ≈ 5.7 linhas de revisão (2 silenciosa(s)); D ≈ 0.3 linhas de revisão (1 silenciosa(s)); E ≈ 8.8 linhas de revisão (0 silenciosa(s)); F* ≈ 0.3 linhas de revisão (1 silenciosa(s)); G ≈ 4.3 linhas de revisão (0 silenciosa(s)). O 8,8/100 do B conta só linhas com erro medido; com **todo nome em revisão vira 100/100**. O D reduz a revisão a 0,3/100, mas todas as linhas que sobram são erro silencioso; o E deixa ~8,8/100 e ainda cobra rede.
3. **Pipeline proposto para a Fase 2:** imagem → medir a região da tabela → **recusar abaixo de ~924 px dessa região para valor (~693 px só para telefone)** → B (Tesseract + layout) → gate determinístico → marcar para revisão toda célula de telefone/valor com confiança < 80 e **todo nome** (a confiança do nome não é confiável) → prévia obrigatória antes de importar.
4. **Não usar OCR → LLM (E)**: não supera o B em telefone/valor acima do piso, custa ~10× mais, gera mais valor plausível e errado no regime ruim e **C5 o exclui nesta entrega** (envia imagem a terceiro).
5. **LLM de visão (D) fica fora desta entrega por C5** (envio de imagem a terceiro). Se um dia for avaliado, que seja como leitura assistida, com revisão humana — o erro residual dele é justamente o que a validação não pega.

**Conclusão:** spike **encerrado**. Critérios aprovados em 2026-11-02 (C3 removido; C4 separado em síncrono/fila; C5 restrito a licença permissiva e processamento local; C6 obrigatório sobre imagem real). Nenhum candidato está selecionado e a **Fase 2 não foi iniciada**. O próximo passo é o benchmark com 5 a 10 imagens reais anonimizadas; sem esses dados, o spike não decide implementação.

## Limitações

- Nos cenários `ruido`, os candidatos de LLM não têm número: o provedor devolveu resposta vazia em todas as tentativas (evidência em `resultados/run-llm.log`).
- LLM é não determinístico: números são médias de 2 execuções por imagem e ainda têm variância.
- `C-macos-vision` depende do framework Vision (via `pyobjc`); **não é deployável** no container Linux/Docker.
- O dataset é sintético: layout, fonte e cores fixos. Números absolutos não transferem para fotos reais; a comparação relativa e o conceito de falso confiante transferem. **Validado só em prints sintéticos (não cobre manuscrito, foto de celular nem PDF escaneado).**
- `H` (PP-Structure / TableRecognition do PaddleOCR) **não foi implementado**: é um pipeline separado e pesado de leitura estrutural de tabela (não apenas OCR de células), exigiria download de modelo dedicado e, em CPU, facilmente excederia o orçamento de ~15 s/imagem. Fica para avaliação posterior apenas se justificado por imagem real.
- A confiança do PaddleOCR (G) não foi calibrada; não há limiar de revisão definido para ela.
- O crédito do NVIDIA NIM usado no teste não foi tarifado: **o custo por imagem não foi medido**.
- A calibração cobre só o Tesseract/B. A confiança do LLM não é comparável à do OCR e não foi calibrada.

## Como reproduzir

```bash
cd backend/spikes/ocr-benchmark
npm install
npm run dataset            # 66 imagens + ground-truth.json
npm run bench              # locais + LLM + ablação
npm run calibration        # calibracao.json
npm run resolution         # resolucao.json
npm run report             # regenera este REPORT.md
npm run typecheck

# candidato C (macOS Vision) — opcional, só em macOS:
python3 -m venv /tmp/ocrvenv
/tmp/ocrvenv/bin/pip install pillow pyobjc-framework-Vision pyobjc-framework-Quartz
export SPICE_PYTHON=/tmp/ocrvenv/bin/python3
```

Variáveis: `REPEAT`, `CONCURRENCY`, `LIMIT`, `SKIP_DEGRADATIONS`, `RESET_CACHE`, `SPICE_PYTHON`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`.
