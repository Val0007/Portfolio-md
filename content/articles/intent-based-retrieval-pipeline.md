# Building an Intent-Based RAG Pipeline

The first step was to build a tagger based on the book "White Nights" : that was a whole project in itself, read <a href="#articles/white-nights-tagging-experiments" class="article-open" data-tab="articles" data-slug="white-nights-tagging-experiments">Either I Am Bad at Reading White Nights, or LLMs Are Bad at Understanding Interpretative Literature</a>.

The gold set used here is a 10 `{question: answer_chunks}` set done manually.

## STEP 1 ⇒ A standard pipeline

I read a few articles on how to build a RAG pipeline that all suggested the same workflow to build a RAG system. So the first task was to get a baseline before trying different methods.

![Production pipeline overview](assets/images/retrieval-production-overview.png)

I found that not all questions are satisfied by the same retrieval method. "How did the narrator first meet Nastenka?" requires Event intent to carry more intent than lexical or general.

### The off-the-shelf intent classifier

This is basically it,

```python
_INTERPRETIVE_PATTERNS = [
    r"\bdoes (the book|this|it|the narrative|the story) (endorse|support|undercut|undermine|suggest|present|signal)\b",
    r"\bhow should we understand\b"

_MOTIVATION_PATTERNS = [
    r"^why does\b", r"^why did\b", r"^why would\b",
    r"\bwhat (is|was) \w+('s)? motivation\b",
]
_COMPARATIVE_PATTERNS = [
    r"\bcompare[ds]?\b", r"\bcomparison\b", r"\bdiffer(s|ing|ent|ence)?\b", r"\bmore than\b",
    r"\bless than\b", r"\bwhereas\b", r"\bversus\b", r"\bvs\.?\b",
    r"\bbetter\b.*\b(than|or)\b",
]
_EVENT_VERBS = [
    "meet", "meets", "met", "leave", "leaves", "left", "arrive", "arrives", "arrived",
    "marry"
```

```python
def classify_intent(query: str) -> str:
    q = query.lower()
    if any(re.search(p, q) for p in _INTERPRETIVE_PATTERNS):
        return "INTERPRETIVE"
    if any(re.search(p, q) for p in _COMPARATIVE_PATTERNS):
        return "COMPARATIVE_MULTI_HOP"
    if any(re.search(p, q) for p in _MOTIVATION_PATTERNS):
        return "MOTIVATION"
    if any(re.search(rf"\b{v}\b", q) for v in _EVENT_VERBS):
        return "EVENT"
    names = sum(1 for n in _CHARACTER_NAMES if n in q)
    if names >= 1 and any(re.search(p, q) for p in _RELATIONAL_WORDS):
        return "CHARACTER_RELATIONSHIP"
    if names >= 2:
        return "CHARACTER_RELATIONSHIP"
    if any(re.search(p, q) for p in _TEMPORAL_PATTERNS):
        return "TEMPORAL"
    if any(re.search(p, q) for p in _LEXICAL_STARTS):
        return "LEXICAL_FACT"
    return "GENERAL"
```

```python
WEIGHTS = {
    "EVENT":                  {"bm25": 0.2, "dense": 0.6, "metadata": 0.2},
    "LEXICAL_FACT":           {"bm25": 0.7, "dense": 0.2, "metadata": 0.1},
    "CHARACTER_RELATIONSHIP": {"bm25": 0.2, "dense": 0.4, "metadata": 0.4},
    "TEMPORAL":               {"bm25": 0.25, "dense": 0.55, "metadata": 0.20},
    "COMPARATIVE_MULTI_HOP":  {"bm25": 0.15, "dense": 0.45, "metadata": 0.40},
    "INTERPRETIVE":           {"bm25": 0.1, "dense": 0.6, "metadata": 0.3},
    "MOTIVATION":             {"bm25": 0.5, "dense": 0.35, "metadata": 0.15},
    "GENERAL":                {"bm25": 0.35, "dense": 0.45, "metadata": 0.20},
}
```

This is used to rerank the retrieved chunks using the three methods based on the weight, but that's only the fusion step. There's one more decision after the weights are blended into a single score: who does the final rerank, a formula or an LLM?

A cheap, deterministic bonus for candidates that literally contain the question's own content words added to their fused score. I am in disbelief that this worked on par with the (more on this down) **ReACT-LLM (thinks, rephrases, issues retrievals)** method (but is it due to our corpus? or can this be generalized? yet to be answered).

