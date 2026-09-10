// Fetches Markdown from /content and renders it into the matching tab panel.
// To add a new tab: add a button in index.html with a data-tab, a matching
// #panel-<tab> element, and a content/<tab>.md file.

const TABS = ["experience", "projects", "education", "articles", "fun-stuff"];
const cache = {};

// Pulls a `Label: value` line out of a markdown body (own line, anywhere),
// returning the value and the body with that line removed. Tolerates a
// stray space before the colon (`Label : value`), a common typo.
function extractField(bodyMd, label) {
  const regex = new RegExp(`^${label}\\s*:\\s*(\\S+)\\s*$`, "im");
  const match = bodyMd.match(regex);
  return { value: match ? match[1] : null, rest: bodyMd.replace(regex, "").trim() };
}

// Splits markdown into entries at each `## Heading`, keeping each entry's
// body as raw markdown to be rendered separately inside a card. A `Link:
// <url>` line is pulled out as an external preview-card link; an `Article:
// <path>` line is pulled out as a path (relative to content/) to a local
// markdown file that opens in the in-page article reader instead.
function splitEntries(md) {
  const lines = md.split("\n");
  const entries = [];
  let current = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (current) entries.push(current);
      current = { title: h2[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) entries.push(current);

  return entries.map((e) => {
    // A stray `---` between entries has no meaning here (cards are already
    // visually separated) — drop it rather than rendering a bare <hr>.
    const bodyLines = e.body.filter((line) => !/^-{3,}\s*$/.test(line.trim()));
    let bodyMd = bodyLines.join("\n").trim();
    const linkField = extractField(bodyMd, "Link");
    bodyMd = linkField.rest;
    const link = linkField.value && /^https?:\/\//i.test(linkField.value) ? linkField.value : null;

    const articleField = extractField(bodyMd, "Article");
    bodyMd = articleField.rest;
    const articlePath = articleField.value || null;

    return { title: e.title, bodyMd, link, articlePath };
  });
}

function slugFromPath(path) {
  return path.replace(/^.*\//, "").replace(/\.md$/i, "");
}

// Maps "<tab>/<slug>" -> path (relative to content/), populated whenever a
// tab is rendered so the in-page reader can look up what to fetch. Any tab
// can use this, not just Articles — an entry with an `Article:` line opens
// in the reader instead of showing its full body inline.
const readerIndex = {};

// Renders a tab's markdown as a list of cards, one per `## Heading` entry.
// A trailing `---` divider *after the last entry* (used for the "how to
// edit this file" note at the bottom of each content file) is rendered
// separately, outside the cards. Any `---` a user places between entries
// is ignored for this purpose — see the comment in splitEntries — so it
// can't accidentally swallow a later entry into the footnote. tab name
// controls the card layout via the `cards--<tab>` / `card--<tab>` classes
// in style.css. Falls back to plain rendering if there are no `##`
// headings at all. Every tab also gets an (initially hidden) in-page reader
// container appended, used to show a full local markdown file inline when
// an entry has an `Article:` line — handy any time an entry's full content
// would make the card grid too tall (a long story, a full write-up, etc).
function renderTabHTML(tab, md) {
  const headings = [...md.matchAll(/^##\s+.+$/gm)];
  const searchFrom = headings.length ? headings[headings.length - 1].index + headings[headings.length - 1][0].length : 0;
  const dividerMatch = md.slice(searchFrom).match(/\n-{3,}\s*\n/);
  const dividerIndex = dividerMatch ? searchFrom + dividerMatch.index : -1;
  const cardsMd = dividerIndex !== -1 ? md.slice(0, dividerIndex) : md;
  const noteMd = dividerIndex !== -1 ? md.slice(dividerIndex + dividerMatch[0].length) : "";

  const entries = splitEntries(cardsMd);
  if (!entries.length) return marked.parse(md);

  const cards = entries
    .map((e) => {
      let titleHTML;
      if (e.articlePath) {
        const slug = slugFromPath(e.articlePath);
        readerIndex[`${tab}/${slug}`] = e.articlePath;
        titleHTML = `<a href="#${tab}/${slug}" class="article-open" data-tab="${tab}" data-slug="${slug}">${escapeHtml(e.title)}</a>`;
      } else {
        titleHTML = marked.parseInline(e.title);
      }
      return `
      <article class="card card--${tab}">
        <h3 class="card-title">${titleHTML}</h3>
        <div class="card-body">${marked.parse(e.bodyMd)}</div>
        ${e.link ? `<div class="link-preview" data-url="${escapeHtml(e.link)}"><div class="preview-skeleton"></div></div>` : ""}
      </article>`;
    })
    .join("");

  const note = noteMd.trim() ? `<div class="tab-note">${marked.parse(noteMd)}</div>` : "";
  const reader = `<div class="article-reader" id="${tab}-reader" hidden></div>`;

  return `<div class="cards cards--${tab}" id="${tab}-list">${cards}</div>${note}${reader}`;
}

// Fetches and swaps in a rich preview card for every `.link-preview`
// placeholder inside a panel. GitHub repo links use GitHub's public API
// (CORS-enabled, no key needed); everything else uses microlink.io's free
// link-unfurling API. Failures fall back to a plain favicon + domain card.
async function hydrateLinkPreviews(panel) {
  const nodes = [...panel.querySelectorAll(".link-preview[data-url]")];
  await Promise.all(
    nodes.map(async (node) => {
      node.innerHTML = await buildPreviewCard(node.dataset.url);
    })
  );
}

const previewCache = new Map();

async function buildPreviewCard(url) {
  if (previewCache.has(url)) return previewCache.get(url);
  const promise = (async () => {
    try {
      const gh = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/\s]+)\/([^\/\s#?]+)\/?$/i);
      return gh ? await buildGithubCard(url, gh[1], gh[2]) : await buildMicrolinkCard(url);
    } catch (err) {
      return fallbackPreviewCard(url);
    }
  })();
  previewCache.set(url, promise);
  return promise;
}

async function buildGithubCard(url, owner, repo) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!res.ok) throw new Error("github api error");
  const data = await res.json();
  const desc = data.description ? `<p class="preview-desc">${escapeHtml(data.description)}</p>` : "";
  const meta = [
    data.language ? `<span class="preview-tag">${escapeHtml(data.language)}</span>` : "",
    `<span class="preview-tag">★ ${data.stargazers_count}</span>`,
    `<span class="preview-tag">⑂ ${data.forks_count}</span>`,
  ]
    .filter(Boolean)
    .join("");
  return `
    <a class="link-preview-card link-preview-card--github" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      <div class="preview-main">
        <div class="preview-title">${svgIcon(LINK_ICONS.github, "preview-icon")}<span>${escapeHtml(data.full_name)}</span></div>
        ${desc}
        <div class="preview-meta">${meta}</div>
      </div>
    </a>`;
}

async function buildMicrolinkCard(url) {
  const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error("microlink error");
  const json = await res.json();
  if (json.status !== "success") throw new Error("microlink status");
  const d = json.data;
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const image =
    d.image && d.image.url
      ? `<div class="preview-image" style="background-image:url('${escapeHtml(d.image.url)}')"></div>`
      : "";
  const desc = d.description ? `<p class="preview-desc">${escapeHtml(truncate(d.description, 140))}</p>` : "";
  return `
    <a class="link-preview-card" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      ${image}
      <div class="preview-main">
        <div class="preview-title">${escapeHtml(d.title || domain)}</div>
        ${desc}
        <div class="preview-domain">${escapeHtml(domain)}</div>
      </div>
    </a>`;
}

function fallbackPreviewCard(url) {
  let domain;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch (err) {
    domain = url;
  }
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
  return `
    <a class="link-preview-card link-preview-card--fallback" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      <img class="preview-favicon" src="${favicon}" alt="">
      <div class="preview-main">
        <div class="preview-title">${escapeHtml(domain)}</div>
        <div class="preview-domain">Visit ↗</div>
      </div>
    </a>`;
}

function truncate(str, n) {
  return str.length > n ? `${str.slice(0, n - 1).trimEnd()}…` : str;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

async function loadTab(tab) {
  const panel = document.getElementById(`panel-${tab}`);
  if (cache[tab]) {
    panel.innerHTML = cache[tab];
    return;
  }

  panel.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const res = await fetch(`content/${tab}.md?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const md = await res.text();
    panel.innerHTML = renderTabHTML(tab, md);
    await hydrateLinkPreviews(panel);
    cache[tab] = panel.innerHTML;
  } catch (err) {
    panel.innerHTML = `<p class="error">Could not load content/${tab}.md (${err.message})</p>`;
  }
}

// Toggles which tab is visible and (re)loads its content. Returns the
// loadTab promise so callers can chain work that depends on the tab's
// content actually being in the DOM (e.g. opening a specific article).
function activateTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${tab}`);
  });
  return loadTab(tab);
}

function showTab(tab) {
  activateTab(tab);
  history.replaceState(null, "", `#${tab}`);
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  showTab(btn.dataset.tab);
});

