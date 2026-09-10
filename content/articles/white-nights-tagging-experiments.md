# Either I Am Bad at Reading White Nights, or LLMs Are Bad at Understanding Interpretative Literature

The core idea at first was to build a intelligent RAG system over White Nights so that readers can argue with the author what the dreamer does — my specific question in fact was wanting to ask Dostoevsky "Why are your main characters so pathetic!"

But as the iterations went through I found that naive chunking and tagging were not producing the results I wanted. This led me down the black hole of wanting to understand why, and conduct different tagging experiments using my trustable friend with no guarantees, Claude.

The tldr is this:

It depends. Yes sure, but why? When taking a text as White Nights which is highly interpretative, even humans can't rightly say this is what the author intended — in that case how can you ask an LLM to rightfully classify things like narrative relation etc. When you attempt to generate all these things using a chunk at one shot, it fails miserably.

So the answer is to break it down for the tagging model to make its life easier. How?

This involves first breaking down the novel into a global map, scene cards, and lastly tagging the chunks with metadata.

I went ahead with naive chunking them at 350 tokens per chunk, the total coming to 84 chunks for the whole book. Each night in the book is highly correlated to the successive nights — with a small corpus of chunks, the semantic similarity across the chunks is very close, which is also what makes retrieval difficult, but that's another whole article in itself!

## Global map

Before any chunk gets tagged, the whole novel gets summarized into one JSON object — this acts as the book's own ground truth, basically. I feed the model all 27 scene cards (below) and ask it to synthesize: the Dreamer's arc, Nastenka's arc, the relationship arc, major turning points, what actually gets resolved, and what's deliberately left open. This is the thing a chunk-level tagger can't see on its own — how the book ends up treating an idea it introduces on page one. This becomes really important when we want to know how each chunk stands on a global context — not to retrieve the right passage faster, but so the answering step doesn't take that passage at face value later. More on that below.

One real excerpt from `global_map.json`:

> **major_turning_points:** "The narrator intervenes to protect Nastenka from a drunken man, marking the beginning of their connection." ... "Nastenka's decision to marry the lodger serves as the climax of their relationship, resulting in the narrator's heartbreak."
>
> **important_open_questions:** "Nastenka's true feelings for the narrator versus her commitment to the lodger are left ambiguous, raising questions about the nature of love and choice."

The model is explicitly barred from interpreting the text. It is asked to only produce the facts. These rules matter a lot as we want interpretation at the chunk level using these as the ground truths, not something the model generated token by token.

## Scene cards

