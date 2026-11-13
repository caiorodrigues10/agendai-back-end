#!/usr/bin/env node
/**
 * Auditoria de identificadores em português — Fase 0 do plano Clean Architecture.
 *
 * Lista, por área/módulo, com contagem e priorização:
 *   - nomes de pastas e arquivos;
 *   - identificadores (declarações: variáveis, funções, classes, parâmetros,
 *     tipos, interfaces, enum members, bindings de import, membros de objeto);
 *   - comentários (JSDoc e inline);
 *   - títulos de teste (describe/it/test);
 *   - strings passadas a loggers (console/logger/log.*) — mensagens de log
 *     interno são código e vão para inglês.
 *
 * NÃO lista (permanece em pt-BR nesta fase):
 *   - strings de UI e mensagens exibidas ao usuário (AppError, Zod, toasts,
 *     respostas da API, templates de e-mail/WhatsApp, seeds visíveis);
 *   - qualquer outro literal de string (inclusive valores de enum de contrato).
 *
 * Detecção PT: dicionário de palavras que DIFEREM do inglês + sufixos
 * característicos (ções/ção/ão/ões/ância/…) + acentuação. Palavras com a mesma
 * grafia em PT e EN (total, local, final, normal, status, token…) não são
 * sinalizadas de propósito — renomeá-las não mudaria nada.
 *
 * ATENÇÃO (chaves `property`): chaves de objeto podem ser contrato JSON ou
 * campos Prisma (fase 4 com @@map/alias). Nesta fase são só inventário —
 * cada ocorrência é revisada no refactor do módulo, sem rename cego.
 *
 * Uso:
 *   node scripts/audit-portuguese-identifiers.mjs            # resumo no stdout
 *   node scripts/audit-portuguese-identifiers.mjs --md       # gera docs/architecture/portuguese-identifiers.md
 *   node scripts/audit-portuguese-identifiers.mjs --json     # dump completo em JSON no stdout
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Áreas varridas ──────────────────────────────────────────────────────────
const SCAN_ROOTS = ["src", "prisma", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "dist", "spikes", ".opencode", "coverage"]);
const CODE_EXT = new Set([".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx"]);

// ── Detecção de português ───────────────────────────────────────────────────
// Palavras que existem em português com grafia diferente do inglês.
const PT_WORDS = new Set(
  [
    // pessoas / papéis
    "nome", "nomes", "cliente", "clientes", "usuario", "usuarios", "senha",
    "senhas", "perfil", "perfis", "pessoa", "pessoas", "equipe",
    "funcionario", "funcionarios", "dono", "dona", "barbeiro", "barbeiros",
    "profissional", "profissionais", "salao", "saloes", "barbearia",
    "escritorio", "advogado", "advogados", "autor", "autores", "sobrenome",
    "apelido", "genero",
    // agendamento / fila
    "agendamento", "agendamentos", "horario", "horarios", "disponivel",
    "disponiveis", "disponibilidade", "reserva", "reservas", "confirmar",
    "confirmado", "confirmada", "confirmados", "confirmadas", "cancelar",
    "cancelado", "cancelada", "cancelados", "canceladas", "remarcar",
    "encaixe", "encaixes", "fila", "filas", "chamada", "chamadas",
    "posicao", "posicoes", "atendimento", "atendimentos", "consulta",
    "consultas", "compareceu", "faltou", "atraso", "atrasado",
    // comanda / fiado / financeiro
    "comanda", "comandas", "fiado", "fiados", "conta", "contas",
    "lancamento", "lancamentos", "debito", "credito", "saldo", "saldos",
    "pagamento", "pagamentos", "parcela", "parcelas", "recebido",
    "recebida", "recebidos", "devido", "devida", "pagar", "recebimento",
    "preco", "precos", "valor", "valores", "custo", "custos", "receita",
    "receitas", "despesa", "despesas", "lucro", "margem", "comissao",
    "comissoes", "taxa", "taxas", "desconto", "descontos", "imposto",
    "impostos", "nota", "notas", "fatura", "faturas", "boleto", "cobranca",
    "cobrancas", "assinatura", "assinaturas", "plano", "planos",
    "faturamento", "moeda", "centavo", "centavos", "gratuito", "gratis",
    "cartao", "troco", "cambio", "frete", "garantia", "venda", "vendas",
    "pedido", "pedidos", "orcamento", "meta", "metas",
    // produtos / estoque
    "produto", "produtos", "estoque", "item", "itens", "categoria",
    "categorias", "servico", "servicos", "quantidade", "unidade",
    "fornecedor", "fornecedores", "compra", "compras", "entrada",
    "saida", "equipamento", "equipamentos", "manutencao", "limpeza",
    // genéricos de código
    "descricao", "titulo", "campo", "campos", "arquivo", "arquivos",
    "linha", "linhas", "coluna", "colunas", "tabela", "tabelas", "dado",
    "dados", "objeto", "objetos", "lista", "listas", "buscar", "busca",
    "filtrar", "filtro", "filtros", "ordenar", "pagina", "paginas",
    "paginacao", "erro", "erros", "aviso", "avisos", "mensagem",
    "mensagens", "notificacao", "notificacoes", "alerta", "alertas",
    "sucesso", "falha", "falhas", "tentativa", "tentativas", "limite",
    "limites", "opcao", "opcoes", "configuracao", "configuracoes",
    "preferencia", "preferencias", "permissoes", "papel", "papeis",
    "acesso", "acessos", "autorizacao", "autenticacao", "sessao",
    "sessoes", "convite", "convites", "codigo", "codigos", "endereco",
    "enderecos", "rua", "bairro", "cidade", "estado", "cep", "telefone",
    "celular", "nascimento", "observacao", "observacoes", "comentario",
    "comentarios", "historico", "resumo", "detalhes", "texto", "numero",
    "numeros", "chave", "chaves", "regra", "regras", "politica",
    "politicas", "contrato", "problema", "solucao", "sistema", "nivel",
    "niveis", "ordem", "ordens", "direcao", "secao", "colecao",
    "relatorio", "relatorios", "tarefa", "tarefas", "chamado",
    "chamados", "atividade", "atividades", "inscricao", "matricula",
    "avaliacao", "avaliacoes", "reclamacao", "sugestao", "elogio",
    "agenda" /* risco: igual em EN? "agenda" existe nos dois — removido abaixo */,
    "missao", "prazo", "prazos", "meta",
    // tempo
    "data", "hora", "horas", "minuto", "minutos", "dia", "dias", "semana",
    "semanas", "mes", "meses", "ano", "anos", "inicio", "fim",
    "hoje", "ontem", "amanha", "agora", "sempre", "nunca",
    // ações
    "listar", "listagem", "criar", "criacao", "editar", "edicao",
    "atualizar", "atualizacao", "salvar", "excluir", "exclusao", "remover",
    "remocao", "adicionar", "inserir", "enviar", "envio", "receber",
    "carregar", "verificar", "validacao", "valido", "valida", "invalido",
    "invalida", "obrigatorio", "obrigatoria", "permitido", "bloqueado",
    "bloqueio", "habilitar", "desabilitar", "habilitado", "desabilitado",
    "encerrar", "finalizar", "concluir", "conclusao", "iniciar",
    "exportar", "exportacao", "importar", "importacao", "imprimir",
    "impressao", "compartilhar", "compartilhamento", "visualizar",
    "visao", "pesquisar", "pesquisa", "selecionar", "selecionado",
    "escolher", "escolha", "aguardando", "pendente", "pendentes",
    "concluido", "concluida", "concluidos", "finalizado", "finalizada",
    "andamento", "aberto", "aberta", "fechado", "fechada", "usado",
    "usada", "utilizar", "utilizando", "gerar", "geracao", "abrir",
    "fechar", "parar", "tentar", "responder", "resposta", "respostas",
    "requisicao", "requisicoes", "carregado", "carregada", "expirado",
    "expirada", "encontrado", "encontrada", "credencial", "credenciais",
    "nao", "vazio", "vazia", "padrao", "padroes",
    // formas / qualificadores
    "novo", "nova", "novos", "novas", "antigo", "antiga", "ultimo",
    "ultima", "primeiro", "primeira", "proximo", "proxima", "mesmo",
    "mesma", "proprio", "propria", "unico", "unica", "outro", "outra",
    "outros", "outras", "atual", "necessario", "necessaria",
    "indisponivel", "bloqueada", "liberado", "liberada", "excluido",
    "excluida", "alterado", "alterada", "diferente", "igual", "menor",
    "maior", "exemplo",
    // código
    "funcao", "funcoes", "metodo", "metodos", "classe", "classes",
    "teste", "testes", "repositorio", "repositorios", "diretorio",
    "diretorios", "caminho", "caminhos", "provedor", "provedores",
    "instancia", "instancias", "modulo", "modulos", "camada", "camadas",
  ].map((w) => w.toLowerCase())
);
// "agenda" é igual em PT e EN — remover do dicionário.
PT_WORDS.delete("agenda");