function backButtonLabel(tab) {
  const label = document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.textContent || "list";
  return `← Back to ${label}`;
}

// Opens a local entry's full markdown (by tab + slug, from readerIndex) in
// that tab's in-page reader, hiding its card list. `pushHistory` is false
// when we're already responding to a hash change (initial load, back/
// forward navigation) so we don't push a duplicate history entry.
async function openArticle(tab, slug, pushHistory = true) {
  const path = readerIndex[`${tab}/${slug}`];
  const list = document.getElementById(`${tab}-list`);
  const reader = document.getElementById(`${tab}-reader`);
  if (!path || !list || !reader) return;

  const backBtn = `<button class="article-back">${backButtonLabel(tab)}</button>`;
  list.hidden = true;
  document.querySelector(`#panel-${tab} .tab-note`)?.setAttribute("hidden", "");
  reader.hidden = false;
  reader.innerHTML = `${backBtn}<p class="loading">Loading…</p>`;
  window.scrollTo(0, 0);
  if (pushHistory) history.pushState(null, "", `#${tab}/${slug}`);

  try {
    const res = await fetch(`content/${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const md = await res.text();
    reader.innerHTML = `${backBtn}<div class="article-body">${marked.parse(md)}</div>`;
  } catch (err) {
    reader.innerHTML = `${backBtn}<p class="error">Could not load ${escapeHtml(path)} (${escapeHtml(err.message)})</p>`;
  }
}

function closeArticle(tab, pushHistory = true) {
  const list = document.getElementById(`${tab}-list`);
  const reader = document.getElementById(`${tab}-reader`);
  if (!list || !reader) return;
  list.hidden = false;
  document.querySelector(`#panel-${tab} .tab-note`)?.removeAttribute("hidden");
  reader.hidden = true;
  if (pushHistory) history.pushState(null, "", `#${tab}`);
}

document.getElementById("content-area").addEventListener("click", (e) => {
  const openLink = e.target.closest(".article-open");
  if (openLink) {
    e.preventDefault();
    openArticle(openLink.dataset.tab, openLink.dataset.slug);
    return;
  }
  const backBtn = e.target.closest(".article-back");
  if (backBtn) {
    e.preventDefault();
    const panel = backBtn.closest(".tab-panel");
    if (panel) closeArticle(panel.id.replace("panel-", ""));
  }
});

window.addEventListener("popstate", () => {
  const [tab, slug] = location.hash.slice(1).split("/");
  const targetTab = TABS.includes(tab) ? tab : "experience";
  const promise = activateTab(targetTab);
  if (slug) promise.then(() => openArticle(targetTab, slug, false));
  else promise.then(() => closeArticle(targetTab, false));
});

// Collects the `- item` bullet lines under a `## Heading` section, stopping
// at the next heading or end of file.
function extractListSection(lines, headingRegex) {
  const idx = lines.findIndex((l) => headingRegex.test(l.trim()));
  if (idx === -1) return [];
  const items = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("#")) break;
    const item = trimmed.match(/^[-*]\s+(.+)$/);
    if (item) items.push(item[1].trim());
  }
  return items;
}

