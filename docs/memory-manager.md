# Craig's memory manager

Design note, 11 August 2026. Verified against the repo at `e4a8e85` and against
current OpenAI documentation rather than remembered. SDK in use:
`@openai/agents` **0.14.3**.

Four layers over one original, a session that summarises instead of forgetting,
and one hosted tool we are turning down on purpose.

## The short version

**Build the synopsis layer. Don't build the knowledge table. Replace the
40-turn trim with a summarising Session.** Steps 2 and 3 have since shipped —
see the two "what shipped" sections at the end. Decline hosted file search. Build
evals first, because none of this is measurable without them.

Three of the five proposed layers are already shipped — the raw file, the
extracted text, and the notebook. One is new and worth building. One should not
be built. Reading the SDK then added a sixth item nobody proposed, and it is
arguably the most valuable thing here.

## The stack

One original, three derived artefacts, each cheaper and more selective than the
one below it. A question is answered at the top of the stack and only reaches
down when it has to.

### L0 · Original — SHIPPED

The bytes as uploaded. Never read by a model; served to people through
short-lived signed URLs.

`documents` private bucket · `{account_id}/{document_id}` · 60s signed URL ·
25 MB · 8 mime types

### L1 · Extracted markdown — SHIPPED

Full text, lexically searchable. Exact and cheap, with no sense of meaning —
this is the layer that fails on *"what should I wear"* against a heading that
says *"Dress code"*.

`documents.extracted_text` · generated tsvector + GIN ·
`search_shared_documents(account, query, limit)`

### L2 · Synopsis — SHIPPED

One short natural-language card per document, written at upload. Its job is
**routing, not answering** — it says what questions this document can settle, so
Craig picks the right one before spending tokens on it.

This is where semantic matching comes from without a vector store: a synopsis
contains the words a heading never had.

`documents.synopsis` · ~50 tokens · regenerated on re-upload · never quoted as
fact

Two constraints, both already learned here:

- **Regenerate on re-upload**, or it lies. Three derived artefacts from one
  original is three chances to be stale, and the proposal has no versioning
  story.
- **The caveat goes in the tool result** — *"this is a synopsis; open the
  document to answer from it."* This is #85's lesson one layer up, and it is the
  one class of error the synopsis layer would otherwise introduce.

### L3 · Notebook — SHIPPED

The company in prose, and Craig's only long-term memory. Same two-step shape the
synopsis layer copies: a cheap index in the prompt, one section fetched on
demand.

heading index ~60 tokens · `sectionOf()` scored: exact → heading-contains →
query-contains, longest first

### Knowledge table — DON'T BUILD

This is `facts: {key,value}[]` returning under a new name, deleted deliberately
in #83. Everything proposed for it already has a home: structured facts in
`record_fact`, proposals in `notebook_notes`, prose in the notebook.

Adding it creates a second source of truth about the same company, and two
places that can disagree. "Long-term is the notebook and nothing else" is
load-bearing, not a gap.

Reopen only when it can name something the notebook provably cannot hold.

## Two findings from checking the SDK

### The admin's Craig cannot read documents at all

`src/lib/craig/craig-agent.ts` defines ten tools — `add_step`,
`draft_workflow`, `note_gap`, `offer_new_workflow`, `read_notebook`, `recall`,
`record_fact`, `remove_step`, `rename_workflow`, `set_step_config`. Not one of
them touches a document, and nothing about documents reaches its prompt either.
`src/lib/craig/joiner-agent.ts` has `search_resources`.

So the person who uploads the handbook cannot ask Craig anything about it — and
the new starter can.

That reframes the synopsis layer. It is not a retrieval upgrade on a working
feature; it is the thing that closes a gap where one audience has document
access and the other, the one who paid for it, has none.

### Short-term memory is the weaker half, and it wasn't in the proposal

Craig trims: `MAX_MESSAGES = 40` (`src/lib/craig/contract.ts:149`), applied
client-side, hard cut, oldest dropped. Joiner threads cap at 24.

OpenAI's own context-engineering guidance sets trimming and summarisation side
by side and is direct about when each belongs — trimming when *"tasks are
independent"* and *"useful context is local"*; summarisation when you *"need
continuity over long horizons and must retain decisions and constraints"*.

Discovery is the second case. It is one long interview toward a single goal,
where "we're twelve people and fully remote" is said at turn three and has to
still be true at turn forty. Craig is using the technique documented for the
opposite shape of conversation, and the SDK ships the right one.

