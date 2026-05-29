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
    <title>what's new — solstone</title>
    <meta name="description" content="every solstone release for macOS, in plain language. your co-brain runs on your machine — never sold, never shared.">
    <meta property="og:title" content="what's new — solstone">
    <meta property="og:description" content="every solstone release for macOS, in plain language. your co-brain runs on your machine — never sold, never shared.">
    <meta property="og:url" content="https://solstone.app/releases">
    <meta property="og:type" content="website">
    <meta property="og:image" content="https://solstone.app/static/screenshot-home.png">
    <meta property="og:image:width" content="1280">
    <meta property="og:image:height" content="720">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="https://solstone.app/releases">
    <link rel="icon" type="image/svg+xml" href="/static/sol-wordmark.svg">
    <link rel="stylesheet" href="/static/base.css">
    <style>
        .page-intro {
            text-align: center;
            padding: 3rem 1.5rem 1.25rem;
            max-width: 640px;
        }
        .page-intro h1 { margin-bottom: 1rem; }
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
        .releases {
            max-width: 720px; width: 90vw; padding: 0 1.5rem;
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
        .rel-links {
            max-width: 720px; width: 90vw; padding: 1.5rem 1.5rem 0;
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
            <h1>what's new</h1>
            <p>every solstone release for macOS, newest first — in plain language. what's new, what changed, what's no longer in your way.</p>
            <a href="/download/macos" class="intro-dl">download solstone for macOS &rarr;</a>
        </div>

        <section class="releases" aria-label="release history">
            <!-- per-version <article> blocks here, newest first -->
        </section>

        <nav class="rel-links" aria-label="more">
            <a href="https://github.com/solpbc/solstone">source code on github &rarr;</a>
            <a href="/">back to solstone.app &rarr;</a>
        </nav>
    </main>
    <footer>&copy; 2026 <a href="https://solpbc.org">sol pbc</a> &middot; your data stays on your machine — never sold, never shared. solstone is a trademark of sol pbc.</footer>
</body>
</html>`;

const RELEASES_PLACEHOLDER = "            <!-- per-version <article> blocks here, newest first -->";
const UNAVAILABLE_BODY =
  '<p>release notes are temporarily unavailable. see every release on github <a href="https://github.com/solpbc/solstone/releases">&rarr;</a></p>';

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
  if (!match) return null;

  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;

  return `${month} ${Number(match[1])}, ${match[3]}`;
}

export function renderNotesMarkdown(md) {
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
      blocks.push(`<h3 class="rel-section">${renderInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      listItems.push(`<li>${renderInline(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(`<p>${renderInline(line)}</p>`);
    }
  }

  flushList();
  return blocks.join("\n");
}

export function renderReleasesPage(items) {
  const sectionInner = items.length ? items.map(renderArticle).join("\n") : UNAVAILABLE_BODY;
  const indentedSection = sectionInner
    .split("\n")
    .map((line) => `            ${line}`)
    .join("\n");

  return PAGE_TEMPLATE.replace(RELEASES_PLACEHOLDER, indentedSection);
}

function renderArticle(item) {
  const date = formatReleaseDate(item.pubDate);
  const lines = [
    '<article class="release">',
    `    <h2 id="v${item.version}">solstone ${item.version}</h2>`,
  ];

  if (date) lines.push(`    <p class="rel-date">${date}</p>`);

  const notes = renderNotesMarkdown(item.description);
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

function renderInline(text) {
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

  const withBold = withLinks.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/\x00C(\d+)\x00/g, (_, index) => codeSpans[Number(index)]);
}