// Small inline icon set for the links row, keyed by lowercased link label.
// Add an entry here for any new platform; unrecognized labels fall back
// to a generic link icon.
const LINK_ICONS = {
  github:
    '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  linkedin:
    '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  email:
    '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  mail:
    '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  substack:
    '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  twitter:
    '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>',
  x:
    '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>',
  default:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};

function svgIcon(pathMarkup, extraClass = "") {
  return `<svg class="icon-svg${extraClass ? ` ${extraClass}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathMarkup}</svg>`;
}

function linkIcon(label) {
  const path = LINK_ICONS[label.trim().toLowerCase()] || LINK_ICONS.default;
  return svgIcon(path, "link-icon");
}

// Parses profile.md: an optional leading ![alt](img) image, a `# Name`
// heading, a tagline (first plain line after the heading), an optional
// `## Links` section of `[Label](url)` items, and an optional `## Topics`
// section of plain `- item` bullets rendered as chips.
function parseProfile(md) {
  const lines = md.split("\n");
  const imgMatch = md.match(/!\[[^\]]*\]\(([^)]+)\)/);

  let name = null;
  let tagline = "";
  let afterName = false;
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      name = line.replace(/^#\s+/, "").trim();
      afterName = true;
      continue;
    }
    if (!afterName) continue;
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("#")) break;
    tagline = trimmed;
    break;
  }

  const links = extractListSection(lines, /^##\s+Links$/i).map((item) => {
    const m = item.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return m ? { label: m[1], url: m[2] } : { label: item, url: "#" };
  });

  const topics = extractListSection(lines, /^##\s+Topics$/i);

  return { img: imgMatch ? imgMatch[1] : null, name, tagline, links, topics };
}

