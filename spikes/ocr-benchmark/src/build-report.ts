/**
 * Gera o REPORT.md a partir de:
 *   resultados/resultados*.json   — execuções dos candidatos
 *   resultados/calibracao.json    — confiança por célula (Tesseract/b)
 *   resultados/resolucao.json     — varredura 100/75/50/35%
 *   dataset/ground-truth.json     — estruturas e cobertura
 *
 * Uso: npx tsx src/build-report.ts
 */
import fs from "node:fs";
import path from "node:path";
import type { CandidateReport, ColumnMetrics } from "./evaluate";

const ROOT = path.resolve(__dirname, "..");
const RESULTADOS = path.join(ROOT, "resultados");
const SAIDA = path.join(ROOT, "REPORT.md");
const DATASET = path.join(ROOT, "dataset");

interface Arquivo {
  executadoEm: string;
  imagens: number;
  repeticoes?: number;
  degradacoesPuladas?: string[];
  candidatos: CandidateReport[];
}

interface GroundTruthRow {
  nome: string;
  telefone: string;
  valor: string;
}

interface TruthFile {
  casos: Array<{ id: string; degradation: string; estrutura: string; rows: GroundTruthRow[] }>;
  naoCoberto?: string[];
}

interface Calibracao {
  totalFalsoConfiante: number;
  porFaixa: Array<{
    coluna: string;
    faixas: Array<{
      faixa: string;
      celulas: number;
      corretas: number;
      erradas: number;
      ausentes: number;
      falsoConfiante: number;
    }>;
  }>;
  limiares: Array<{
    limiar: number;
    celulas: number;
    auto: number;
    revisao: number;
    revisaoPct: number;
    autoCorretas: number;
    autoErradas: number;
    autoFalsoConfiante: number;
    falsoEvitado: number;
    linhas: number;
    linhasRevisao: number;
    linhasRevisaoPct: number;
  }>;
}

interface Resolucao {
  escalas: Array<{
    escala: number;
    candidatos: Array<{
      candidato: string;
      larguraPx: number;
      larguraTabelaPx?: number;
      colunas: Record<"nome" | "telefone" | "valor", { total: number; corretas: number; ausentes: number; falsoConfiante: number }>;
    }>;
  }>;
  menorEscalaQueFunciona: number | null;
}

const pct = (parte: number, total: number): string =>
  total === 0 ? "—" : `${((100 * parte) / total).toFixed(1)}%`;

const exatos = (m: ColumnMetrics): string => `${m.corretas}/${m.total} (${pct(m.corretas, m.total)})`;

const falso = (m: ColumnMetrics): string => (m.falsoConfiante === 0 ? "0" : `**${m.falsoConfiante}**`);

/** Média por execução das métricas de linha (o LLM roda REPEAT vezes). */
const numLinha = (valor: number): string => (Number.isInteger(valor) ? String(valor) : valor.toFixed(1));

const mediaLinha = (valor: number, c: CandidateReport): string =>
  numLinha(valor / Math.max(1, Math.round(c.execucoesPorImagem)));

/** Degradações que o pipeline deve recusar antes de extrair (abaixo do piso). */
const FORA_DO_PISO = new Set(["baixa-resolucao", "ruido"]);

function carregarCandidatos(): { arquivos: Arquivo[]; candidatos: CandidateReport[]; imagens: number } {
  const arquivos = fs
    .readdirSync(RESULTADOS)
    .filter((f) => f.startsWith("resultados") && f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RESULTADOS, f), "utf8")) as Arquivo);

  if (arquivos.length === 0) throw new Error("nenhum resultados*.json em resultados/");

  const porId = new Map<string, CandidateReport>();
  for (const arquivo of arquivos) {
    for (const c of arquivo.candidatos) {
      // O F real é o mesmo código do F*; a ablação é a comparação justa.
      if (c.id.startsWith("F-")) continue;
      const atual = porId.get(c.id);
      if (!atual || c.execucoesPorImagem >= atual.execucoesPorImagem) porId.set(c.id, c);
    }
  }

  const ordem = (id: string) => "ABCDEF".indexOf(id[0]);
  const candidatos = [...porId.values()].sort((a, b) => ordem(a.id) - ordem(b.id));
  const imagens = Math.max(...arquivos.map((a) => a.imagens));
  return { arquivos, candidatos, imagens };
}

function agrega(
  candidato: CandidateReport,
  filtro: (degradacao: string) => boolean
): {
  colunas: Record<"nome" | "telefone" | "valor", ColumnMetrics>;
  linhas: { total: number; completas: number; revisao: number; falsoConfiante: number; fantasma: number };
} {
  const colunas = {
    nome: { total: 0, corretas: 0, erradas: 0, ausentes: 0, falsoConfiante: 0, erroDetectavel: 0 },
    telefone: { total: 0, corretas: 0, erradas: 0, ausentes: 0, falsoConfiante: 0, erroDetectavel: 0 },
    valor: { total: 0, corretas: 0, erradas: 0, ausentes: 0, falsoConfiante: 0, erroDetectavel: 0 },
  };
  const linhas = { total: 0, completas: 0, revisao: 0, falsoConfiante: 0, fantasma: 0 };
  const reps = Math.max(1, Math.round(candidato.execucoesPorImagem));

  for (const img of candidato.images.filter((i) => filtro(i.degradation))) {
    for (const chave of ["nome", "telefone", "valor"] as const) {
      const d = colunas[chave];
      const s = img.colunas[chave];
      d.total += s.total;
      d.corretas += s.corretas;
      d.erradas += s.erradas;
      d.ausentes += s.ausentes;
      d.falsoConfiante += s.falsoConfiante;
      d.erroDetectavel += s.erroDetectavel;
    }
    linhas.total += img.totalLinhasTruth;
    linhas.completas += img.linhasCompletas / reps;
    linhas.revisao += img.linhasRevisao / reps;
    linhas.falsoConfiante += img.linhasFalsoConfiante / reps;
    linhas.fantasma += img.linhasFantasma / reps;
  }

  return { colunas, linhas };
}