**The document layers are the visible half of memory. The 40-turn cliff is the
half that silently drops what a customer already told him — and it is a smaller
change than the synopsis layer.**

## Compatibility with the Agents SDK

Everything the design needs is native. Nothing here fights the SDK, and two
pieces of it are already installed and unused.

| Design element | SDK mechanism | Verdict |
| --- | --- | --- |
| Synopsis router | `tool()` + zod, scope via `RunContext` | Native |
| Notebook read | `tool()` — already built | No change |
| Caveat travelling with retrieved text | `defineToolOutputGuardrail` | Upgrade |
| Conversation history | custom `Session` over Supabase | Replaces trim |
| Compaction | `OpenAIResponsesCompactionSession` | Reference impl |
| Document retrieval | `fileSearchTool` + vector stores | **Decline** |
| Unbounded tools from the block creator | `toolSearchTool` | Later |
| TFN pasted into open chat | `defineToolInputGuardrail` | Pairs with retention |

The guardrail row is the quiet win. The rule that fixed grounding — *a
constraint on how to use retrieved text belongs in the tool result, not the
preamble* — is currently a string each tool remembers to append by hand. A
tool-output guardrail is the structural version, applied once across the
notebook, the synopsis and `search_resources`.

On Sessions: implement the interface over the existing Supabase threads. Do
**not** reach for `OpenAIConversationsSession` — it stores history on OpenAI's
side, which is the same data-residency objection as the vector store below.

## Why we decline hosted file search

It is the obvious answer and it would work. It is still wrong for this product,
on architecture rather than quality.

1. **It puts tenant data somewhere the erasure cascade cannot reach.** #88, #89
   and #90 exist to make deletion real all the way down to object storage. A
   vector store is a second copy with its own lifecycle, and it reopens the
   thing that was just closed.
2. **Its access filters are call-time parameters.** Craig's boundary rule is the
   opposite: `visibility = 'shared'` is written into the SQL function body, and
   a joiner tool *may take a question and must never take an identifier*.
   Attribute filters passed alongside the query are exactly the shape that rule
   rejects.
3. **It complicates the retention work that is next.** Destroying a tax file
   number on schedule is harder when the content also lives in a third-party
   index that answers to a different clock.

The synopsis layer buys most of the semantic win for none of that. If the corpus
ever grows past what lexical search plus routing can carry, hybrid retrieval
inside Supabase is the next move — not a hosted store.

### It is not slower, which was the obvious objection

Hosted tools run inside the same Responses request, so `fileSearchTool` saves
the round trip a function tool costs: model → Vercel → Supabase → a second
request to OpenAI. That is a real advantage and worth stating plainly.

Three things shrink it to near nothing at this size:

- **The search itself favours Postgres.** A GIN tsvector hit over a handful of
  rows is sub-10ms; `file_search` has to embed the query and run vector
  retrieval. We are not saving search time, only a network hop.
- **Prompt caching absorbs most of that hop.** Caching is automatic above 1024
  tokens, and the second request in a tool loop shares its whole prefix with the
  first — a hit "decreases latency and bills those tokens at the cached-input
  rate". The assumption that a tool loop costs a full second prefill is wrong
  when the prefix is stable.
- **Round-trip *count* dominates round-trip cost.** A tool that misses costs an
  entire extra loop. Better recall is a bigger latency win than faster
  execution, and recall is what L2 is for.

**Unrelated freebie:** Craig does not set `prompt_cache_key`. It costs nothing
and measurably raises hit rate; thread id is the natural key. Worth doing
whatever else happens here.

## Preload or fetch the synopsis index

Latency and boundedness pull in opposite directions, so this is a size-dependent
call rather than a rule:

| Corpus | Synopsis index | Why |
| --- | --- | --- |
| ≲ 50 docs | Preloaded into the prompt | Cached after the first turn, so routing costs **zero** extra round trips — faster than `fileSearchTool`, which always costs one hosted search |
| ≳ 50 docs | Behind a tool call | The index stops being worth carrying on every turn, most of which are not document questions |

Preloading only works while the index sits in a stable prompt position. If it
moves or churns, the cache misses and the argument collapses.

## What a question costs

Storage is irrelevant; the number that matters is tokens per question. The
synopsis layer is paid only on document questions, and it replaces a search that
can currently return nothing while leaving Craig unaware a relevant document
existed.