### Cheap rerank, plainly

It just takes the words in your question, ignores the boring ones (the, is, what, etc), and checks how many of the real words show up literally in each passage. More matching words, small bonus added to that passage's score.

```python
def rerank_scores(query, cand_ids, fused, bonus_weight=0.15):
    qwords = set(_tok(query)) - _RERANK_STOP
    if not qwords:
        return {cid: fused[cid] for cid in cand_ids}

    def score(cid):
        text_words = set(_tok(by_id[cid]["text"]))
        precision = len(qwords & text_words) / len(qwords)
        return fused[cid] + bonus_weight * precision

    return {cid: score(cid) for cid in cand_ids}
```

### What diversify does

If you'd read the tagging article (read it!) you would've noticed that our chunks are divided by scenes, so it won't make sense to include all chunks from a specific scene : this is intentional, as the answer may be in the chunks which are from a different scene, basically to let the model see more stuff across the board than from one specific scene. Does this undermine the rerank? Yes, but we are unsure where the answer lies, so this is a tradeoff.

Once everything is ranked, it walks down the list and picks the top ones, but it won't let more than 2 come from the same scene. So you don't end up handing the model six chunks that all basically say the same thing just because they happened to score similarly. If it runs out of room before hitting 6 because of that cap, it just fills the rest in with whatever's next in line.

```python
def _diversify(ranked_ids, k, per_scene):
    picked, counts = [], {}
    for cid in ranked_ids:
        s = chunk_to_scene.get(cid)
        if counts.get(s, 0) >= per_scene:
            continue
        picked.append(cid)
        counts[s] = counts.get(s, 0) + 1
        if len(picked) == k:
            return picked
    for cid in ranked_ids:            # cap too tight -> top up by pure relevance
        if cid not in picked:
            picked.append(cid)
            if len(picked) == k:
                break
    return picked
```

***TAXONOMY TIME:***

**HIT**: The gold set we use has a question and answer chunk mapping. If the retrieved top 6 passages contain the gold chunk, then that's a hit → the answering model can correctly answer using that.

Put together: classify, fuse, cheap rerank, diversify, answer. This scored 6/10 on the gold set, tuned across 3 rounds. New best of every method tried so far (plain hybrid retrieval sat at 5/10).

The one that actually worries me is what a miss does to the final answer, not just the score. Asked whether the story resolves, with zero Morning chapter chunks retrieved, the model answered *"The story does not provide a clear resolution for the narrator and Nastenka's relationship."* That's false. This breaks RAG and answering in general. 6/10 is still good but it's not perfect, and when you want perfect answers from a chat bot, I would quit in a second if the bot starts spewing BS answers like this. Not good.

![Production findings](assets/images/retrieval-production-findings.png)

***So now we have a baseline to judge our future experiments against. Let's build on this.***

## STEP 2 : LLM judge (crying sounds from my API credits)

Why not just let an LLM judge rerank the fused candidates? I tried that first, three separate times across earlier rounds, and got the same answer every time: the judge reliably demotes correct evidence specifically on interpretive/evaluative questions : exactly the question type this whole project cares about most.

![Production + LLM judge architecture](assets/images/retrieval-llm-judge-architecture.png)

The judge doesn't magically fix the bugs, cause it still relies on the chunks given to it. If the chunks themselves don't contain the answer, we still fail.

So the formula beats the judge on this fused pool. But is that actually about the judge being bad, or just about what it was being asked to judge? I stripped out the fusion AND the cheap rerank entirely to test it properly: union BM25's top 15, dense's top 15, and metadata's top 15, and give the unweighted pool straight to the LLM judge.

It crashed. 2/10, taking down 3 previously easy hits with it. Checked one directly : the correct chunk independently ranked top 3 on bm25, dense, AND metadata, confirmed present in the exact pool the judge was looking at, and it still didn't make the top 6. Not a visibility problem. The judge just doesn't prioritize this kind of passage for "does the book undercut this" framings, regardless of how it got there.

![Production + LLM judge findings](assets/images/retrieval-llm-judge-findings.png)

So this isn't "the judge is bad at reranking my particular fusion setup": it's the judge.

## STEP 3 ⇒ Let's get scientific