// Sufixos característicos de português (código costuma vir sem acento:
// validacao, informacoes, necessario…). Token com ≥4 letras.
const PT_SUFFIX_RE =
  /(coes|cao|oes|ao|ancia|encia|ivel|avel|ario|aria|orio|oria|inho|inha|inhos|inhas|ura|uras|agem|agens|eiro|eira|eiros|eiras|ismo|istas|oso|osa|osos|osas|ico|ica|icos|icas|alha|alhas|unha|unhas)$/;

// Falsos positivos de sufixo (palavras inglesas terminadas em "oes").
const EN_EXCEPTIONS = new Set(["shoes", "foes", "toes", "goes", "does", "woes"]);

const ACCENT_RE = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;

// Stopwords: somam para comentários/títulos/logs (não isolam o flag).
const PT_STOPWORDS = new Set(
  [
    "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "em", "ao",
    "aos", "pelo", "pela", "pelos", "pelas", "para", "por", "com", "sem",
    "que", "se", "e", "ou", "mas", "mais", "menos", "quando", "onde",
    "porque", "pois", "entao", "assim", "este", "esta", "estes", "estas",
    "esse", "essa", "esses", "essas", "aquele", "aquela", "aqueles",
    "aquelas", "isso", "isto", "ele", "eles", "ela", "elas", "voce",
    "voces", "seu", "sua", "seus", "suas", "meu", "minha", "meus",
    "minhas", "nosso", "nossa", "ja", "ainda", "tambem", "ate", "desde",
    "entre", "sobre", "apos", "durante", "antes", "depois", "muito",
    "muitos", "muitas", "pouco", "toda", "todas", "todos", "cada",
    "qualquer", "ambos", "deve", "devem", "pode", "podem", "sera",
    "foram", "foi", "sao", "tem", "ter", "nao", "caso", "senao", "tal",
    "qual", "quais", "quanto", "segundo", "conforme", "mesmo", "mesma",
    "outro", "outra", "proprio", "unico", "certo", "apenas", "somente",
    "enquanto", "faz", "fazer", "feito", "feita", "tiver", "tinha",
    "estava", "estao", "estiver", "la", "aqui", "ali", "num", "numa",
    "numas", "delas", "deles", "nele", "nela", "elas", "vai", "vao",
    "tem", "está", "esta",
  ]
);