| Path | Loaded every turn | Fetched on demand | Per question |
| --- | --- | --- | --- |
| Notebook question (today) | ~60 | 1 section | 600–1,000 |
| Document question (today, joiner) | 0 | tsvector hits | 400–900 |
| Document question (today, admin) | 0 | — | no access |
| Document question (with L2, 20 docs) | 0 | ~1,000 routing + 1 doc | 1,400–2,000 |

Whether the synopsis index is preloaded or fetched is a size call — see above.
Either way it is **scoped to the account and bounded by the corpus**, which is
what a knowledge table would have broken: that grows with everything Craig has
ever learned, and there is no size at which carrying it every turn stays cheap.

## Order of work

1. **Evals.** Every change here is a retrieval-quality change, and retrieval
   quality is invisible without them. OpenAI's own context-engineering guide
   lands on the same sentence: *evals is all you need for context engineering
   too*.
2. **The summarising Session — SHIPPED.** Built as compaction over the stored
   transcript rather than as an SDK `Session`: the history is already in
   `messages`, so what was missing was the server reading it. See below.
3. **The synopsis layer — SHIPPED**, with the admin document tool alongside it.
   See below.
4. **The tool-output guardrail**, folding the #85 rule into one place across all
   three retrieval tools.

Retention and destruction for sealed answers stays ahead of all of it. That is a
legal obligation with no code behind it; this is a quality improvement to
something that already works.

## What shipped for step 2

`compaction.ts` decides where to cut (pure, 14 tests). `summarise.ts` writes the
summary once and stores it on the thread. `history.ts` joins the stored
transcript to what the browser still holds and hands Craig the result.

**Not an SDK `Session`.** The abstraction fits, but the conversation was already
in `messages` — what was missing was the server reading it. A `Session` would
have added an indirection over a table this code already owns, and the
OpenAI-hosted variants carry the residency objection that rules out the vector
store.

**A prerequisite bug came out of it.** The browser sent `seq` as its own array
index, and the browser trims to `MAX_MESSAGES` — so past that length every index
shifted and each new turn was numbered over one already stored, with
`serialise()` omitting position so nothing ever re-synced to correct it. Any
conversation long enough to need compaction would have been reassembled in an
order nobody said it in. The column now defaults from a sequence and is never
written by hand. Latent when found: no thread had passed 12 messages, so there
was nothing to backfill.

**The joiner route is untouched.** It caps at 24 messages and those
conversations are short by design; if that changes, `historyFor` is the piece to
reuse.

## Is this what contemporaries are doing?

Broadly yes, with one nuance that matters.

The field moved **away from pipeline RAG** (chunk everything → embed → top-k →
stuff the context) **toward agentic retrieval**: give the model a cheap index and
let it search iteratively. The current vocabulary is "context engineering" rather
than "RAG".

Patterns this design matches well:

- **Progressive disclosure** — metadata first, full content on demand. The
  heading index is this; per-doc synopses extend it one level up.
- **Memory as files outside the context window** — the notebook is this, and it
  is the pattern that won.
- **Human-gated writes** — Craig proposes, a person accepts. Most autonomous
  memory systems are still fighting the corruption problem this designs out.

Where we knowingly differ: no embeddings, no cross-thread recall, no compaction.
All defensible at this scale. The one to revisit first is not embeddings — it is
that hybrid lexical+semantic genuinely does beat either alone once a corpus is
large. At zero-to-twenty documents it is not close to worth it, and the synopsis
layer buys the runway.

## What shipped for step 3

`documents.synopsis`, written at upload from the extracted text by
`synopsis.ts`, plus `backfillSynopses` for anything uploaded before it existed
(run via `after()` off the documents list, so nobody waits on it).

**The admin can read documents now.** `read_document` on `craig-agent.ts`, with
the routing cards resident on the prompt beside the notebook headings — the same
index-then-fetch shape, for the same reason. `document-match.ts` scores names
the way `sectionOf` scores headings, because first-past-the-post lets
"Handbook" shadow "Remote working handbook".

**The joiner got it for free.** The synopsis is folded into the `search`
generated column, so no new tool and no change to the access boundary — the
scoping still lives in `search_shared_documents` with `visibility = 'shared'` in
the function body.

Verified on a real uploaded handbook: **"communicate", "inaccurate", "members"
and "overview" are all in the card, none of them in the document, and the search
vector matches all four.** That is the semantic win the design claimed, without
embeddings and without a second copy of anyone's data.

**Still open at this layer:** a read returns up to 8,000 characters and says so
when it truncates. Section-level retrieval *within* a document — the `sectionOf`
treatment — is the obvious next refinement and was not needed to close the gap
this step was about.