I read a really interesting paper for my other coursework [arxiv.org/pdf/2210.03629](https://arxiv.org/pdf/2210.03629) (ReAct) : it's basically forcing the model to think like a human: see, think, try again.

One continuously growing trace is the agent's entire memory, and at every step it gets exactly three moves: Search the book for real, Lookup within passages it already found (like Ctrl+F), or Finish.

Took four rewrites of the prompt to get anywhere. v1 (the faithful, plain version) scored 4/10 , worse than the simple pipeline , because its very first move was already a paraphrase of the question, and that alone was enough to lose a near perfect match. v2 added a much more detailed search strategy and a whole rubric for when to stop, and hit@6 went up to 5/10, but the stopping got WORSE, not better. v1 called Finish early on 2 of 10 questions. v2, with far more explicit guidance on exactly that behaviour, called it on 0 of 10. More instruction on the thing that was missing made that thing disappear entirely. v3 tried a more conceptual framing and regressed back to 4/10. v4 finally matched the pipeline's 6/10, but with three narrow, mechanical rules, not more elaboration.

![The loop (ReAct) architecture](assets/images/retrieval-loop-architecture.png)

Checked v4's traces directly: every single hit lands at the exact same rank the simple pipeline gets on its own, because the first rule forces the agent's very first move to just call the pipeline's own retrieval function on the literal, unmodified question. When that first call already works which is most of this gold set the rest of the loop just confirms it and never actually improves on it.

And the one thing every method here shares, formula, judge, and loop alike: one question whose gold passage never once uses the character's name, because the scene happens before she's introduced in the book. No amount of reasoning, rephrasing, or agentic looping gets around a name that isn't in the text being searched for.

![The loop (ReAct) findings](assets/images/retrieval-loop-findings.png)

## BONUS (I promise this is the last part): one example, through all three pipelines

Let's take one question and just follow it through everything above: "How does the narrator first meet Nastenka?"

The answer is a real scene in the book: a drunk man bothering a girl by the canal, the narrator steps in. Should be easy right? Except there's a catch (this is the really interesting part): at this point in the book, she hasn't been named yet. The whole scene calls her "the girl," never "Nastenka." So the moment I put her name in the question, I'm searching for a word that doesn't even exist in the passage I want back.

**Production**: the classifier reads "meet" and decides this is an EVENT question, so it leans mostly on the dense (meaning-based) search. Doesn't matter. bm25 barely finds it, dense barely finds it, metadata is a mixed bag too. None of the three signals are strong enough on their own, and blending three weak signals together doesn't magically make a strong one.

The model still answered, just pulled the wrong scene entirely (Nastenka and the narrator waiting for her lover, a totally different night) and said that's how they met. Sorry to the person who asked that question.

**Production + LLM judge**: one of the two correct passages does sneak into the pool this time through the metadata search, so the judge actually gets a shot at it. Whether it takes that shot isn't something I ever confirmed directly, but going by everything else this method did: it never once solved this question in any version I ran.

**The loop**: the agent searched six different times, rewording the question every time: "narrator first meets Nastenka," "meets Nastenka for the first time," "first meeting Nastenka," and so on. Every single rewrite still had her name in it. Never found the passage. Six attempts, six dead ends: the answer just doesn't contain the word it kept searching for.

You can rerank it, judge it, loop it, throw an agent at it, and none of that helps if the thing you're searching for isn't in the text at all.

## SO FINALLY: what did I learn? Or did I even learn something?

It depends. From what I can tell, everything is context dependent. This system dealing with interpretative texts is probably the hardest way to learn building a RAG system. If we wanted to build something on concrete texts where the answer is verbatim and nothing interpretative needs to be done, then a simple pipeline works is what I feel : but if you want to evaluate the text itself to make sure they pass certain criteria (or paraphrasing it to get better matches) before handing it off to the answering model, then an LLM would make high sense, and in a way more important. But then the next question from the devs would be: is this scalable? The answer to that is: "Let me get back to you on that"!

CAIO!

---

*This is the second article in the White Nights RAG series — read the first one: <a href="#articles/white-nights-tagging-experiments" class="article-open" data-tab="articles" data-slug="white-nights-tagging-experiments">Either I Am Bad at Reading White Nights, or LLMs Are Bad at Understanding Interpretative Literature</a>.*