/** Divide identificador em palavras (camelCase, PascalCase, snake, kebab, dígito). */
function splitWords(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-zÀ-ÿ]+/)
    .filter(Boolean);
}

/** True se o token é palavra/sufixo português. */
function isPtToken(token) {
  const t = token.toLowerCase();
  if (EN_EXCEPTIONS.has(t)) return false;
  if (ACCENT_RE.test(t)) return true;
  if (PT_WORDS.has(t)) return true;
  if (t.length >= 4 && PT_SUFFIX_RE.test(t)) return true;
  return false;
}

/** Nome (arquivo/pasta/identificador) contém palavra PT? */
function hasPtName(name) {
  return splitWords(name).some(isPtToken);
}

/**
 * Conteúdo textual (comentário, título de teste, string de log):
 * acento OU sufixo OU ≥2 palavras-dicionário OU (≥1 dicionário E ≥1 stopword)
 * OU ≥3 stopwords.
 */
function hasPtText(text) {
  if (ACCENT_RE.test(text)) return true;
  const words = splitWords(text).map((w) => w.toLowerCase());
  let dict = 0;
  let stop = 0;
  let suffix = false;
  for (const w of words) {
    if (EN_EXCEPTIONS.has(w)) continue;
    if (PT_WORDS.has(w)) dict += 1;
    else if (PT_STOPWORDS.has(w)) stop += 1;
    else if (w.length >= 4 && PT_SUFFIX_RE.test(w)) suffix = true;
  }
  if (suffix) return true;
  if (dict >= 2) return true;
  if (dict >= 1 && stop >= 1) return true;
  if (stop >= 3) return true;
  return false;
}

// ── Varredura ───────────────────────────────────────────────────────────────

/** Pais de nós cujo filho Identifier é uma declaração de nome. */
const DECL_PARENTS = new Set([
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.Parameter,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.ShorthandPropertyAssignment,
  ts.SyntaxKind.BindingElement,
  ts.SyntaxKind.ImportClause,
  ts.SyntaxKind.ImportSpecifier,
  ts.SyntaxKind.NamespaceImport,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.TypeParameter,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.LabeledStatement,
  ts.SyntaxKind.ExportSpecifier,
]);

