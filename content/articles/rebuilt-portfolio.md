# Why I Rebuilt My Portfolio in Markdown

![Cover image](assets/images/article-cover.svg)

Most portfolio sites need a server, a CMS, or hours babysitting a static
site generator's build pipeline. I wanted something simpler: **edit a text
file, push, done.**

## The problem with hosting articles elsewhere

Every time I wrote something on Medium or Substack, I was sending readers
off my own site — into someone else's design, someone else's ads, someone
else's paywall. If I ever changed platforms, every link I'd shared would
break.

## The solution

This entire site — including the article you're reading right now — is
just:

- a handful of `.md` files in a `content/` folder
- a small [marked.js](https://marked.js.org/) parser
- vanilla HTML/CSS/JS, no build step

```js
fetch(`content/articles/${slug}.md`)
  .then((res) => res.text())
  .then((md) => marked.parse(md));
```

That's really it. No server, no database, no CMS login — just a markdown
file that gets fetched and rendered client-side when someone clicks in.

> If you can write a text file, you can publish here.

## What's next

I'm planning to add a few more posts here over time — mostly notes on
things I'm building. Thanks for reading.
