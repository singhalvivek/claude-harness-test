# Agent

> **This project has no agent/LLM layer — by explicit product decision.**

Wanderline is a pure **CRUD + media web application** (Next.js full-stack + Prisma/SQLite + `sharp` + Leaflet/OSM). The product owner explicitly excluded AI: there is **no LLM, no agent framework (LangGraph/CrewAI/etc.), no model calls, and no provider API keys**. Nothing in the product requires reasoning, generation, planning, or tool-calling by a model.

Because there is no agent graph, the usual contents of this file (state type, nodes, edges, error-handler/finalize nodes, concurrency, graph-assembly pseudocode) **do not apply**. This short note exists so the spec manifest's "agent file" requirement is satisfied without inventing a graph that would misrepresent the system.

What plays the role of "orchestration" here is ordinary request handling:

- **Deterministic route handlers** (`src/app/api/**`) parse a request, enforce owner auth, validate with `zod`, and call Prisma + the `PhotoStorage` interface + the Nominatim proxy. No branching model logic.
- The only external services are **OpenStreetMap Nominatim** (geocoding, proxied) and **OSM tiles** — neither is an LLM. See `architecture.md#external-dependencies`.
- **Observability** is still wired from day one, adapted to a no-LLM app: structured single-line JSON request/response logging (`method, path, status, ms`) to stdout via `src/lib/logger.ts`. There is no LangSmith tracing because there are no model calls to trace.

If AI is ever added later, replace this file with a full agent graph per `harness/patterns/agentic-ai.md` and add the corresponding phase.
