---
name: deep-research
description: >
  Use when the user asks to research, investigate, compare options, analyze a topic,
  find detailed information, fact-check claims, find out about something, or answer
  "what's the best", "pros and cons", "how does X compare to Y" questions.
  Conducts thorough multi-step research using WebSearch, WebFetch, and Agent subagents
  with iterative evidence gathering and cited sources. Covers product comparisons,
  technical deep-dives, historical analysis, library/framework research,
  and exploratory research.
---

## Thinking Framework

Before starting, classify the request:

| Question Type | Strategy | Example |
|---------------|----------|---------|
| **Convergent** (one right answer) | Verify across sources, stop when confirmed | "What's the max RAM for M4 Mac Mini?" |
| **Comparison** (pick among options) | Scan market, build shortlist, compare criteria | "Best e-reader under $300?" |
| **Landscape** (map the territory) | Survey broadly, cluster themes, identify gaps | "State of WebAssembly in 2026" |
| **Investigative** (understand why/how) | Follow causal chains, triangulate perspectives | "Why did Silicon Valley Bank collapse?" |
| **Technical** (library/framework/API) | Fetch official docs, cross-check with examples | "How does Next.js App Router caching work?" |

This classification drives tool selection, search strategy, source count, and report structure.

## Tool Strategy

| Question Type | Primary approach | Parallelization |
|---------------|-----------------|-----------------|
| **Convergent** | WebSearch + WebFetch, cross-validate if contested | Not needed — sequential is fine |
| **Comparison** | Parallel Agent subagents — one per option | 2-4 agents, each researches one option independently |
| **Landscape** | Broad WebSearch + Agent subagents per subtopic | 2-4 agents per identified theme/area |
| **Investigative** | WebSearch + WebFetch, follow causal chain | 2 agents: one for facts/timeline, one for analysis/perspectives |
| **Technical** | Official docs via WebFetch + WebSearch for community experience | 1-2 agents if multiple technologies involved |

When MCP tools are available (documentation lookup, AI model querying, etc.) — use them as supplementary sources at your discretion. Do not cite AI model responses as authoritative sources.

## Search Heuristics

- If first 3 results share a domain → **SEO bubble**, reformulate with different terms
- For controversial topics: explicitly search `"[topic] criticism"` and `"[topic] problems"`
- Domain-specific search: `site:arxiv.org` for academic, `site:reddit.com` for practitioner experience, `site:news.ycombinator.com` for tech community
- Include current year in query for fast-changing topics (frameworks, pricing, benchmarks)
- If WebSearch returns nothing useful → reformulate with synonyms, broader terms, or adjacent topics
- After forming an initial hypothesis → deliberately search for **counterarguments** before concluding
- For technical topics: search `"[library] gotchas"`, `"[library] migration issues"`, `"[library] vs"` to surface real-world experience

## Operating Rules

1. **Silence process noise.** Never expose tool errors, 403s, search result counts, or "I couldn't access..." in the final report. Silently switch to alternative sources.
2. **Deep-link only.** Link to specific pages, not homepages. Every major claim gets an inline citation: `(Source: <url>)`. Source hierarchy: official docs/specs > journalism/analysis > blogs.
3. Clarify only what changes the outcome (up to 3 questions). Triangulate key claims across 2+ independent sources. Surface contradictions — explain which source you trust more and why.
4. **Maximize parallelism.** Launch independent Agent subagents concurrently for independent subtopics. Do NOT use agents for trivially simple queries — a single WebSearch suffices.

## NEVER

- **NEVER cite a URL you didn't actually fetch** — hallucination risk: URL may not contain what you assume
- **NEVER treat SEO listicles as authoritative** — "Top 10 Best..." articles are ad-driven, not expert-driven
- **NEVER conflate data from different time periods** without noting the dates
- **NEVER use 3+ sources from the same parent domain** — diversify to avoid echo chambers
- **NEVER present aggregator summaries as primary sources** — trace back to the original; aggregators copy-paste without verification
- **NEVER include a source just to pad the list** — every citation must support a specific claim
- **NEVER show research scaffolding** — no intermediate notes, caches, or source dumps to disk
- **NEVER trust user-generated review scores at face value** — check review count, date distribution, and whether incentivized reviews are flagged
- **NEVER extrapolate from a single data point** — "Company X grew 200%" means nothing without base size and time period
- **NEVER search only for confirming evidence** — confirmation bias is the #1 research failure mode
- **NEVER cite AI model responses as authoritative sources** — use them only for cross-validation, never as evidence

