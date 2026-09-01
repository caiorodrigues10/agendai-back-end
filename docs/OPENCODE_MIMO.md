# OpenCode com Mimo

Para economizar tempo, use `opencode/mimo-v2.5-free` em tarefas curtas de leitura, inventário, documentação e rascunhos repetitivos. Consulte o Graphify antes e delimite arquivos e resultado esperado.

```powershell
opencode.cmd run -m opencode/mimo-v2.5-free --dir "agendai-back-end" "Somente leitura: resuma o módulo CRM em até 10 tópicos. Liste contratos, riscos e testes afetados. Não edite arquivos."
```

```powershell
opencode.cmd run -m opencode/mimo-v2.5-free --dir "agendai" "Somente leitura: localize telas e APIs relacionadas ao CRM e devolva um inventário curto. Não altere arquivos."
```

- Nunca usar `--auto`.
- Não delegar decisões de finanças, migrations, RLS, permissões, segurança ou disparos de campanha.
- Revisar e testar qualquer sugestão antes de aplicar.
- Os worktrees Mimo existentes estão defasados e com mudanças locais; para escrita, criar um worktree limpo e isolado.
