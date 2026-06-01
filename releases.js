const MONTHS = {
  jan: "january",
  feb: "february",
  mar: "march",
  apr: "april",
  may: "may",
  jun: "june",
  jul: "july",
  aug: "august",
  sep: "september",
  oct: "october",
  nov: "november",
  dec: "december",
};

const PAGE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{pageTitle}}</title>
    <meta name="description" content="{{metaDescription}}">
    <meta property="og:title" content="{{ogTitle}}">
    <meta property="og:description" content="{{metaDescription}}">
    <meta property="og:url" content="{{ogUrl}}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="https://solstone.app/static/screenshot-home.png">
    <meta property="og:image:width" content="1280">
    <meta property="og:image:height" content="720">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="{{canonicalUrl}}">
    <link rel="icon" type="image/svg+xml" href="/static/sol-wordmark.svg">
    <link rel="stylesheet" href="/static/base.css">
    <style>
        .page-intro {
            text-align: center;
            padding: 3rem 1.5rem 1.25rem;
            max-width: 640px;
            width: 100%;
        }
        .page-intro h1 { margin-bottom: 1rem; overflow-wrap: anywhere; }
        .page-intro p {
            font-size: 1rem; line-height: 1.6; color: #555;
        }
        .intro-dl {
            display: inline-block; margin-top: 1.25rem;
            font-family: 'Comfortaa', system-ui, sans-serif;
            font-size: 0.9rem; color: #767676; text-decoration: none;
            transition: color 0.15s;
        }
        .intro-dl:hover { color: #E8923A; }
        .stream-links {
            margin-top: 1.25rem;
            display: flex; flex-direction: column; gap: 0.45rem; align-items: center;
        }
        .stream-links a {
            color: #767676; font-size: 0.94rem; text-decoration: none;
            transition: color 0.15s;
            max-width: 100%; overflow-wrap: break-word; text-align: center;
        }
        .stream-links a:hover { color: #E8923A; }
        .releases {
            max-width: 720px; width: 100%; padding: 0 1.5rem;
            text-align: left;
        }
        .release {
            padding: 1.75rem 0;
            border-top: 1px solid #ececec;
        }
        .release:first-of-type { border-top: none; }
        .release h2 {
            font-family: 'Comfortaa', system-ui, sans-serif;
            font-size: 1.35rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.03em;
            color: #222; margin-bottom: 0.2rem;
            scroll-margin-top: 1.5rem;   /* anchor jump doesn't hide under top edge */
        }
        .release .rel-date {
            font-size: 0.85rem; color: #999; margin-bottom: 1.1rem;
        }
        .release h3.rel-section {
            font-family: 'Comfortaa', system-ui, sans-serif;
            font-size: 0.82rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.04em;
            color: #B36A1D; margin: 1.25rem 0 0.5rem;
        }
        .release p { font-size: 0.95rem; line-height: 1.65; color: #444; margin: 0.5rem 0; }
        .release ul { margin: 0.25rem 0 0.5rem; padding-left: 1.25rem; }
        .release li { font-size: 0.95rem; line-height: 1.6; color: #444; margin-bottom: 0.5rem; }
        .release li::marker { color: #E8923A; }
        .release code {
            font-family: ui-monospace, 'SF Mono', Menlo, monospace;
            font-size: 0.84em; background: #f5f5f5;
            padding: 0.05rem 0.35rem; border-radius: 3px; color: #333;
        }
        .release a { color: #b06a1a; text-decoration: underline; }
        .release a:hover { color: #E8923A; }
        .stream-links a:focus-visible,
        .rel-links a:focus-visible,
        .release a:focus-visible {
            outline: 2px solid #E8923A;
            outline-offset: 3px;
        }
        .rel-links {
            max-width: 720px; width: 100%; padding: 1.5rem 1.5rem 0;
            display: flex; flex-direction: column; gap: 0.5rem; text-align: left;
        }
        .rel-links a {
            color: #767676; font-size: 0.95rem; text-decoration: none;
            transition: color 0.15s;
        }
        .rel-links a:hover { color: #E8923A; }
        @media (max-width: 640px) {
            .release h2 { font-size: 1.2rem; }
        }
    </style>
</head>
<body>
    <a href="#main" class="skip-link">skip to content</a>
    <header>
        <a href="/" style="display:inline-block;margin-top:1.5rem;"><img src="/static/sol-wordmark.svg" alt="solstone" style="height:40px;"></a>
    </header>
    <main id="main" tabindex="-1">
        <div class="page-intro">
            <h1>{{heading}}</h1>
            <p>{{intro}}</p>
            {{primaryLink}}
            {{streamLinks}}
        </div>

        <section class="releases" aria-label="release history">
            <!-- per-version <article> blocks here, newest first -->
        </section>

        <nav class="rel-links" aria-label="more">
            <a href="{{sourceUrl}}">source code on github &rarr;</a>
            <a href="/">back to solstone.app &rarr;</a>
        </nav>
    </main>
    <footer>&copy; 2026 <a href="https://solpbc.org">sol pbc</a> &middot; your data stays on your machine — never sold, never shared. solstone is a trademark of sol pbc.</footer>
</body>
</html>`;

const RELEASES_PLACEHOLDER = "            <!-- per-version <article> blocks here, newest first -->";

export const RELEASE_PAGE_CONFIGS = {
  journal: {
    pageTitle: "solstone journal releases — solstone",
    ogTitle: "solstone journal releases",
    metaDescription:
      "what's new in the solstone journal, in plain language. your co-brain runs on your machine — never sold, never shared.",
    ogUrl: "https://solstone.app/releases",
    canonicalUrl: "https://solstone.app/releases",
    heading: "solstone journal releases",
    intro:
      "what's new in the solstone journal, newest first. sol lives in your journal and tends your memories there; these are the journal's own changes.",
    primaryLink: { href: "/install", text: "install solstone →" },
    streamLinks: [
      { href: "/releases/macos", text: "using the macOS app? see its release notes →" },
      { href: "/releases/linux", text: "using Linux? see its release notes →" },
    ],
    sourceUrl: "https://github.com/solpbc/solstone-journal",
    unavailableUrl: "https://github.com/solpbc/solstone-journal/releases",
    unavailableLabel: "see every journal release on github →",
    articleTitle: (version) => `solstone journal ${version}`,
    linkifyBundledJournal: false,
  },
  macos: {
    pageTitle: "macOS app releases — solstone",
    ogTitle: "macOS app releases",
    metaDescription:
      "release notes for the solstone macOS app, in plain language. installer, menubar, settings, and auto-update changes.",
    ogUrl: "https://solstone.app/releases/macos",
    canonicalUrl: "https://solstone.app/releases/macos",
    heading: "macOS app releases",
    intro:
      "these are the macOS app's own changes: installer, menubar, settings, auto-update, and the macOS observer.",
    primaryLink: { href: "/download/macos", text: "download solstone for macOS →" },
    streamLinks: [
      { href: "/releases", text: "for what's new in solstone itself, see the journal release notes →" },
      { href: "/releases/linux", text: "using Linux? see its release notes →" },
    ],
    sourceUrl: "https://github.com/solpbc/solstone-macos",
    unavailableUrl: "https://github.com/solpbc/solstone-macos/releases",
    unavailableLabel: "see every macOS app release on github →",
    articleTitle: (version) => `solstone for macOS ${version}`,
    linkifyBundledJournal: true,
  },
  linux: {
    pageTitle: "Linux observer releases — solstone",
    ogTitle: "Linux observer releases",
    metaDescription:
      "release notes for the solstone Linux observer, in plain language. installation, systemd service, desktop integration, and sync changes.",
    ogUrl: "https://solstone.app/releases/linux",
    canonicalUrl: "https://solstone.app/releases/linux",
    heading: "Linux observer releases",
    intro:
      "these are the Linux observer's own changes: installation, systemd service, desktop integration, and sync behavior.",
    primaryLink: { href: "/install", text: "install solstone for Linux →" },
    streamLinks: [
      { href: "/releases", text: "for what's new in solstone itself, see the journal release notes →" },
      { href: "/releases/macos", text: "using the macOS app? see its release notes →" },
    ],
    sourceUrl: "https://github.com/solpbc/solstone-linux",
    unavailableUrl: "https://github.com/solpbc/solstone-linux/releases",
    unavailableLabel: "see every Linux observer release on github →",
    articleTitle: (version) => `solstone for Linux ${version}`,
    linkifyBundledJournal: true,
  },
};

export function parseAppcastItems(xml) {
  if (typeof xml !== "string") return [];

  const items = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/g;

  for (const itemMatch of xml.matchAll(itemRegex)) {
    const itemXml = itemMatch[1];
    const versionMatch = itemXml.match(/<sparkle:shortVersionString>([\s\S]*?)<\/sparkle:shortVersionString>/);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descriptionMatch = itemXml.match(/<description\b[^>]*>([\s\S]*?)<\/description>/);
    const version = versionMatch?.[1]?.trim() ?? "";
    const pubDate = pubDateMatch?.[1]?.trim() ?? "";

    if (!version || !descriptionMatch || descriptionMatch[1] === "") continue;

    items.push({
      version,
      pubDate: pubDate || null,
      description: descriptionMatch[1],
    });
  }

  return items;
}

export function formatReleaseDate(pubDate) {
  if (!pubDate) return null;

  const match = String(pubDate).match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!match) return formatIsoReleaseDate(pubDate);

  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;

  return `${month} ${Number(match[1])}, ${match[3]}`;
}

function formatIsoReleaseDate(pubDate) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return null;

  const month = Object.values(MONTHS)[date.getUTCMonth()];
  if (!month) return null;

  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function parseGitHubReleaseItems(releases) {
  if (!Array.isArray(releases)) return [];

  return releases
    .map((release) => {
      const version = normalizeTagVersion(release?.tag_name);
      const description = stripReleaseHeading(release?.body ?? "");
      if (!version || !description.trim()) return null;

      return {
        version,
        pubDate: release?.published_at ?? null,
        description,
      };
    })
    .filter(Boolean);
}

function normalizeTagVersion(tagName) {
  const tag = String(tagName ?? "").trim();
  if (!tag) return "";
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

function stripReleaseHeading(body) {
  return String(body).replace(/^##\s+\[[^\]]+\]\s+-\s+\d{4}-\d{2}-\d{2}\s*\n+/u, "");
}

export function renderNotesMarkdown(md, options = {}) {
  const source = xmlUnescape(md ?? "");
  const lines = source.split(/\r?\n/);
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>\n${listItems.join("\n")}\n</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    if (line.startsWith("### ")) {
      flushList();
      blocks.push(`<h3 class="rel-section">${renderInline(line.slice(4), options)}</h3>`);
    } else if (line.startsWith("- ")) {
      listItems.push(`<li>${renderInline(line.slice(2), options)}</li>`);
    } else if (/^\s{2,}\S/.test(line) && listItems.length) {
      const previous = listItems.pop();
      listItems.push(previous.replace("</li>", ` ${renderInline(line.trim(), options)}</li>`));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(`<p>${renderInline(line, options)}</p>`);
    }
  }

  flushList();
  return blocks.join("\n");
}

export function renderReleasesPage(items, config = RELEASE_PAGE_CONFIGS.journal) {
  const pageConfig = config ?? RELEASE_PAGE_CONFIGS.journal;
  const sectionInner = items.length
    ? items.map((item) => renderArticle(item, pageConfig)).join("\n")
    : renderUnavailableBody(pageConfig);
  const indentedSection = sectionInner
    .split("\n")
    .map((line) => `            ${line}`)
    .join("\n");

  // Replacer is a function (not a string) so a `$`-sequence in the rendered
  // notes (e.g. a shell example like `$'…'`) is inserted literally and never
  // interpreted as a `String.replace` special pattern ($&, $', $`, $$).
  return fillTemplate(PAGE_TEMPLATE, pageConfig).replace(RELEASES_PLACEHOLDER, () => indentedSection);
}

function fillTemplate(template, config) {
  return template
    .replaceAll("{{pageTitle}}", escapeHtml(config.pageTitle))
    .replaceAll("{{metaDescription}}", escapeHtml(config.metaDescription))
    .replaceAll("{{ogTitle}}", escapeHtml(config.ogTitle))
    .replaceAll("{{ogUrl}}", escapeHtml(config.ogUrl))
    .replaceAll("{{canonicalUrl}}", escapeHtml(config.canonicalUrl))
    .replaceAll("{{heading}}", escapeHtml(config.heading))
    .replaceAll("{{intro}}", escapeHtml(config.intro))
    .replaceAll("{{primaryLink}}", renderPrimaryLink(config.primaryLink))
    .replaceAll("{{streamLinks}}", renderStreamLinks(config.streamLinks))
    .replaceAll("{{sourceUrl}}", escapeHtml(config.sourceUrl));
}

function renderPrimaryLink(link) {
  if (!link) return "";
  return `<a href="${escapeHtml(link.href)}" class="intro-dl">${escapeHtml(link.text)}</a>`;
}

function renderStreamLinks(links) {
  if (!links?.length) return "";
  const items = links
    .map((link) => `                <a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a>`)
    .join("\n");
  return `<nav class="stream-links" aria-label="release streams">\n${items}\n            </nav>`;
}

function renderUnavailableBody(config) {
  return `<p>release notes are temporarily unavailable. <a href="${escapeHtml(config.unavailableUrl)}">${escapeHtml(config.unavailableLabel)}</a></p>`;
}

function renderArticle(item, config) {
  const date = formatReleaseDate(item.pubDate);
  const lines = [
    '<article class="release">',
    `    <h2 id="v${escapeHtml(item.version)}">${escapeHtml(config.articleTitle(item.version))}</h2>`,
  ];

  if (date) lines.push(`    <p class="rel-date">${date}</p>`);

  const notes = renderNotesMarkdown(item.description, {
    linkifyBundledJournal: config.linkifyBundledJournal,
  });
  if (notes) {
    lines.push(
      notes
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    );
  }

  lines.push("</article>");
  return lines.join("\n");
}

function xmlUnescape(text) {
  return String(text)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInline(text, options = {}) {
  const codeSpans = [];
  const escaped = escapeHtml(text);
  const withCodePlaceholders = escaped.replace(/`([^`]*?)`/g, (_, code) => {
    const index = codeSpans.length;
    codeSpans.push(`<code>${code}</code>`);
    return `\x00C${index}\x00`;
  });

  const withLinks = withCodePlaceholders.replace(/\[([^\]]*?)\]\(([^)]*?)\)/g, (match, linkText, url) => {
    if (!/^https?:\/\//i.test(url)) return match;
    return `<a href="${url}">${linkText}</a>`;
  });

  const withBundledJournal = options.linkifyBundledJournal
    ? withLinks.replace(
        /\b(updated the bundled solstone journal to )(\d+\.\d+\.\d+)\b/gi,
        (_match, prefix, version) => `${prefix}<a href="/releases#v${version}">${version}</a>`,
      )
    : withLinks;

  const withBold = withBundledJournal.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/\x00C(\d+)\x00/g, (_, index) => codeSpans[Number(index)]);
}
