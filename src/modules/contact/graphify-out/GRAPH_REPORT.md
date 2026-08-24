# Graph Report - agendai-back-end\src\modules\contact  (2026-08-07)

## Corpus Check
- 3 files · ~405 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 14 nodes · 20 edges · 3 communities (2 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- SubmitContactMessageUseCase.ts
- ContactController.ts
- contactSchema.ts

## God Nodes (most connected - your core abstractions)
1. `SubmitContactMessageUseCase` - 5 edges
2. `SubmitContactInput` - 3 edges
3. `assertRateLimit()` - 2 edges
4. `ContactController` - 2 edges
5. `submitContactSchema` - 2 edges
6. `hits` - 1 edges
7. `contactTopics` - 1 edges
8. `TOPIC_LABEL` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (3 total, 1 thin omitted)

### Community 0 - "SubmitContactMessageUseCase.ts"
Cohesion: 0.40
Nodes (4): injectable, SubmitContactInput, SubmitContactMessageUseCase, TOPIC_LABEL

### Community 1 - "ContactController.ts"
Cohesion: 0.50
Nodes (3): assertRateLimit(), ContactController, hits

## Knowledge Gaps
- **3 isolated node(s):** `hits`, `contactTopics`, `TOPIC_LABEL`
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SubmitContactMessageUseCase` connect `SubmitContactMessageUseCase.ts` to `ContactController.ts`?**
  _High betweenness centrality (0.301) - this node is a cross-community bridge._
- **Why does `SubmitContactInput` connect `SubmitContactMessageUseCase.ts` to `contactSchema.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `hits`, `contactTopics`, `TOPIC_LABEL` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._