## Research Workflow

The workflow is **iterative, not linear**. Phases B and C may repeat if evidence is insufficient.

```
A (frame) → B (discover) → C (extract) → Sufficiency Gate
                ↑                            ↓
                └──── NOT MET ◄──────────────┘
                                             ↓ MET
                                       D (synthesis) → E (report)
```

### Phase A — Frame the question
- Classify the question type (see Thinking Framework).
- Restate as a decision or research objective.
- Define evaluation criteria (explicit or implied by the user).
- Select tool strategy from the table above.
- **Checkpoint:** Can you proceed, or are clarifying questions needed?

### Phase B — Source discovery
- Apply search heuristics to avoid bubbles and bias.
- For complex topics: launch Agent subagents in parallel per the tool strategy table.
- **Checkpoint:** Sources from 3+ independent domains?

### Phase C — Evidence capture
- **Comparison**: fetch both retailer/product pages AND manufacturer specs.
- **Investigative**: fetch primary sources BEFORE secondary commentary.
- **Technical**: official documentation + community examples.

### Sufficiency Gate (mandatory)

| Signal | Meaning | Action |
|--------|---------|--------|
| All sources agree too neatly | Suspicious consensus | Search for the upstream original — they may share a single source |
| Key claim rests on 1 source | Evidence gap | Target this claim specifically in next B→C cycle |
| Numbers vary >20% across sources | Contradiction | Note the range, trust the most authoritative source, explain why |
| Latest source is >1 year old | Staleness risk | Flag explicitly in report, search for recent updates |
| Only promotional sources found | Bias risk | Search for independent reviews, academic analysis, community forums |
| All sources are blogs/opinion | Weak evidence base | Search for official docs, specs, primary data |

**Sufficiency thresholds by type:**

| Question Type | Sufficient when |
|---------------|-----------------|
| **Convergent** | Answer confirmed by 2+ independent sources |
| **Comparison** | 5+ options with comparable data points across key criteria |
| **Landscape** | 3+ distinct themes identified, each backed by at least 1 source |
| **Investigative** | Causal chain has no single-source-only critical links |
| **Technical** | Official docs consulted + at least 1 community source for real-world validation |

**If NOT sufficient** — iterate (max 3 total cycles B→C). Use different terms, angles, or source types. Do NOT repeat identical searches.

**Hard stop:** After 3 cycles, proceed with what you have. Mark under-supported findings as Low confidence and note gaps explicitly.

### Phase D — Synthesis
- Assign confidence levels:
  - **High** — 2+ independent sources agree (or official docs + community confirmation)
  - **Medium** — single authoritative source (or official docs without community validation)
  - **Low** — single non-authoritative source or conflicting data
- Identify trade-offs, gaps, and unresolved contradictions.

### Phase E — Report

Lead with TL;DR (3-7 bullets) — reader may stop here.

**Structural principles by type:**
- **Comparison** → always include a comparison table, always name top picks with rationale
- **Convergent** → answer first, then supporting evidence and confidence level
- **Landscape** → organize by themes, highlight trends and gaps
- **Investigative** → causal chain with contributing factors, open questions at the end
- **Technical** → key concepts, code examples, gotchas/caveats

**Report rules:**
- Every major claim gets inline citation: `(Source: <url>)`
- Address contradictions in-place, don't bury them in footnotes
- End with `### Sources` — bulleted list, deep-links only, never homepages
- Match user's language

## When Things Go Wrong

- **WebFetch fails on a key source** — try alternative URL (cached version, mirror, archive.org). Never cite a source you couldn't read.
- **Topic has < 3 online sources** — state limited availability. Lower confidence levels. Consider whether the question is too niche or too recent.
- **Agent subagent returns insufficient results** — resume with refined instructions or launch a new agent with different search terms.

## Quality Bar

- **Minimum 3 sources** for simple topics, **5+** for complex/controversial.
- Each major claim must have a citation.
- Contradictions must be addressed, not ignored.
- Technical claims should be backed by official documentation where possible.