const forasDoPiso = (degradacao: string): boolean => FORA_DO_PISO.has(degradacao);
const dentroDoPiso = (degradacao: string): boolean => !FORA_DO_PISO.has(degradacao);

function porId(candidatos: CandidateReport[], prefixo: string): CandidateReport | undefined {
  return candidatos.find((c) => c.id.startsWith(prefixo));
}

// --- matriz ponderada -------------------------------------------------------

const PESOS = { falso: 0.3, acerto: 0.25, custo: 0.2, simplicidade: 0.15, licenca: 0.1 };

const SIMPLICIDADE: Record<string, { nota: number; motivo: string }> = {
  "A-": { nota: 9, motivo: "1 biblioteca, 1 arquivo, sem cluster de colunas." },
  "B-": { nota: 8, motivo: "1 biblioteca + ~80 linhas de cluster de colunas." },
  "C-": { nota: 4, motivo: "runtime externo (Python/pyobjc) e só macOS." },
  "D-": { nota: 5, motivo: "API + prompt + parse + retry." },
  "E-": { nota: 4, motivo: "OCR local + API + parse + retry (duas etapas)." },
  "F*": { nota: 4, motivo: "D + gate (mais código, mesmo runtime de rede)." },
};

const LICENCA: Record<string, { nota: number; motivo: string }> = {
  "A-": { nota: 10, motivo: "tesseract.js: Apache-2.0." },
  "B-": { nota: 10, motivo: "tesseract.js: Apache-2.0." },
  "C-": { nota: 3, motivo: "framework Apple proprietário, só macOS." },
  "D-": { nota: 4, motivo: "API de modelo; licença do provedor não auditada." },
  "E-": { nota: 4, motivo: "API de modelo; licença do provedor não auditada." },
  "F*": { nota: 4, motivo: "API de modelo; licença do provedor não auditada." },
};

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

function chaveNota<T extends Record<string, unknown>>(mapa: T, id: string): T[string] {
  const chave = Object.keys(mapa).find((k) => id.startsWith(k));
  if (!chave) throw new Error(`nota ausente para ${id}`);
  return mapa[chave] as T[string];
}