const LOGGER_NAMES = new Set(["log", "info", "warn", "error", "debug", "trace", "fatal"]);
const TEST_TITLE_NAMES = new Set(["describe", "it", "test", "context"]);

function areaOf(relFile) {
  const parts = relFile.split(path.sep);
  if (parts[0] === "src" && parts[1] === "modules" && parts[2]) {
    return `modules/${parts[2]}`;
  }
  if (parts[0] === "src" && parts[1]) return parts[1];
  if (parts[0] === "prisma") return "prisma";
  if (parts[0] === "scripts") return "scripts";
  return parts[0] || "root";
}

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push({ rel: path.relative(root, full), dir: true });
      walkFiles(full, out);
    } else if (CODE_EXT.has(path.extname(entry.name))) {
      out.push({ rel: path.relative(root, full), dir: false });
    }
  }
  return out;
}

function lineOf(lineStarts, pos) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lineStarts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function auditFile(abs, rel, occurrences) {
  const text = fs.readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(
    abs,
    text,
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith(".tsx") ? ts.ScriptKind.TSX : undefined
  );
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const line = (pos) => lineOf(lineStarts, pos);
  const push = (kind, name, pos) => {
    if (kind === "comment" || kind === "test-title" || kind === "log-string") {
      if (!hasPtText(name)) return;
    } else if (!hasPtName(name)) {
      return;
    }
    occurrences.push({ area: areaOf(rel), file: rel, line: line(pos), kind, name });
  };

  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      if (parent && DECL_PARENTS.has(parent.kind)) {
        const kind =
          parent.kind === ts.SyntaxKind.PropertyAssignment ||
          parent.kind === ts.SyntaxKind.ShorthandPropertyAssignment ||
          parent.kind === ts.SyntaxKind.PropertySignature
            ? "property"
            : "identifier";
        push(kind, node.text, node.getStart(sf));
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (calleeName && TEST_TITLE_NAMES.has(calleeName)) {
        const arg = node.arguments[0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
          push("test-title", arg.text, arg.getStart(sf));
        }
      }
      if (
        calleeName &&
        LOGGER_NAMES.has(calleeName) &&
        (ts.isPropertyAccessExpression(callee) ||
          (ts.isIdentifier(callee) && /^(log|logger|console)$/i.test(callee.text)))
      ) {
        for (const arg of node.arguments) {
          if (ts.isStringLiteral(arg)) push("log-string", arg.text, arg.getStart(sf));
          else if (ts.isNoSubstitutionTemplateLiteral(arg))
            push("log-string", arg.text, arg.getStart(sf));
          else if (ts.isTemplateExpression(arg))
            push("log-string", arg.getText(sf), arg.getStart(sf));
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Comentários — via scanner léxico (não confunde "//" dentro de string).
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text
  );
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const start = scanner.getTokenPos();
      const raw = scanner.getTokenText().replace(/\s+/g, " ").trim().slice(0, 160);
      push("comment", raw, start);
    }
    token = scanner.scan();
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const occurrences = [];
  let fileCount = 0;

  for (const scanRoot of SCAN_ROOTS) {
    const absRoot = path.join(root, scanRoot);
    if (!fs.existsSync(absRoot)) continue;
    const files = walkFiles(absRoot);
    for (const f of files) {
      if (f.dir) {
        const name = path.basename(f.rel);
        if (hasPtName(name)) {
          occurrences.push({ area: areaOf(f.rel), file: f.rel, line: 0, kind: "dir", name });
        }
      } else {
        fileCount += 1;
        const base = path.basename(f.rel);
        const stem = base.replace(/\.[^.]+$/, "");
        if (hasPtName(stem)) {
          occurrences.push({
            area: areaOf(f.rel),
            file: f.rel,
            line: 0,
            kind: "file",
            name: base,
          });
        }
        auditFile(path.join(root, f.rel), f.rel, occurrences);
      }
    }
  }

  occurrences.sort(
    (a, b) =>
      a.area.localeCompare(b.area) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.kind.localeCompare(b.kind)
  );

  const KINDS = ["dir", "file", "identifier", "property", "comment", "test-title", "log-string"];
  const byArea = new Map();
  for (const occ of occurrences) {
    if (!byArea.has(occ.area)) {
      const bucket = { total: 0 };
      for (const k of KINDS) bucket[k] = 0;
      byArea.set(occ.area, bucket);
    }
    const bucket = byArea.get(occ.area);
    bucket[occ.kind] += 1;
    bucket.total += 1;
  }
  const summary = [...byArea.entries()]
    .map(([area, counts]) => ({ area, ...counts }))
    .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area));

  const totals = { total: 0 };
  for (const k of KINDS) totals[k] = 0;
  for (const row of summary) {
    for (const k of [...KINDS, "total"]) totals[k] += row[k];
  }

  if (args.has("--json")) {
    process.stdout.write(
      JSON.stringify(
        { generatedAt: new Date().toISOString(), fileCount, totals, summary, occurrences },
        null,
        2
      )
    );
    return;
  }

  if (args.has("--md")) {
    const md = [];
    md.push("# Inventário de identificadores em português — Fase 0 (gerado)");
    md.push("");
    md.push("> Gerado por `npm run audit:portuguese` — **não editar à mão**.");
    md.push(
      "> Identificadores/comentários/títulos de teste/logs são código e vão para inglês; " +
        "**strings de UI e mensagens ao usuário não aparecem aqui** (permanecem em pt-BR). " +
        "Palavras iguais em PT e EN (total, local, status…) não são sinalizadas."
    );
    md.push(
      "> Cuidado com o kind `property`: chaves de objeto podem ser contrato JSON ou " +
        "campo Prisma (Fase 4 com alias/@@map) — revisar ocorrência a ocorrência, " +
        "sem rename cego."
    );
    md.push(
      "> **Ordem = volume (maior primeiro), não a ordem de refactor** (a ordem das " +
        "fases está no relatório/PR da Fase 0)."
    );
    md.push("");
    md.push(`- Arquivos varridos: **${fileCount}**`);
    md.push(
      `- Ocorrências: **${totals.total}** ` +
        `(${totals.dir} pastas, ${totals.file} arquivos, ${totals.identifier} identificadores, ` +
        `${totals.property} chaves de propriedade, ${totals.comment} comentários, ` +
        `${totals["test-title"]} títulos de teste, ${totals["log-string"]} strings de log)`
    );
    md.push(`- Áreas com ocorrências: **${summary.length}**`);
    md.push("");
    md.push("## Resumo por área (priorizado por volume)");
    md.push("");
    md.push(
      "| # | Área | Pastas | Arquivos | Identificadores | Propriedades | Comentários | Títulos de teste | Strings de log | Total |"
    );
    md.push("|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    summary.forEach((row, i) => {
      md.push(
        `| ${i + 1} | \`${row.area}\` | ${row.dir} | ${row.file} | ${row.identifier} | ${row.property} | ${row.comment} | ${row["test-title"]} | ${row["log-string"]} | **${row.total}** |`
      );
    });
    md.push(
      `| | **Total** | ${totals.dir} | ${totals.file} | ${totals.identifier} | ${totals.property} | ${totals.comment} | ${totals["test-title"]} | ${totals["log-string"]} | **${totals.total}** |`
    );
    md.push("");
    md.push("## Detalhe por área");
    md.push("");
    let lastArea = null;
    for (const occ of occurrences) {
      if (occ.area !== lastArea) {
        lastArea = occ.area;
        md.push("");
        md.push(`### \`${occ.area}\``);
        md.push("");
        md.push("| Local | Kind | Nome |");
        md.push("|---|---|---|");
      }
      const where = occ.line > 0 ? `\`${occ.file}:${occ.line}\`` : `\`${occ.file}/\``;
      const name = occ.name.replace(/\|/g, "\\|").replace(/`/g, "'");
      md.push(`| ${where} | ${occ.kind} | \`${name}\` |`);
    }
    md.push("");
    const outFile = path.join(root, "docs", "architecture", "portuguese-identifiers.md");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, md.join("\n") + "\n");
    process.stdout.write(
      `Escrito ${outFile}\n` +
        `Ocorrências: ${totals.total} em ${summary.length} áreas (${fileCount} arquivos varridos)\n`
    );
    return;
  }

  process.stdout.write(
    `Ocorrências: ${totals.total} em ${summary.length} áreas (${fileCount} arquivos varridos)\n` +
      `pastas=${totals.dir} arquivos=${totals.file} identificadores=${totals.identifier} ` +
      `propriedades=${totals.property} comentarios=${totals.comment} ` +
      `titulos=${totals["test-title"]} logs=${totals["log-string"]}\n\n`
  );
  for (const row of summary.slice(0, 25)) {
    process.stdout.write(`${String(row.total).padStart(5)}  ${row.area}\n`);
  }
}

main();