async function loadProfile() {
  try {
    const res = await fetch(`content/profile.md?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const md = await res.text();
    const { img, name, tagline, links, topics } = parseProfile(md);

    if (img) document.getElementById("profile-pic").src = img;
    if (name) document.getElementById("site-name").textContent = name;
    if (tagline) document.getElementById("site-tagline").textContent = tagline;

    const linksEl = document.getElementById("links");
    if (links.length) {
      linksEl.innerHTML = links
        .map((l) => {
          const external = !l.url.startsWith("mailto:") ? ' target="_blank" rel="noopener"' : "";
          return `<a class="link-chip" href="${l.url}"${external}>${linkIcon(l.label)}<span>${l.label}</span></a>`;
        })
        .join("");
    } else {
      linksEl.hidden = true;
    }

    const topicsEl = document.getElementById("topics");
    if (topics.length) {
      topicsEl.innerHTML = topics
        .map((t) => `<span class="topic-chip">${t}</span>`)
        .join("");
    } else {
      document.querySelector(".topics-wrapper").hidden = true;
    }
  } catch (err) {
    // profile.md is optional; keep the placeholder header if missing.
  }
}

// Switching to a tab that has never been fetched shows a brief "Loading…"
// placeholder, which collapses the page height and makes the browser snap
// scroll position back to 0 — a visible jump. Quietly pre-fetch every other
// tab in the background (each one idle-scheduled so it never competes with
// anything the user is actually doing) so that by the time someone clicks a
// tab, it's already cached and the switch is instant.
function onIdle() {
  return new Promise((resolve) => {
    if (window.requestIdleCallback) requestIdleCallback(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 300);
  });
}

async function prefetchRemainingTabs(skip) {
  for (const tab of TABS) {
    if (tab === skip || cache[tab]) continue;
    await onIdle();
    await loadTab(tab);
  }
}

const [initialTabRaw, initialSlug] = location.hash.slice(1).split("/");
const initialTab = TABS.includes(initialTabRaw) ? initialTabRaw : "experience";
loadProfile();
const initialLoad = activateTab(initialTab);
history.replaceState(null, "", initialSlug ? `#${initialTab}/${initialSlug}` : `#${initialTab}`);
if (initialSlug) {
  initialLoad.then(() => openArticle(initialTab, initialSlug, false));
}
initialLoad.then(() => prefetchRemainingTabs(initialTab));