One level down from the global map. The 84 chunks get grouped into 27 scene cards (a scene ends when the location, time, topic, or narrative mode shifts — a Night is not one scene, it's several), and each scene gets its own evidence card: summary, characters present, beliefs/feelings expressed, developments, consequences. Evidence only, no interpretation. Again, all these rules have to be manually written into the prompt as rules. Lot of work!

Example, scene 1 (the narrator wandering Petersburg, everyone's left for the summer):

> **summary:** "The narrator reflects on a beautiful night in Petersburg, feeling a deep sense of loneliness... he has developed a peculiar attachment to the people and buildings of Petersburg, feeling a sense of friendship with an old man he sees regularly and personifying the houses he passes."
>
> **important_beliefs_or_feelings:** Loneliness, Despondency, Attachment to familiar faces and places, Fear of abandonment

So by the time a chunk actually gets tagged, it has the global map (the whole book's arc) and its neighboring scene cards (the local plot) sitting next to it as context.

The question the rest of the article is actually about: does giving the tagger all that scaffolding help, or does it just create new ways to be wrong?

Let's come to the meat of the article: the findings!

### Why narrative_relation at all?

When the model answers a question using a chunk, I didn't want it to treat whatever that chunk says as the book's final word. Say a chunk has the Dreamer saying "I am happy" — that's just a happy sentence. But it comes tagged `narrative_relation: undermines`, which means: the book itself doesn't let this stand — a few scenes later, this exact happiness gets taken apart. So the answering model isn't just reading the passage, it's reading the passage plus a note saying "don't trust this at face value." The model can answer as Dostoevsky while still knowing which of the Dreamer's own beliefs the book is quietly demolishing behind his back. This is — again, my own understanding — the same reason for additional fields like canonical themes and speaker_relation.

## F1: Context vs. local chunks for tagging narrative_relation

Take 5 chunks, tag `narrative_relation` (does this passage support, complicate, undermine, or leave unresolved the book's stance on something) two ways: once with just the chunk and its immediate neighbors, once with the full global map + scene cards sitting next to it. Only the context changes.

Local basically gave up and said "unresolved" on almost everything. Context-aware actually discriminated — caught that the Fourth Night's "now I am happy" moment gets undone one scene later, caught that the farewell letter denies the Dreamer's hope. This is a win, right?

Except — one of those five rows had a hidden bug: the context-aware run got the narrative call right but messed up who was speaking in the passage (Nastenka became the Dreamer).

The next step was to stop guessing if the answer was right. Made 7 gold chunks (the ground truth we rely on to score recall and stability).

![F1 — First result](assets/images/f1-first-result.png)

## MORE CONTEXT DOESN'T MEAN MORE ACCURACY

The win I thought I saw in round one wasn't the context data at all — it was that I'd also improved the prompt's instructions at the same time (basically told it "stop defaulting to unresolved, actually think about how the book resolves this").

![F5 — The correction](assets/images/f5-the-correction.png)

## Doing it properly

Created a 30-chunk gold set, all manually tagged, to measure the accuracy across arms.

This table made it clear that each field requires its own context:

- `narrative_relation` — needs the global map specifically. Scenes alone are actually worse than no context (37% vs 43%) — the neighboring scene cards don't add much, the global map helps it match the chunk to the overall text.
- `canonical_themes` / `characters_present` — need scene cards more than the map. These track the passage's own neighborhood for continuity, not the whole book's arc.
- `speaker_relation` — adding context here just diminishes the results. Every context arm ties at 30%, local wins outright at 37%. Adding any context here is actively harmful, not neutral. This also logically makes sense to me (again, my own understanding) as speaker_relation only deals with the current chunk itself, and adding more context makes it see something else it shouldn't.

So much for "more context = better." Not true.

![F8 — Core ablation](assets/images/f8-core-ablation.png)

If the results show that we need different contexts for answering different tagging fields, the results should say the same when we convert a single pass into 3 different phases of tagging, right? Not quite.

## A 3-pass pipeline

A single 190-line system prompt that generated 7 fields at once is stripped into 3 prompts, and context gets added at each step. Each chunk gets its total tags decided in pieces, across three separate passes, instead of all at once.

![F9 — Three-pass architecture](assets/images/f9-three-pass-architecture.png)

The single-call prompt's strength here was never in what it said. It's in what it didn't have to say, because deciding `speaking_voice` in the same breath as `characters_present` keeps the model from confusing the narrator with everyone else, automatically, for free. Split those two decisions into separate calls, and that free judgement disappears — the isolated pass needs to be told explicitly what the combined pass never had to think about. Pass 2 already has more rules for this field than the original prompt ever did, and it's still short of matching it. So the honest place to leave this one: `characters_present` isn't a field this architecture has solved. Even getting one field wrong brings down the accuracy when our whole gold set is only 30 tuples. But this is still something to think about.

![F9 — Final results](assets/images/f9-final-results.png)

## A bigger problem

When the model can't make its own decision, it starts to hide behind rules given.

The original prompt, when dealing with narrative_relation, defaults to `unresolved`. When you tell it don't use `unresolved` everywhere, it defaults to using `undermines` everywhere. Although this isn't logically wrong (again, my own understanding — the whole book does undermine the narrator's relationship), add an explicit guard against that and now it defaults to `complicates` (the label literally described in my own prompt as "the safe middle, not full endorsement or exposure" — so of course that's where it retreats to). Meanwhile `unclear`, the actual correct answer for "no evaluated idea is present here," never once cleared 20% recall, across five completely different prompt rewrites.

Tightening a guard doesn't teach the model to discriminate. This brings in the question: does adding examples help generally trained models?

![F12 — Whack-a-mole](assets/images/f12-whack-a-mole.png)

I read a few papers where adding examples helped the model take better decisions, but adding too many examples bloats not only the prompt but also the context. The context in a sense becomes diluted and the model confuses on which to use, regressing the results.

![F11 — Examples vs rules](assets/images/f11-examples-vs-rules.png)

9 gold contrastive examples for speaker_relation: real passage text paired with the correct `asserts`/`doubts`/`explores` label and a one-line rationale, added after finding that this specific field responds to contrastive examples far better than abstract rules.

## Critic → fixer → patch loop

Using the gold set, I tried one last experiment: have 2 LLMs going back and forth on prompt fixing.

The Critic reads the current prompt's predictions against the 30-chunk gold set and diagnoses failure patterns, explicitly split into "the prompt caused this" vs. "this is just model error the prompt can't fix."

The Fixer takes only the critic's top-priority pattern (never a batch of them) and writes an exact, minimal find-and-replace patch — a literal text edit, not a rephrasing suggestion.

The patch gets applied by exact string match, the affected pass gets rerun on all 30 gold chunks, and the before/after score is compared mechanically. If it doesn't measurably improve, it's reverted immediately and the loop moves to the next round.

I thought this could fix most of the remaining prompt issues. Turns out, not really.

What it bought: one real, kept improvement out of 5 total patch attempts across all three passes — a dual-voice scanning fix for `speaking_voice` (90% → 93%). Everything else was flat or a regression and got thrown out, including a second attempt aimed specifically at `speaker_relation` on top of the gold examples above, which regressed it twice and got reverted both times. Although this is still an improvement, it shows the amount of iteration required to tag interpretative text.

Thus Config G becomes the default pipeline — but at this point we've probably over-engineered for a small problem. Like taking a canon to shoot a fly.

![F13 — Locked config G](assets/images/f13-locked-config-g.png)

Thus ends the tagging experiments for the novel White Nights. Still, whether our pipeline has succeeded or not is entirely subjective at the end of the day, but from what we had as our baseline, this is an improvement, and by a margin. Also made me understand how important tagging metadata is for a RAG pipeline.
