I work on LLM systems where being wrong is expensive, and most of what I do is the unglamorous half of that: the evaluation harness before the feature, the cache, the idempotency, and the bug that was quietly eating a quarter of the results.

### Now

**Vantion** (Walnutech) · AI/ML Software Engineer Intern, LLM Systems · May 2026 to now

I own the matching side of an AI college-counseling product: which scholarships a student is actually eligible for, and in what order.

- Replaced LLM-judged eligibility with a deterministic rules engine at **0.999 precision on 1,382 awards**. Eligibility is a rules problem wearing an LLM costume, and rules do not drift between runs.
- Found and fixed a canonicalization bug that was hiding **~25% of eligible matches**, across a blast radius of 320 scholarships, with zero eligible-to-ineligible regressions in the sweep.
- Cut the reranker's LLM step from **17s to 3.8s median** by keying its scoring path on a short integer index instead of a 36-char UUID. The reply was output-token-bound, so the fix was making the model write less.
- Added rerank and embedding caches so a repeat match request makes **zero LLM calls**: 6.3s to 0.15s in cutover testing.
- Halved LLM extraction cost across **40,000+ scholarships** by batching pages under one shared prompt.
- Isolated failures across parallel LangGraph advisors, so one crashing agent no longer takes a student's whole chat turn with it.
- Moved background jobs onto a durable Postgres queue with a reconciler, because deploys were silently killing them.

Small company, small engineering team, so the surface is wide. Alongside the matching work above: the student web app made usable on phones and iPad in a 79-file change that closed 14 issues, deadline reminders that tell a student which answer would unlock more scholarships, and the production incidents when they happen. Closed source.

### Built on my own

**[job-market-crawler](https://github.com/harsh-chandak/job-market-crawler)** · Node.js, MongoDB, Playwright, Claude

A job-application pipeline that runs itself, and applies to real jobs with my own resume.

- Crawls **3,500 company career boards** across 9 ATS platforms, skipping 86% of 1M+ polls as unchanged via ETag and Last-Modified.
- Surfaces a quarter of new Greenhouse and Ashby postings **within 17 minutes** of going live, measured on 850 roles.
- Collapses duplicate listings of the same requisition (1,046 so far) and ranks everything deterministically before a single model call is made.
- Cut LLM cost per document **74%** with prompt caching, and by turning reasoning off on a selection step that did not need it.
- Rejects any generated resume line not found verbatim in a verified source, so it cannot invent a credential on my behalf.

**Job Alerts and Application Tracker** · Next.js, MongoDB, Puppeteer · [live demo](https://job-alerts-xg3m.vercel.app?demo=true)

The first version of the above. Scheduled Puppeteer scrapes, filtered by remote, stack and title before alerting, with JWT auth and multi-user tracking.

**[krr-project](https://github.com/harsh-chandak/krr-project)** · Clingo, answer-set programming · [live demo](https://krr-project.onrender.com)

Multi-robot movement, shelf handling and order fulfilment encoded as answer-set programs, solved for collision-free plans over a shared grid.

**[data-vis](https://github.com/harsh-chandak/data-vis)** · D3, GeoJSON · [live demo](https://data-vis-0eqs.onrender.com/)

Linked D3 views over public accident data, where a selection in one chart filters the map.

**[zk-coldchain](https://github.com/harsh-chandak/zk-coldchain)** · Circom, Solidity, Ethereum

Zero-knowledge proofs of cold-chain breach with automatic parametric payouts. Proves a shipment went above 8°C without revealing the temperature log: the raw readings stay private behind a Merkle root, the circuit proves the breach, and the contract settles the claim without a human dispute.

**TrustMed** · Rasa, Neo4j, Docker · a drug knowledge-graph assistant. Natural-language questions about active ingredients, generics and substitutes, answered over a medical knowledge graph rather than a search index.

Also: a Kafka to Neo4j streaming pipeline sustaining 5K events/min at sub-second latency in load tests, spatial hot-spot analysis in Spark and Scala, and a property-registration DApp in Solidity and Flutter.

### Before

**Arizona State University** · Software Engineer, AI Systems and Data Infrastructure · Aug 2025 to May 2026 · part-time alongside the M.S.

- Built a **200-input scoring harness first**, then halved candidates per input while malformed outputs fell ~20%. The harness came before the optimisation on purpose.
- LangGraph and WhisperX pipeline for an audio-to-image research pilot, 10K+ audio inputs.
- Telemetry ingestion for 2K+ events a day with idempotency and backpressure, P95 latency down ~45%.

**Neuromonk Infotech** · Software Engineer, Full-Stack and Product · Jan 2023 to May 2024

- Owned four ERP modules used by **70+ manufacturing clients**, serving 20K+ API requests a day.
- Rebuilt the accounting model for interstate GST and tax withholding. Errors hit zero.
- Cut dashboard load from 4-5s to under 2s by replacing per-product queries with joins and per-tenant caching.
- Ran live schema migrations in reversible stages with zero downtime, for clients whose factory floors run on the ERP.
- Integrated five payment gateways with idempotent retries, and prevented race conditions in concurrent transactions from corrupting client data.

### The rest

M.S. Computer Science, Arizona State University, 4.00. B.Tech Computer Engineering, Pune University, 8.52.

Python, TypeScript, SQL. FastAPI, Node, React, Next. Postgres, Redis, Mongo, Neo4j, pgvector, Kafka. AWS, Docker, Kubernetes. LangGraph, RAG, hybrid search, prompt caching, LLM evaluation.

Phoenix, Arizona. Open to SDE and AI roles.

[harsh-chandak.com](https://harsh-chandak.com) · [LinkedIn](https://linkedin.com/in/hnchandak) · harshnchandak@gmail.com
