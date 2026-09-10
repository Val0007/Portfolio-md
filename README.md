# Portfolio

A markdown-driven portfolio site. Every tab reads directly from a `.md` file
in `content/` — edit the file, commit, push, and the live site updates. No
build step.

## Editing content

| Tab        | File                       |
|------------|----------------------------|
| Header     | `content/profile.md`       |
| Experience | `content/experience.md`    |
| Projects   | `content/projects.md`      |
| Education  | `content/education.md`     |
| Articles   | `content/articles.md` (index) + `content/articles/*.md` (full posts) |
| Fun Stuff  | `content/fun-stuff.md`     |

Each tab file is plain Markdown. Use `## Heading` to start a new entry (a
job, a project, an article) — each one is rendered as its own card, styled
differently per tab (a timeline for Experience, boxed tiles for Projects,
divided rows for Education, a headline list for Articles, playful dashed
tiles for Fun Stuff). Inside an entry, headings, bullet lists, links,
bold/italic, and code blocks all render normally. A trailing `---` divider
followed by italic text (like the "Edit this file at..." notes already in
each file) renders as a small note below the cards instead of inside one —
handy for your own reminders.

`content/profile.md` sets the page header:

```markdown
![Profile](assets/images/profile.svg)

# Your Name

Short tagline goes here.

## Links
- [LinkedIn](https://linkedin.com/in/yourname)
- [GitHub](https://github.com/yourname)
- [Email](mailto:you@example.com)

## Topics
- Distributed Systems
- Machine Learning
- Open Source
```

- The `![...](...)` image becomes your profile photo — replace
  `assets/images/profile.svg` with your own photo (e.g. drop in
  `assets/images/profile.jpg` and update the path), or just edit the path.
- The first `# ` line becomes your name.
- The next plain line becomes the tagline underneath it.
- The `## Links` list becomes the row of pill links (LinkedIn, GitHub,
  email, Substack, etc.) — each item must be a Markdown link
  `[Label](url)`. Use `mailto:` for the email one. Each link gets an icon
  based on its label (recognizes `LinkedIn`, `GitHub`, `Email`/`Mail`,
  `Substack`, `Twitter`/`X`; anything else gets a generic link icon) — the
  icon set lives in `LINK_ICONS` in `assets/js/main.js` if you want to add
  more or change one.
- The `## Topics` bullet list becomes the horizontally-scrolling chip row
  below the links. Add or remove `- item` lines to change it.

On mobile, both the tab bar and the topics row scroll horizontally with a
fade at the edges; on desktop the tab bar just wraps and doesn't scroll.

### Link previews

Add an optional `Link: <url>` line inside any entry (own line, anywhere in
the body) to attach a rich preview card:

```markdown
## Claude Code
A CLI tool for agentic coding.

Link: https://github.com/anthropics/claude-code
```

- A `github.com/owner/repo` link renders as a repo card (description,
  language, stars, forks) fetched live from GitHub's public API.
- Any other link renders a generic preview card (title, description, image)
  fetched via [microlink.io](https://microlink.io)'s free link-unfurling
  API.
- If neither lookup succeeds (offline, rate-limited, site blocks it), it
  falls back to a plain card with the domain and its favicon.

Both are free, keyless, CORS-enabled APIs called directly from the visitor's
browser — no backend involved. Worth knowing: this means a visitor's browser
sends the linked URL to microlink.io's servers for any non-GitHub link (not
any of the visitor's own data). microlink's free tier has a modest daily
rate limit shared across all its anonymous users; if a preview stops
resolving it'll just fall back to the plain domain card, nothing breaks.
Omit `Link:` on any entry to skip a preview entirely — see the "Random
fact" entry in `content/fun-stuff.md`.

### Writing full posts in-page (any tab)

Any entry, in any tab, can open its full content in an in-page reader
instead of cramming it into the card — no redirect, own URL, browser back
button works. Useful whenever one entry's full text would otherwise make
the whole grid too tall (a long write-up, a story, a deep dive), not just
for Articles.

Write the full piece as its own markdown file — in `content/articles/` for
the Articles tab, `content/fun-stuff/` for Fun Stuff, or a matching folder
for any other tab — then point the index entry at it with an `Article:`
line instead of a `Link:` line:

```markdown
## Why I Rebuilt My Portfolio in Markdown
*Sep 2026*

A short summary shown in the card.

Article: articles/rebuilt-portfolio.md
```

Then write `content/articles/rebuilt-portfolio.md` as a normal, full
markdown document — headings, subheadings, images, links, code blocks,
blockquotes, and tables all render:

```markdown
# Why I Rebuilt My Portfolio in Markdown

![Cover image](assets/images/article-cover.svg)

Intro paragraph.

## A subheading

More content, a [link](https://example.com), **bold**, `inline code`,
a fenced code block, a blockquote — all standard Markdown.
```

Important: image paths inside one of these files are resolved relative to
the **site root** (like everywhere else in this project), not to the file's
own folder — use `assets/images/whatever.png`, not
`../assets/images/whatever.png`. Drop your own images into
`assets/images/`.

For an externally-hosted post instead (Medium, Substack, your own blog
elsewhere), skip `Article:` and put the link in the heading itself instead:

```markdown
## [A Deep Dive I Wrote on Medium](https://medium.com/@you/post)
*Nov 2025 · Medium*

Summary shown in the card.
```

`Link:`, `Article:`, and neither can all be mixed freely across entries in
the same file — see `content/articles.md` (one of each) and
`content/fun-stuff.md` (a long fanfic teaser via `Article:` next to a
`Link:` preview card) for working examples. Clicking a card's title opens
the local reader in-page, opens the external link in a new tab, or does
nothing (plain text entries), whichever that entry is set up for.

## Local preview

No build step — just serve the folder over HTTP (fetch() won't work from a
`file://` URL):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, pick your default
   branch (e.g. `main`) and the `/ (root)` folder.
4. Save. The site will be live at `https://<username>.github.io/<repo>/`
   within a minute or two.

From then on, any push that changes a file under `content/` updates the live
site automatically — no rebuild required.

## Adding a new tab

1. Add a button in `index.html`'s `<nav class="tabs">` with a `data-tab`
   value, and a matching `<article class="tab-panel" id="panel-<tab>">`.
2. Add `<tab>` to the `TABS` array at the top of `assets/js/main.js`.
3. Create `content/<tab>.md`.