function main(): void {
  const { arquivos, candidatos, imagens } = carregarCandidatos();
  const truth = JSON.parse(fs.readFileSync(path.join(DATASET, "ground-truth.json"), "utf8")) as TruthFile;
  const calibracao = JSON.parse(fs.readFileSync(path.join(RESULTADOS, "calibracao.json"), "utf8")) as Calibracao;
  const resolucao = JSON.parse(fs.readFileSync(path.join(RESULTADOS, "resolucao.json"), "utf8")) as Resolucao;
  const puladas = [...new Set(arquivos.flatMap((a) => a.degradacoesPuladas ?? []))];
  const reps = Math.max(...candidatos.map((c) => c.execucoesPorImagem));
  const estruturas = [...new Set(truth.casos.map((c) => c.estrutura))];

  const linhas: string[] = [];
  const add = (...texto: string[]): void => {
    linhas.push(...texto);
  };

  add("# Spike: OCR de planilhas enviadas por foto/print");
  add("");
  add(
    "> **Validado só em prints sintéticos de tabela simples. Não validado: manuscrito, foto de celular, " +
      "PDF escaneado.**"
  );
  add("");
  add(
    `Execução: ${arquivos.sort((a, b) => a.executadoEm.localeCompare(b.executadoEm)).at(-1)!.executadoEm} · ` +
      `**${imagens} imagens** · determinísticos com 1 execução; LLM com ${reps} execuções por imagem` +
      (puladas.length ? ` (exceto \`${puladas.join(", ")}\`).` : ".")
  );
  add("");
  add(
    "Este spike responde **uma pergunta**: quando o cliente manda a planilha por foto em vez de arquivo, " +
      "qual abordagem erra menos **de forma silenciosa**? A métrica central é o **falso confiante**: a célula " +
      "sai errada da imagem e ainda **passa** pela validação de produção (`normalizePhone`/`normalizeMoney`), " +
      "então entra no CRM como se estivesse certa."
  );
  add("");
  add(
    "**Status:** spike **encerrado em 2026-11-02**. Critérios aprovados com ajustes (C3 removido). Próximo " +
      "passo: benchmark com 5–10 imagens reais anonimizadas. **Fase 2 não iniciada.**"
  );
  add("");
  add("## Portão da Fase 2");
  add("");
  add(
    "**Este spike não decide nada sozinho.** A Fase 2 só começa quando **5 a 10 imagens reais anonimizadas** " +
      "(enviadas por clientes, com consentimento) passarem por **este mesmo benchmark**, com ground truth " +
      "anotado à mão para elas e as mesmas métricas. Se os números reais não reproduzirem o comportamento aqui " +
      "medido, o spike é reavaliado antes de qualquer implementação. Dataset sintético serve para definir o " +
      "método e expor riscos; não substitui imagem real."
  );
  add("");

  // ------------------------------------------------------------------ dataset
  add("## Dataset");
  add("");
  add(
    `- **${imagens} imagens sintéticas** com seed fixa (reprodutível): ` +
      `${truth.casos.filter((c) => c.estrutura === "baseline").length} de degradação ` +
      `(print, JPEG de WhatsApp, foto escurecida, baixa resolução, torta, ruído extremo) e ` +
      `${truth.casos.filter((c) => c.estrutura !== "baseline").length} de estrutura ` +
      `(com grade, sem grade, linha TOTAL, nomes com acento, telefone com máscara).`
  );
  add(
    `- **${truth.casos.reduce((s, c) => s + c.rows.length, 0)} linhas** de ground truth; telefone e valor ` +
      "são comparados **depois** dos normalizadores reais do backend; nome é comparação textual sem " +
      "acento/caixa/espaço."
  );
  add(
    "- Alinhamento linha a linha por pontuação (nome + telefone + valor). Célula: correta, ausente ou errada; " +
      "das erradas separamos **falso confiante** (normaliza) de **erro detectável** (não normaliza)."
  );
  if (truth.naoCoberto?.length) {
    add(`- **Não coberto por este dataset:** ${truth.naoCoberto.join("; ")}.`);
  }
  add("");

  // ----------------------------------------------------------- matriz bruta
  add("## Matriz de decisão (medida)");
  add("");
  add(
    "`Revisão` = linhas com pelo menos uma célula errada/ausente (o que o dono teria de conferir); " +
      "`linhas FC` = linhas com telefone/valor errado que ainda normaliza. Percentuais de linha usam o " +
      "total de linhas avaliadas por candidato."
  );
  add("");
  add(
    "| Candidato | Telefone (exatos) | Falso confiante (tel.) | Valor (exatos) | Falso confiante (valor) | " +
      "Nome | Revisão (linhas) | Linhas FC | Fantasma | Falhas | Tempo/imagem | Rede | Deployável |"
  );
  add("|---|---|---|---|---|---|---|---|---|---|---|---|---|");

  for (const c of candidatos) {
    const deployavel = c.id.startsWith("C-") ? "**não** (macOS)" : "sim";
    add(
      `| ${c.id} | ${exatos(c.totais.telefone)} | ${falso(c.totais.telefone)} | ${exatos(c.totais.valor)} | ` +
        `${falso(c.totais.valor)} | ${exatos(c.totais.nome)} | ` +
        `${mediaLinha(c.linhasRevisao, c)}/${c.linhasTotal} (${pct(c.linhasRevisao / Math.max(1, Math.round(c.execucoesPorImagem)), c.linhasTotal)}) | ` +
        `${mediaLinha(c.linhasFalsoConfiante, c)} | ${mediaLinha(c.linhasFantasma, c)} | ${c.execucoesComErro ?? 0}/${c.execucoesTotais ?? "?"} | ` +
        `${(c.tempoMedioMs / 1000).toFixed(1)} s | ${c.requiresNetwork ? "sim" : "não"} | ${deployavel} |`
    );
  }

  add("");
  add(
    "> `F*` é uma **ablação**: pega as mesmas extrações do D e aplica o gate de produção, sem chamar o " +
      "modelo de novo. É a comparação D × D+gate sem variância do LLM."
  );
  add("");

  // -------------------------------------------------- qualidade aceitável
  add("## Regime de qualidade aceitável (acima do piso)");
  add("");
  add(
    "As linhas abaixo excluem `baixa-resolucao` e `ruido` — as duas degradações que o pipeline deve **recusar** " +
      "antes de tentar (ver piso de resolução). É neste regime que a extração aconteceria de verdade."
  );
  add("");
  add("| Candidato | Telefone | FC tel. | Valor | FC valor | Nome | Acerto 3 colunas | Revisão (linhas) | Linhas FC |");
  add("|---|---|---|---|---|---|---|---|---|");
  for (const c of candidatos) {
    const a = agrega(c, dentroDoPiso);
    const total3 = a.colunas.nome.total + a.colunas.telefone.total + a.colunas.valor.total;
    const corretas3 = a.colunas.nome.corretas + a.colunas.telefone.corretas + a.colunas.valor.corretas;
    add(
      `| ${c.id} | ${exatos(a.colunas.telefone)} | ${falso(a.colunas.telefone)} | ${exatos(a.colunas.valor)} | ` +
        `${falso(a.colunas.valor)} | ${exatos(a.colunas.nome)} | ${pct(corretas3, total3)} | ` +
        `${numLinha(a.linhas.revisao)}/${a.linhas.total} (${pct(a.linhas.revisao, a.linhas.total)}) | ${numLinha(a.linhas.falsoConfiante)} |`
    );
  }
  add("");
  add("### Revisão real quando todo nome vai para revisão");
  add("");
  const candB = candidatos.find((c) => c.id.startsWith("B-"));
  const revAceitavel = candB ? agrega(candB, dentroDoPiso) : undefined;
  const revBruto = candB ? agrega(candB, () => true) : undefined;
  add(
    "A confiança do nome não é calibrável (há erros em 70–100), então a regra conservadora é **revisar todo " +
      "nome**. Como toda linha tem nome, o número de linhas tocadas deixa de ser 8,8% e passa a ser 100%:"
  );
  add("");
  add("| Cenário (B) | Linhas revisadas | % |");
  add("|---|---|---|");
  add(
    `| Só células com erro/ausência (acima do piso) | ${revAceitavel ? numLinha(revAceitavel.linhas.revisao) : "?"}/` +
      `${revAceitavel?.linhas.total ?? "?"} | ${revAceitavel ? pct(revAceitavel.linhas.revisao, revAceitavel.linhas.total) : "?"} |`
  );
  add(
    `| Todo nome em revisão (acima do piso) | ${revAceitavel?.linhas.total ?? "?"}/${revAceitavel?.linhas.total ?? "?"} | 100,0% |`
  );
  add(
    `| Todo nome em revisão (dataset bruto) | ${revBruto?.linhas.total ?? "?"}/${revBruto?.linhas.total ?? "?"} | 100,0% |`
  );
  add("");
  add(
    "Na prática: **≈6,5 linhas por planilha, todas conferidas**. O B elimina a digitação de telefone/valor " +
      "(acerta 100% acima do piso), mas **não reduz o número de linhas que o dono abre** — reduz o esforço " +
      "dentro de cada linha. Se a Fase 2 prometer redução de conferência, ela não se sustenta com B; a promessa " +
      "correta é redução de digitação."
  );
  add("");

  // ------------------------------------------------------------- resolução
  add("## Varredura de resolução (A e B)");
  add("");
  add(
    "As 6 imagens de print limpo foram reduzidas para 100%, 75%, 50% e 35% da largura original; a coluna " +
      "\"largura da tabela\" é a largura resultante da região da tabela (imagem menos as margens). Critério de " +
      "\"funciona\": **telefone e valor ≥90% exatos e zero falso confiante** em telefone/valor."
  );
  add("");
  add("| Escala | Largura da tabela | Candidato | Telefone | FC tel. | Valor | FC valor |");
  add("|---|---|---|---|---|---|---|");
  for (const e of resolucao.escalas) {
    for (const c of e.candidatos) {
      add(
        `| ${e.escala}% | ${c.larguraTabelaPx ?? c.larguraPx} px | ${c.candidato} | ${c.colunas.telefone.corretas}/${c.colunas.telefone.total} ` +
          `(${pct(c.colunas.telefone.corretas, c.colunas.telefone.total)}) | ${c.colunas.telefone.falsoConfiante} | ` +
          `${c.colunas.valor.corretas}/${c.colunas.valor.total} (${pct(c.colunas.valor.corretas, c.colunas.valor.total)}) | ` +
          `${c.colunas.valor.falsoConfiante} |`
      );
    }
  }
  add("");
  if (resolucao.menorEscalaQueFunciona !== null) {
    const escalaOk = resolucao.menorEscalaQueFunciona / 100;
    const larguraOk = resolucao.escalas.find((e) => e.escala === resolucao.menorEscalaQueFunciona)?.candidatos[0]?.larguraPx;
    const escalaPiso = resolucao.escalas.find((e) => e.escala === resolucao.menorEscalaQueFunciona);
    const escalaCem = resolucao.escalas.find((e) => e.escala === 100);
    const tabelaPiso = escalaPiso?.candidatos[0]?.larguraTabelaPx ?? larguraOk;
    const tabelaCem = escalaCem?.candidatos[0]?.larguraTabelaPx ?? "?";
    add(
      `**Piso medido: ~${tabelaPiso ?? "?"} px de largura da REGIÃO DA TABELA** (menor escala em que algum ` +
        `candidato passa: ${resolucao.menorEscalaQueFunciona}%). Esse número é a largura da tabela, não da ` +
        "imagem: a 75% a foto tem ~720 px, mas a tabela em si fica em ~693 px por causa das margens. Quem " +
        "sustenta o piso é o **A** (100% de telefone e valor); o **B**, recomendado adiante, mantém telefone em " +
        "100% mas o **valor cai para 82,1%** (32/39) nessa escala e só fica perfeito a 100% " +
        `(~${tabelaCem} px da tabela). A 50% o A começa a **inventar** (9 falsos confiantes de telefone e 11 de ` +
        "valor) e o B passa a devolver ausências. **Isso foi medido só em prints sintéticos e NÃO foi validado " +
        "com foto real** — perspectiva, foco e sombra podem exigir um piso maior. A imagem abaixo do piso deve " +
        "ser recusada com pedido de reenvio."
    );
  } else {
    add("**Nenhuma escala testada passou no critério** — não há piso defensável com este dataset.");
  }
  add("");

  // ------------------------------------------------------------ calibração
  add("## Calibração de confiança (Tesseract, candidato B)");
  add("");
  add(
    "Confiança da célula = **menor confiança de palavra** do Tesseract naquela célula (conservadora). " +
      `Total de falso confiante em telefone/valor no dataset: **${calibracao.totalFalsoConfiante}**.`
  );
  add("");
  add("### Acerto por faixa de confiança");
  add("");
  add("| Coluna | Faixa | Células | Corretas | Erradas | Ausentes | Falso confiante |");
  add("|---|---|---|---|---|---|---|");
  for (const grupo of calibracao.porFaixa) {
    for (const f of grupo.faixas) {
      add(
        `| ${grupo.coluna} | ${f.faixa} | ${f.celulas} | ${f.corretas} | ${f.erradas} | ${f.ausentes} | ${f.falsoConfiante} |`
      );
    }
  }
  add("");
  add("### Efeito do limiar de revisão");
  add("");
  add(
    "Célula com confiança **abaixo** do limiar vai para revisão humana; acima entra automática. " +
      "`FC automático` é o falso confiante que entraria sem revisão."
  );
  add("");
  add("| Limiar | Revisão (células) | Revisão (linhas) | Correção automática | FC automático | FC evitado |");
  add("|---|---|---|---|---|---|");
  for (const l of calibracao.limiares) {
    add(
      `| ${l.limiar} | ${l.revisao}/${l.celulas} (${l.revisaoPct.toFixed(1)}%) | ` +
        `${l.linhasRevisao}/${l.linhas} (${l.linhasRevisaoPct.toFixed(1)}%) | ` +
        `${l.autoCorretas}/${l.auto} | ${l.autoFalsoConfiante} | ${l.falsoEvitado} |`
    );
  }
  add("");
  add(
    "**Limiar recomendado: 80.** Em telefone/valor, toda célula com confiança ≥80 está correta (0 falso " +
      "confiante) e o único falso confiante do dataset fica abaixo de 50 — ou seja, o limiar 80 tem margem. " +
      "Custo: ~20,6% das células e ~30% das linhas vão para revisão. O nome **não** se comporta igual: há erros " +
      "nas faixas 70–89 (8 em 80–89 e 9 em 70–79), então nome não deve ser aceito só pela confiança. Na tabela " +
      "de nome, `falso confiante` significa **nome errado não vazio** — não existe validação de nome equivalente " +
      "a `normalizePhone`."
  );
  add("");

  // ----------------------------------------------------------- estruturas
  add("## Estruturas de tabela");
  add("");
  add("| Estrutura | Candidato | Telefone | FC tel. | Valor | FC valor | Linhas fantasma |");
  add("|---|---|---|---|---|---|---|");
  for (const estrutura of estruturas) {
    for (const c of candidatos) {
      const filtro = (d: string) => d === `estrutura-${estrutura}` || (estrutura === "baseline" && d === "baseline");
      const a = agrega(c, (d) => (estrutura === "baseline" ? !d.startsWith("estrutura-") : filtro(d)));
      if (a.colunas.telefone.total === 0) {
        add(`| ${estrutura} | ${c.id} | — | — | — | — | — |`);
        continue;
      }
      add(
        `| ${estrutura} | ${c.id} | ${exatos(a.colunas.telefone)} | ${falso(a.colunas.telefone)} | ` +
          `${exatos(a.colunas.valor)} | ${falso(a.colunas.valor)} | ${numLinha(a.linhas.fantasma)} |`
      );
    }
  }
  add("");
  add(
    "Nos candidatos de LLM os totais de célula são 2× (REPEAT=2); os percentuais já normalizam isso. " +
      "Linha fantasma é a linha extraída que não existe no ground truth — no caso da linha TOTAL, é o risco de " +
      "importar o total como se fosse um cliente. Na importação real ela cai na validação de telefone (sem " +
      "telefone, a linha é recusada), mas o dado aparece como erro na prévia."
  );
  add("");

  // ------------------------------------------------------------- achados
  const a = porId(candidatos, "A-");
  const b = porId(candidatos, "B-");
  const cc = porId(candidatos, "C-");
  const d = porId(candidatos, "D-");
  const e = porId(candidatos, "E-");
  const f = porId(candidatos, "F*");
  const bench = (id: string) => agrega(candidatos.find((x) => x.id.startsWith(id))!, dentroDoPiso);

  add("## Achados");
  add("");
  if (a && b) {
    const ab = bench("A-");
    const bb = bench("B-");
    add(
      `- **Layout decide mais que o motor.** A e B usam o mesmo Tesseract; acima do piso, o B acerta ` +
        `${exatos(bb.colunas.telefone)} de telefone e ${exatos(bb.colunas.valor)} de valor, contra ` +
        `${exatos(ab.colunas.telefone)} e ${exatos(ab.colunas.valor)} do A. O A ainda cria ` +
        `**${ab.colunas.valor.falsoConfiante} falsos confiáveis de valor** nesse regime.`
    );
  }
  if (b) {
    const bb = bench("B-");
    add(
      `- **B acima do piso é um filtro seguro, não extração completa.** Telefone e valor ficam em ` +
        `${exatos(bb.colunas.telefone)} e ${exatos(bb.colunas.valor)}, com ${bb.linhas.falsoConfiante} linha(s) ` +
        `falso(s)-confiável(is); mas o nome acerta ${exatos(bb.colunas.nome)} e sobram ` +
        `${bb.linhas.revisao}/${bb.linhas.total} linhas (${pct(bb.linhas.revisao, bb.linhas.total)}) para conferência. ` +
        `Ou seja: serve para **decidir o que importar com segurança**, não para dispensar revisão.`
    );
  }
  if (cc) {
    add(
      `- **Vision do macOS é teto, não opção.** Acima do piso acerta ${exatos(bench("C-").colunas.telefone)} de ` +
        `telefone, mas roda só no macOS — não entra no container Linux da API.`
    );
  }
  if (d) {
    const bd = bench("D-");
    add(
      `- **LLM de visão acerta quase tudo e concentra o risco no que sobra.** ${exatos(bd.colunas.telefone)} de ` +
        `telefone, ${exatos(bd.colunas.valor)} de valor e ${exatos(bd.colunas.nome)} de nome, com apenas ` +
        `${bd.linhas.revisao} linha(s) para revisar — mas o que sobra é **falso confiante** ` +
        `(${numLinha(bd.linhas.falsoConfiante)} por execução), isto é, exatamente o que passa pela validação.`
    );
  }
  if (e) {
    const be = bench("E-");
    add(
      `- **OCR → LLM não paga o custo.** Acima do piso o E acerta ${exatos(be.colunas.telefone)} de telefone e ` +
        `${exatos(be.colunas.valor)} de valor (igual ao B em acerto de contato), mas custa ` +
        `${(e.tempoMedioMs / 1000).toFixed(1)} s/imagem, depende de rede e deixa ${be.linhas.revisao} linhas para revisar. ` +
        "No regime ruim ele é o que mais produz número plausível e errado."
    );
  }
  if (f && d) {
    const bf = bench("F*");
    add(
      `- **O gate não captura erro plausível — medido, não suposto.** Aplicado às mesmas extrações do D, o gate ` +
        `descartou **${bf.linhas.revisao - bench("D-").linhas.revisao}** linha(s) e manteve os ` +
        `**${bf.linhas.falsoConfiante}** falsos confiáveis: eles normalizam e passariam pela validação.`
    );
  }
  add(
    "- **Máscara de telefone quebra regex, não layout.** Na estrutura com máscara variada, o A acerta " +
      `${a ? exatos(agrega(a, (x) => x === "estrutura-mascara").colunas.telefone) : "—"} e o B ` +
      `${b ? exatos(agrega(b, (x) => x === "estrutura-mascara").colunas.telefone) : "—"}.`
  );
  add(
    "- **Grade e ausência de grade não mudaram o resultado local** (as duas estruturas ficaram em 100% de " +
      "telefone para A e B); a dificuldade veio da máscara e da resolução."
  );
  add(
    "- **Ruído extremo falha, não corrompe:** o OCR local devolve texto ilegível (recusado pela validação) e o " +
      "LLM devolve resposta vazia. Os erros perigosos estão nas degradações recuperáveis."
  );
  add("");

  // ------------------------------------------------------ matriz ponderada
  add("## Matriz ponderada (dois regimes lado a lado)");
  add("");
  add(
    "Pesos: **falso confiante 30% · acerto 25% · custo/CPU 20% · simplicidade 15% · licença 10%**. " +
      "As duas tabelas usam a mesma fórmula e as mesmas notas de custo/simplicidade/licença; muda só o " +
      "conjunto de imagens."
  );
  add("");
  add("Fórmulas (notas de 0 a 10):");
  add("");
  add("- `FC = clamp(10 − 500 × taxaFC, 0, 10)` — 0% → 10; 1% → 5; ≥2% → 0.");
  add("- `Acerto = 10 × acerto`.");
  add("- `Custo = clamp(10 × (1 − segundos/20), 0, 10)` — 0,3 s → 9,83; 8,7 s → 5,67; 9,2 s → 5,38.");
  add("- `Nota final = 0,30×FC + 0,25×Acerto + 0,20×Custo + 0,15×Simplicidade + 0,10×Licença`.");
  add("");

  interface NotaRegime {
    taxaFc: number;
    fcNota: number;
    acerto: number;
    acertoNota: number;
    seg: number;
    custoNota: number;
    simp: number;
    lic: number;
    final: number;
  }

  const avaliar = (c: CandidateReport, filtro: (degradacao: string) => boolean): NotaRegime => {
    const x = agrega(c, filtro);
    const fcCells = x.colunas.telefone.total + x.colunas.valor.total;
    const fcCount = x.colunas.telefone.falsoConfiante + x.colunas.valor.falsoConfiante;
    const taxaFc = fcCells ? fcCount / fcCells : 0;
    const fcNota = clamp(10 - 500 * taxaFc, 0, 10);
    const total3 = x.colunas.nome.total + x.colunas.telefone.total + x.colunas.valor.total;
    const ok3 = x.colunas.nome.corretas + x.colunas.telefone.corretas + x.colunas.valor.corretas;
    const acerto = total3 ? ok3 / total3 : 0;
    const acertoNota = 10 * acerto;
    const seg = c.tempoMedioMs / 1000;
    const custoNota = clamp(10 * (1 - seg / 20), 0, 10);
    const simp = chaveNota(SIMPLICIDADE, c.id).nota;
    const lic = chaveNota(LICENCA, c.id).nota;
    const final =
      PESOS.falso * fcNota +
      PESOS.acerto * acertoNota +
      PESOS.custo * custoNota +
      PESOS.simplicidade * simp +
      PESOS.licenca * lic;
    return { taxaFc, fcNota, acerto, acertoNota, seg, custoNota, simp, lic, final };
  };

  const ponderados = candidatos.map((c) => ({
    c,
    bruto: avaliar(c, () => true),
    aceitavel: avaliar(c, dentroDoPiso),
  }));

  const tabelaRegime = (rotulo: string, chave: "bruto" | "aceitavel"): void => {
    add(`### ${rotulo}`);
    add("");
    add("| Candidato | Taxa FC | FC | Acerto | Acerto nota | Custo | Simpl. | Licença | Conta | Final |");
    add("|---|---|---|---|---|---|---|---|---|---|");
    for (const p of ponderados) {
      const m = p[chave];
      add(
        `| ${p.c.id} | ${(100 * m.taxaFc).toFixed(2)}% | ${m.fcNota.toFixed(2)} | ` +
          `${(100 * m.acerto).toFixed(1)}% | ${m.acertoNota.toFixed(2)} | ${m.custoNota.toFixed(2)} | ` +
          `${m.simp} | ${m.lic} | ` +
          `0,30×${m.fcNota.toFixed(2)} + 0,25×${m.acertoNota.toFixed(2)} + 0,20×${m.custoNota.toFixed(2)} + ` +
          `0,15×${m.simp} + 0,10×${m.lic} | **${m.final.toFixed(2)}** |`
      );
    }
    add("");
  };

  tabelaRegime("Regime bruto — todas as 66 imagens, inclusive baixa resolução e ruído", "bruto");
  tabelaRegime("Regime aceitável — acima do piso (exclui baixa resolução e ruído)", "aceitavel");

  const bPond = ponderados.find((p) => p.c.id.startsWith("B-"));
  const dPond = ponderados.find((p) => p.c.id.startsWith("D-"));
  add(
    "**Por que B = " +
      (bPond?.aceitavel.final.toFixed(2) ?? "?") +
      " não é nota de produção.** É uma nota **relativa**, calculada (i) só em prints sintéticos, (ii) no " +
      "regime em que as imagens ruins já foram descartadas. No regime bruto o mesmo B cai para " +
      (bPond?.bruto.final.toFixed(2) ?? "?") +
      " — e mesmo essa nota é generosa, porque 30 das 66 imagens são estruturas fáceis de print. A nota não " +
      "mede: foto real de celular, manuscrito, PDF escaneado, o custo de revisar 100% dos nomes, a auditoria " +
      "de licença, nem o fato de B não extrair nome com segurança (91,2%). Ela serve para **ranquear " +
      "candidatos**, não para autorizar importação. O D, por exemplo, tem nota menor (" +
      (dPond?.aceitavel.final.toFixed(2) ?? "?") +
      ") por causa de rede/custo, mas acerta mais — o ranking não é uma medida de qualidade absoluta."
  );
  add("");
  add("Justificativas de simplicidade e licença:");
  add("");
  add("| Candidato | Simplicidade | Licença |");
  add("|---|---|---|");
  for (const c of candidatos) {
    add(
      `| ${c.id} | ${chaveNota(SIMPLICIDADE, c.id).nota} — ${chaveNota(SIMPLICIDADE, c.id).motivo} | ` +
        `${chaveNota(LICENCA, c.id).nota} — ${chaveNota(LICENCA, c.id).motivo} |`
    );
  }
  add("");

  // ------------------------------------------------- critérios fase 2
  add("## Critérios aprovados para a Fase 2 (2026-11-02)");
  add("");
  add(
    "Critérios aprovados pelo dono, com ajustes. A coluna \"medição no spike\" é **sintética**; ela não " +
      "seleciona candidato. A seleção final depende do benchmark com imagens reais."
  );
  add("");
  add("| # | Critério aprovado | Medição no spike (sintético) | Situação |");
  add("|---|---|---|---|");
  const idsCrit = ["A-", "B-", "C-", "D-", "E-", "F*"];
  const fcRate = (id: string): string => {
    const x = bench(id);
    const total = x.colunas.telefone.total + x.colunas.valor.total;
    const fc = x.colunas.telefone.falsoConfiante + x.colunas.valor.falsoConfiante;
    return total ? pct(fc, total) : "—";
  };
  const acertoTelValor = (id: string): string => {
    const x = bench(id);
    return `${pct(x.colunas.telefone.corretas, x.colunas.telefone.total)} tel / ` +
      `${pct(x.colunas.valor.corretas, x.colunas.valor.total)} valor`;
  };
  add(
    "| C1 | Falso confiante ≤ 0,5% em telefone+valor; **alvo real: 0 acima da confiança 80** | " +
      idsCrit.map((id) => `${id.split("-")[0]}: ${fcRate(id)}`).join(" · ") +
      `. B: 0 FC com confiança ≥80 (calibração) | aprovado |`
  );
  add(
    "| C2 | Acerto ≥ 99% em telefone e valor, **medido em imagens reais** | " +
      idsCrit.map((id) => `${id.split("-")[0]}: ${acertoTelValor(id)}`).join(" · ") +
      " | pendente de imagem real |"
  );
  add(
    "| C3 | **Removido** o limite de revisão ≤10%; substituído por **tempo de conferência por planilha**, " +
      "medido com o dono | — | pendente de medição com o dono |"
  );
  add(
    "| C4 | ≤ 2 s/imagem no fluxo **síncrono**; até 30 s na **fila** do bot | " +
      "A 0,4 s · B 0,3 s · C 0,8 s (não deployável) · D 8,7 s · E 9,2 s · F* 8,7 s | " +
      "A/B aprovados no síncrono; D/E/F* só na fila |"
  );
  add(
    "| C5 | Só licença permissiva (Apache/MIT/BSD) e **sem envio de imagem a terceiros nesta entrega** | " +
      "A/B: Apache-2.0, local · C: Apple proprietário · D/E/F*: enviam imagem a terceiro | " +
      "aprovado — **A/B elegíveis; C/D/E/F* fora nesta entrega** |"
  );
  add(
    "| C6 | Piso de resolução **obrigatório, definido sobre imagens reais** | piso sintético: 693 px da tabela " +
      "(telefone) e 924 px (valor) | pendente de imagem real |"
  );
  add("");
  add("Leitura dos critérios aprovados:");
  add("");
  add(
    "- **C1:** B mede 0% de falso confiante acima da confiança 80; o único FC do dataset está abaixo de 50. " +
      "D/E/F* não têm confiança calibrada, então o alvo complementar não se aplica a eles."
  );
  add(
    "- **C2:** os percentuais da tabela são sintéticos. A aprovação de 99% só vale depois de repetir a medição " +
      "nas 5–10 imagens reais."
  );
  add(
    "- **C3:** o spike continua medindo revisão por linha como diagnóstico, mas **não é mais critério**. O " +
      "substituto (tempo de conferência por planilha) não é simulável: precisa de sessão de medição com o dono."
  );
  add(
    "- **C4:** A/B passam no síncrono; D/E/F* só passariam na fila; C não entra porque não é deployável."
  );
  add(
    "- **C5:** nesta entrega, só **A e B** são elegíveis — Apache-2.0 e processamento local. C é framework " +
      "proprietário da Apple; D/E/F* enviam a imagem a um provedor externo, o que está fora do escopo aprovado."
  );
  add(
    "- **C6:** obrigatório e ainda **não satisfeito**: o piso sintético (693/924 px) é referência de método, não " +
      "valor de produção; o piso real será definido com as imagens reais."
  );
  add("");
  add(
    "**Consequência:** B é o único candidato que atende C1, C2 (sintético), C4 (síncrono) e C5. C3 (novo) e C6 " +
      "dependem do dono e das imagens reais. **Nenhuma seleção é final até o benchmark real.**"
  );
  add("");

  // ------------------------------------------------------- recomendação
  add("## Recomendação (revisada)");
  add("");
  const brutoB = b ? agrega(b, (d) => !d.startsWith("estrutura-")) : undefined;
  add(
    "1. **B não é extração suficiente — é filtro seguro.** Na linha de base bruta (incluindo as imagens abaixo " +
      `do piso) ele acerta ${brutoB ? exatos(brutoB.colunas.telefone) : "—"} de telefone e ` +
      `${brutoB ? exatos(brutoB.colunas.valor) : "—"} de valor — por isso a leitura anterior de 66,7% estava ` +
      "certa nesse regime. Ele só vira 100% de telefone/valor **depois** de recusar imagem abaixo do piso. " +
      "O que ele entrega é: nenhum telefone/valor errado passando (0 falso confiante acima do piso) e " +
      "telefone/valor já preenchidos; se todo nome for revisado, **100% das linhas são tocadas** (ver seção " +
      "\"Revisão real\")."
  );
  add(
    "2. **O trabalho de revisão que cada um deixa para o dono** (acima do piso, por 100 linhas): " +
      recomendacaoRevisao(ponderados.map((p) => ({ id: p.c.id, x: bench(p.c.id.slice(0, 2)) }))) +
      ". O 8,8/100 do B conta só linhas com erro medido; com **todo nome em revisão vira 100/100**. O D reduz a " +
      "revisão a 0,3/100, mas todas as linhas que sobram são erro silencioso; o E deixa ~8,8/100 e ainda cobra rede."
  );
  add(
    "3. **Pipeline proposto para a Fase 2:** imagem → medir a região da tabela → **recusar abaixo de ~924 px " +
      "dessa região para valor (~693 px só para telefone)** → " +
      "B (Tesseract + layout) → gate determinístico → marcar para revisão toda célula de telefone/valor com " +
      "confiança < 80 e **todo nome** (a confiança do nome não é confiável) → prévia obrigatória antes de importar."
  );
  add(
    "4. **Não usar OCR → LLM (E)**: não supera o B em telefone/valor acima do piso, custa ~10× mais, gera mais " +
      "valor plausível e errado no regime ruim e **C5 o exclui nesta entrega** (envia imagem a terceiro)."
  );
  add(
    "5. **LLM de visão (D) fica fora desta entrega por C5** (envio de imagem a terceiro). Se um dia for " +
      "avaliado, que seja como leitura assistida, com revisão humana — o erro residual dele é justamente o que " +
      "a validação não pega."
  );
  add("");
  add(
    "**Conclusão:** spike **encerrado**. Critérios aprovados em 2026-11-02 (C3 removido; C4 separado em " +
      "síncrono/fila; C5 restrito a licença permissiva e processamento local; C6 obrigatório sobre imagem real). " +
      "Nenhum candidato está selecionado e a **Fase 2 não foi iniciada**. O próximo passo é o benchmark com 5 a " +
      "10 imagens reais anonimizadas; sem esses dados, o spike não decide implementação."
  );
  add("");

  // --------------------------------------------------------- limitações
  add("## Limitações");
  add("");
  if (puladas.length) {
    add(
      `- Nos cenários \`${puladas.join(", ")}\`, os candidatos de LLM não têm número: o provedor devolveu ` +
        "resposta vazia em todas as tentativas (evidência em `resultados/run-llm.log`)."
    );
  }
  add(
    `- LLM é não determinístico: números são médias de ${reps} execuções por imagem e ainda têm variância.`
  );
  add(
    "- `C-macos-vision` depende do framework Vision (via `pyobjc`); **não é deployável** no container Linux/Docker."
  );
  add(
    "- O dataset é sintético: layout, fonte e cores fixos. Números absolutos não transferem para fotos reais; " +
      "a comparação relativa e o conceito de falso confiante transferem."
  );
  add("- O crédito do NVIDIA NIM usado no teste não foi tarifado: **o custo por imagem não foi medido**.");
  add(
    "- A calibração cobre só o Tesseract/B. A confiança do LLM não é comparável à do OCR e não foi calibrada."
  );
  add("");

  // ------------------------------------------------------- reprodução
  add("## Como reproduzir");
  add("");
  add("```bash");
  add("cd backend/spikes/ocr-benchmark");
  add("npm install");
  add("npm run dataset            # 66 imagens + ground-truth.json");
  add("npm run bench              # locais + LLM + ablação");
  add("npm run calibration        # calibracao.json");
  add("npm run resolution         # resolucao.json");
  add("npm run report             # regenera este REPORT.md");
  add("npm run typecheck");
  add("");
  add("# candidato C (macOS Vision) — opcional, só em macOS:");
  add("python3 -m venv /tmp/ocrvenv");
  add("/tmp/ocrvenv/bin/pip install pillow pyobjc-framework-Vision pyobjc-framework-Quartz");
  add("export SPICE_PYTHON=/tmp/ocrvenv/bin/python3");
  add("```");
  add("");
  add(
    "Variáveis: `REPEAT`, `CONCURRENCY`, `LIMIT`, `SKIP_DEGRADATIONS`, `RESET_CACHE`, `SPICE_PYTHON`, " +
      "`OPENAI_BASE_URL`, `OPENAI_API_KEY`."
  );
  add("");

  const texto = linhas.join("\n");
  if (texto.includes("undefined")) {
    throw new Error("REPORT.md conteria 'undefined' — corrigir os campos ausentes antes de gravar.");
  }
  fs.writeFileSync(SAIDA, texto);
  console.log(`Relatório em ${SAIDA}`);
}

function recomendacaoRevisao(dados: Array<{ id: string; x: ReturnType<typeof agrega> }>): string {
  return dados
    .map(({ id, x }) => {
      const porCem = x.linhas.total ? (100 * x.linhas.revisao) / x.linhas.total : 0;
      const fc = numLinha(x.linhas.falsoConfiante);
      return `${id.split("-")[0]} ≈ ${porCem.toFixed(1)} linhas de revisão (${fc} silenciosa(s))`;
    })
    .join("; ");
}

main();
