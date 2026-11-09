# Advocacia — coleção editorial v10

As fotos `law-columns-editorial-v2.png` e `law-desk-editorial-v2.png` foram geradas para esta coleção com `imagegen`. São imagens ilustrativas de arquitetura e ambiente; não representam instalações de um cliente nem retratos de profissionais. Não contêm texto, logotipos ou dados reais. O texto final é desenhado em SVG.

Usadas apenas pelos modelos jurídicos com foto opcional. Uma foto própria substitui o fundo ilustrativo sem mudar os dados do post.

Tipografia: Cormorant Garamond Medium (normal/itálico) e Inter (normal/negrito). Os arquivos Cormorant vieram de [Google Fonts](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond), com a licença SIL OFL preservada em `templates/assets/fonts/CormorantGaramond-OFL.txt`. As fontes variáveis foram instanciadas em peso 500 com FontTools. Inter já era distribuída pelo motor de posts.

`services/legalFontMetrics.json` contém os avanços de glifos dos TTF distribuídos, normalizados por unitsPerEm. O renderer usa essas medidas para quebra de linhas. Ao substituir uma fonte, regenerar as métricas a partir de suas tabelas `cmap`/`hmtx`.

As fontes são carregadas tanto no renderer local como no worker e copiadas pelo build para `dist/modules/posts/templates/assets/fonts`.

A revisão v7 acrescenta `law-office-editorial-v3.png`: fotografia ilustrativa de uma sala contemporânea de atendimento, gerada com o imagegen integrado. Ela é o fundo opcional de Identidade do escritório. Perfil profissional não possui foto de stock automática; sem upload, usa monograma. O retrato fictício de demonstração fica apenas fora do repositório, em `artifacts/posts-law-v3/fixtures/fictional-profile.png`, e é passado explicitamente ao script da galeria. Os prompts e os caminhos originais estão documentados em `artifacts/posts-law-v3/GENERATED_ASSETS.md` no workspace.
