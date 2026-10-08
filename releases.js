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
    <meta property="og:image" content="https://solstone.app/static/share-card.png?v=d5755664ab">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="solstone">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="{{canonicalUrl}}">
    <link rel="icon" type="image/svg+xml" href="/static/mark.svg?v=83c74a4665">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#FEFCF8" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#392E26" media="(prefers-color-scheme: dark)">
    <link rel="preload" href="/static/Comfortaa-Variable.woff2?v=6c73b639fb" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/static/inter-latin.woff2?v=4bfb027b31" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/static/inter-latin-bold.woff2?v=6f56409fd3" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/static/tokens.css?v=d24f6e142f">
    <link rel="stylesheet" href="/static/tokens-dark.css?v=df4fd231fe">
    <link rel="stylesheet" href="/static/site.css?v=3196b7204a">
    <style>
        .page-intro .btn, .page-intro .store-badge { margin-top: 18px; }
        .stream-switch {
            position: sticky; top: 8px; z-index: 5;
            display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
            padding: 10px clamp(22px, 4vw, 44px);
        }
        .ss-lead { font-size: 14px; color: var(--ink-soft); margin-right: 4px; }
        .ss-pill {
            display: inline-flex; align-items: center; min-height: 36px;
            font-size: 15px; font-weight: 500; line-height: 1;
            text-decoration: none; padding: 0 12px; border-radius: 999px;
            color: var(--ink); border: 1.5px solid transparent;
        }
        a.ss-pill:hover { border-color: var(--hairline-2); }
        .ss-active { background: var(--ink); color: var(--cream); font-weight: 600; }
        .ss-home:not(.ss-active) { background: var(--orange-wash); }
        .releases .band-inner { max-width: calc(760px + 2 * clamp(22px, 4vw, 44px)); }
        .release { padding: 26px 0; border-top: 1px solid var(--hairline); }
        .release:first-of-type { border-top: none; padding-top: 0; }
        .release h2 { margin-bottom: 2px; scroll-margin-top: 80px; overflow-wrap: anywhere; }
        .release .rel-date { font-size: 15px; color: var(--ink-soft); margin-bottom: 14px; }
        .release h3.rel-section { font-size: 15px; font-weight: 600; color: var(--ink-soft); margin: 18px 0 6px; }
        .release p { margin: 8px 0; }
        .release ul { margin: 4px 0 8px; padding-left: 1.25rem; }
        .release li { margin-bottom: 8px; }
        .release li::marker { color: var(--ink-faint); }
        .release code { background: var(--cream-bright); padding: 1px 5px; border-radius: 4px; border: 0; }
        .rel-links { margin-top: var(--band-gap); padding: 0 clamp(22px, 4vw, 44px); }
        @media (max-width: 640px) {
            .ss-lead { flex-basis: 100%; }
        }
    </style>
</head>
<body class="sun both">
    <div class="ground-sunrise" aria-hidden="true"></div>
    <div class="sunarc" id="sunarc" aria-hidden="true">
        <div class="sunarc-twilight"></div>
        <div class="sunarc-glow"></div>
        <div class="sunarc-sun"><svg viewBox="2.5 2.5 27 27" xmlns="http://www.w3.org/2000/svg" focusable="false"><path fill="#FFCC33" d="M16 2.5 Q17.057687783 5.007810543 18.589661566 7.257449068 A9.118033989 9.118033989 0 0 0 13.410338434 7.257449068 Q14.942312217 5.007810543 16 2.5 Z M23.935100906 5.078270576 Q23.316734245 7.728825204 23.233822722 10.449292599 A9.118033989 9.118033989 0 0 0 19.043662288 7.404962845 Q21.605359462 6.485438643 23.935100906 5.078270576 Z M28.83926297 11.828270576 Q26.781036911 13.609147511 25.114909466 15.761317696 A9.118033989 9.118033989 0 0 0 23.514410599 10.83548868 Q26.127349912 11.597305794 28.83926297 11.828270576 Z M28.83926297 20.171729424 Q26.127349912 20.402694206 23.514410599 21.16451132 A9.118033989 9.118033989 0 0 0 25.114909466 16.238682304 Q26.781036911 18.390852489 28.83926297 20.171729424 Z M23.935100906 26.921729424 Q21.605359462 25.514561357 19.043662288 24.595037155 A9.118033989 9.118033989 0 0 0 23.233822722 21.550707401 Q23.316734245 24.271174796 23.935100906 26.921729424 Z M16 29.5 Q14.942312217 26.992189457 13.410338434 24.742550932 A9.118033989 9.118033989 0 0 0 18.589661566 24.742550932 Q17.057687783 26.992189457 16 29.5 Z M8.064899094 26.921729424 Q8.683265755 24.271174796 8.766177278 21.550707401 A9.118033989 9.118033989 0 0 0 12.956337712 24.595037155 Q10.394640538 25.514561357 8.064899094 26.921729424 Z M3.16073703 20.171729424 Q5.218963089 18.390852489 6.885090534 16.238682304 A9.118033989 9.118033989 0 0 0 8.485589401 21.16451132 Q5.872650088 20.402694206 3.16073703 20.171729424 Z M3.16073703 11.828270576 Q5.872650088 11.597305794 8.485589401 10.83548868 A9.118033989 9.118033989 0 0 0 6.885090534 15.761317696 Q5.218963089 13.609147511 3.16073703 11.828270576 Z M8.064899094 5.078270576 Q10.394640538 6.485438643 12.956337712 7.404962845 A9.118033989 9.118033989 0 0 0 8.766177278 10.449292599 Q8.683265755 7.728825204 8.064899094 5.078270576 Z"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#E8913A" stroke-width="1.736067977"/></svg></div>
    </div>
    <div class="page">
        <a href="#main" class="skip-link">skip to content</a>
        <header class="site-header">
            <div class="bar">
                <a class="lockup" href="/"><img src="/static/lockup-solstone-horizontal.svg?v=4e45a9e870" alt="solstone home" width="125" height="32"></a>
                <nav class="site-nav" aria-label="main">
                    <a href="/#how">how it works</a>
                    <a href="/install#agents">connect your agent</a>
                    <a href="/#open-source">open source</a>
                    <a href="https://support.solstone.app">support</a>
                    <a class="btn btn-primary btn-sm" href="/install">get started</a>
                </nav>
                <div class="header-actions">
                    <a class="btn btn-primary btn-sm" href="/install">get started</a>
                    <details class="site-menu">
                        <summary>menu</summary>
                        <nav aria-label="main">
                            <a href="/#how">how it works</a>
                            <a href="/install#agents">connect your agent</a>
                            <a href="/#open-source">open source</a>
                            <a href="https://support.solstone.app">support</a>
                        </nav>
                    </details>
                </div>
            </div>
        </header>
    <main id="main" tabindex="-1">
        <section class="band wrap" aria-labelledby="page-title">
            <div class="band-inner page-intro">
                <h1 id="page-title">{{heading}}</h1>
                <p class="lead">{{intro}}</p>
                {{primaryLink}}
            </div>
        </section>

        <div class="band wrap">
        {{streamSwitcher}}
        </div>

        <section class="band wrap releases" aria-label="release history">
            <div class="band-inner">
            <!-- per-version <article> blocks here, newest first -->
            </div>
        </section>

        <div class="wrap">
            <nav class="links rel-links" aria-label="more">
                <a href="{{sourceUrl}}">source code on GitHub</a>
            </nav>
        </div>
    </main>
        <footer class="site-footer">
            <div class="footer-row">
                <nav aria-label="footer">
                    <a href="/download">download</a>
                    <a href="/phone">phone</a>
                    <a href="https://services.solstone.app">services</a>
                    <a href="https://solpbc.org/privacy">privacy</a>
                    <a href="/releases">releases</a>
                    <a href="https://trust.solstone.app">trust</a>
                    <a href="https://support.solstone.app">support</a>
                    <a href="https://solpbc.org">sol pbc</a>
                </nav>
                <p class="fine">© 2026 sol pbc · your journal is always private, only yours. solstone is a trademark of sol pbc.{{storeMarks}}</p>
            </div>
        </footer>
    </div>
    <script src="/static/site.js?v=21a0ea4d62" defer></script>
    <script src="/static/sunarc.js?v=d677dfd20e" defer></script>
</body>
</html>`;

const RELEASES_PLACEHOLDER = "            <!-- per-version <article> blocks here, newest first -->";

export const RELEASE_PAGE_CONFIGS = {
  journal: {
    pageTitle: "journal releases · solstone",
    ogTitle: "journal releases · solstone",
    metaDescription:
      "what's new in the journal, in plain language. the journal is the memory. your journal is always private, only yours.",
    ogUrl: "https://solstone.app/releases",
    canonicalUrl: "https://solstone.app/releases",
    stream: "journal",
    heading: "journal releases",
    intro:
      "what's new in the journal, newest first. the journal is the memory, on a computer you choose; these are the journal's own changes.",
    primaryLink: { href: "/install", text: "get started" },
    sourceUrl: "https://github.com/solpbc/solstone-journal",
    unavailableUrl: "https://github.com/solpbc/solstone-journal/releases",
    unavailableLabel: "see journal releases on GitHub →",
    articleTitle: (version) => `journal ${version}`,
    linkifyBundledJournal: false,
  },
  macos: {
    pageTitle: "mac app releases · solstone",
    ogTitle: "mac app releases · solstone",
    metaDescription:
      "release notes for the solstone app for mac, in plain language. installer, menu bar, settings, and auto-update changes.",
    ogUrl: "https://solstone.app/releases/macos",
    canonicalUrl: "https://solstone.app/releases/macos",
    stream: "macos",
    heading: "mac app releases",
    intro:
      "these are the mac app's own changes: installer, menu bar, settings, and auto-update. the solstone app runs on your mac.",
    primaryLink: { href: "/download/macos", text: "download the solstone app for mac" },
    sourceUrl: "https://github.com/solpbc/solstone-macos",
    unavailableUrl: "https://github.com/solpbc/solstone-macos/releases",
    unavailableLabel: "see mac app releases on GitHub →",
    articleTitle: (version) => `the solstone app for mac ${version}`,
    linkifyBundledJournal: true,
  },
  journalMacos: {
    pageTitle: "journal app releases · solstone",
    ogTitle: "journal app releases · solstone",
    metaDescription:
      "release notes for the journal on mac, in plain language. the journal as its own app: the memory, where everything the solstone app takes in goes.",
    ogUrl: "https://solstone.app/releases/journal-macos",
    canonicalUrl: "https://solstone.app/releases/journal-macos",
    stream: "journal-macos",
    heading: "journal app releases",
    intro:
      "these are the journal's own changes on mac: your journal, its window, and its updates.",
    primaryLink: { href: "/download/journal", text: "download the journal app for mac" },
    sourceUrl: "https://github.com/solpbc/solstone-macos",
    unavailableUrl: "https://github.com/solpbc/solstone-macos/releases",
    unavailableLabel: "see journal app releases on GitHub →",
    articleTitle: (version) => `the journal app for mac ${version}`,
    linkifyBundledJournal: true,
  },
  linux: {
    pageTitle: "linux app releases · solstone",
    ogTitle: "linux app releases · solstone",
    metaDescription:
      "release notes for the solstone linux app, in plain language. installation, systemd service, desktop integration, and sync changes.",
    ogUrl: "https://solstone.app/releases/linux",
    canonicalUrl: "https://solstone.app/releases/linux",
    stream: "linux",
    heading: "linux app releases",
    intro:
      "these are the linux app's own changes: installation, systemd service, desktop integration, and how it reaches your journal. the solstone app runs on your linux desktop.",
    primaryLink: { href: "/install#linux", text: "install the solstone app for linux" },
    sourceUrl: "https://github.com/solpbc/solstone-linux",
    unavailableUrl: "https://github.com/solpbc/solstone-linux/releases",
    unavailableLabel: "see linux app releases on GitHub →",
    articleTitle: (version) => `the solstone app for linux ${version}`,
    linkifyBundledJournal: true,
  },
  windows: {
    pageTitle: "windows app releases · solstone",
    ogTitle: "windows app releases · solstone",
    metaDescription:
      "release notes for the solstone windows app, in plain language. installer, tray, settings, and auto-update changes.",
    ogUrl: "https://solstone.app/releases/windows",
    canonicalUrl: "https://solstone.app/releases/windows",
    stream: "windows",
    heading: "windows app releases",
    intro:
      "these are the windows app's own changes: installer, tray, settings, and auto-update. the solstone app runs on your windows PC.",
    primaryLink: { href: "/download/windows", text: "download the solstone app for windows" },
    sourceUrl: "https://github.com/solpbc/solstone-windows",
    unavailableUrl: "https://github.com/solpbc/solstone-windows/releases",
    unavailableLabel: "see windows app releases on GitHub →",
    articleTitle: (version) => `the solstone app for windows ${version}`,
    // The Windows observer is a pairing client, not a journal host — its notes
    // never say "updated the bundled solstone journal to X", so keep linkify off.
    linkifyBundledJournal: false,
  },
  android: {
    pageTitle: "android app releases · solstone",
    ogTitle: "android app releases · solstone",
    metaDescription:
      "release notes for the solstone android app, in plain language. pairing and sync changes.",
    ogUrl: "https://solstone.app/releases/android",
    canonicalUrl: "https://solstone.app/releases/android",
    stream: "android",
    heading: "android app releases",
    intro:
      "these are the android app's own changes: its sources, pairing, and how it reaches your journal. the app is on Google Play. the signed copy from us doesn't update itself, so its download page is always where the current one is.",
    // Google Play is the first way in on Android, so the CTA is the store
    // listing. The signed APK on our own origin stays as the second way in, for
    // a phone without Google Play, and the intro links its download page.
    introLink: { phrase: "its download page", href: "/download/android" },
    primaryLink: { href: "https://play.google.com/store/apps/details?id=app.solstone.observer.phone", text: "Get it on Google Play", badge: "google-play" },
    sourceUrl: "https://github.com/solpbc/solstone-android",
    unavailableUrl: "https://github.com/solpbc/solstone-android/releases",
    unavailableLabel: "see android app releases on GitHub →",
    articleTitle: (version) => `the solstone app for android ${version}`,
    // The Android app is a pairing client, not a journal host — keep linkify off.
    linkifyBundledJournal: false,
  },
  ios: {
    pageTitle: "iphone app releases · solstone",
    ogTitle: "iphone app releases · solstone",
    metaDescription:
      "release notes for the solstone app on iphone and apple watch, in plain language. pairing and sync changes.",
    ogUrl: "https://solstone.app/releases/ios",
    canonicalUrl: "https://solstone.app/releases/ios",
    stream: "ios",
    heading: "iphone app releases",
    intro:
      "these are the iphone app's own changes: pairing, the journal view, what is still waiting on your phone, and the apple watch. the app is on the App Store, where it's listed as solstone mobile. new versions reach testers through TestFlight first, so the newest notes here can be ahead of what the App Store has.",
    // The App Store is the one public way in on iPhone, so the CTA is the store
    // listing. TestFlight builds are tagged here too, which is why the intro says
    // the newest notes can run ahead of the store.
    primaryLink: { href: "https://apps.apple.com/app/id6776850664", text: "Download on the App Store", badge: "app-store" },
    sourceUrl: "https://github.com/solpbc/solstone-swift",
    unavailableUrl: "https://github.com/solpbc/solstone-swift/releases",
    unavailableLabel: "see iphone app releases on GitHub →",
    articleTitle: (version) => `the solstone app for iphone ${version}`,
    // The iPhone app is a pairing client, not a journal host — keep linkify off.
    linkifyBundledJournal: false,
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

// Parse a Keep-a-Changelog CHANGELOG.md (mirrored to the release origin
// alongside binaries) into the shared item
// shape. Every historical GitHub release body was already lifted verbatim
// from one of these sections, so the same downstream renderer (stripped
// heading -> renderNotesMarkdown) applies unchanged; this function just does
// the splitting stripReleaseHeading used to do per-item, but over one
// multi-section file instead of one release body at a time. Sections whose
// bracket text isn't a bare x.y.z (e.g. "[Unreleased]") are skipped — there
// is no shipped version to key them by.
const CHANGELOG_HEADING = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;

export function parseChangelogItems(text) {
  if (typeof text !== "string") return [];

  const items = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const description = current.body.join("\n").trim();
    if (current.version && description) {
      items.push({ version: current.version, pubDate: current.pubDate, description });
    }
    current = null;
  };

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(CHANGELOG_HEADING);
    if (heading) {
      flush();
      const [, bracket, date] = heading;
      current = {
        version: /^\d+\.\d+\.\d+$/.test(bracket) ? bracket : null,
        pubDate: date ?? null,
        body: [],
      };
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();

  return items;
}

// Parse a Velopack release feed (releases.win.json) into the shared item shape.
// The feed is a single { Assets: [...] } array, newest release first, with both a
// "Full" and a "Delta" asset per version; per-release notes live in NotesMarkdown
// (omitted/empty when a release was packed without notes), and there is no date
// field. We keep one row per version (the Full asset), map NotesMarkdown ->
// description, and — mirroring parseAppcastItems' empty-<description> skip — drop
// note-less releases so the page never shows a hollow list of bare versions.
export function parseWinFeedItems(feed) {
  const assets = feed?.Assets;
  if (!Array.isArray(assets)) return [];

  const items = [];
  const seen = new Set();
  for (const asset of assets) {
    if (asset?.Type !== "Full") continue;
    const version = String(asset.Version ?? "").trim();
    if (!version || seen.has(version)) continue;
    const description = String(asset.NotesMarkdown ?? "").trim();
    if (!description) continue;
    seen.add(version);
    items.push({ version, pubDate: null, description });
  }

  return items;
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
    .replaceAll("{{intro}}", renderIntro(config))
    .replaceAll("{{primaryLink}}", renderPrimaryLink(config.primaryLink))
    .replaceAll("{{storeMarks}}", config.primaryLink?.badge ? STORE_MARKS : "")
    .replaceAll("{{streamSwitcher}}", streamSwitcher(config.stream))
    .replaceAll("{{sourceUrl}}", escapeHtml(config.sourceUrl));
}

// The intro is plain text; an optional introLink turns one exact phrase in it
// into a link, so a stream can point at a second way in without a second CTA.
function renderIntro(config) {
  const intro = escapeHtml(config.intro);
  const link = config.introLink;
  if (!link) return intro;
  const phrase = escapeHtml(link.phrase);
  if (!intro.includes(phrase)) throw new Error(`introLink phrase not in intro: ${link.phrase}`);
  return intro.replace(phrase, `<a href="${escapeHtml(link.href)}">${phrase}</a>`);
}

// A store listing is linked with the store's own official badge, unaltered, so
// the text is the badge's alt text; the page then carries the stores' marks.
const STORE_BADGES = {
  "app-store": { src: "/static/badge-app-store.svg?v=a26fc5b383", width: 144 },
  "google-play": { src: "/static/badge-google-play.png?v=6e629c8fa7", width: 161 },
};
const STORE_MARKS = " Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc. Google Play and the Google Play logo are trademarks of Google LLC.";

function renderPrimaryLink(link) {
  if (!link) return "";
  if (link.badge) {
    const badge = STORE_BADGES[link.badge];
    if (!badge) throw new Error(`unknown store badge: ${link.badge}`);
    return `<a href="${escapeHtml(link.href)}" class="store-badge intro-dl"><img src="${badge.src}" alt="${escapeHtml(link.text)}" width="${badge.width}" height="48"></a>`;
  }
  return `<a href="${escapeHtml(link.href)}" class="btn btn-primary btn-block-sm intro-dl">${escapeHtml(link.text)}</a>`;
}

function streamSwitcher(currentStream) {
  const pill = (key, label, href, extraClass = "") => {
    const activeClass = key === currentStream ? " ss-active" : "";
    const suffixClass = extraClass ? " " + extraClass : "";
    const classes = "ss-pill" + activeClass + suffixClass;

    if (key === currentStream) {
      return '            <span class="' + classes + '" aria-current="page">' + label + "</span>";
    }

    return '            <a class="' + classes + '" href="' + href + '">' + label + "</a>";
  };

  return [
    '<nav class="stream-switch" aria-label="release streams">',
    '            <span class="ss-lead">release notes for:</span>',
    pill("journal", "journal", "/releases", "ss-home"),
    pill("macos", "mac app", "/releases/macos"),
    pill("journal-macos", "journal app", "/releases/journal-macos"),
    pill("windows", "windows app", "/releases/windows"),
    pill("linux", "linux app", "/releases/linux"),
    pill("android", "android app", "/releases/android"),
    pill("ios", "iphone app", "/releases/ios"),
    "</nav>",
  ].join("\n");
}

// The empty section has two very different meanings and they must not share copy.
// For a stream with a release history, zero items means the upstream fetch failed —
// "temporarily unavailable" is right. For a stream that has never cut a release yet,
// that sentence reads as "we are broken" when the truth is "not yet." A config can
// override with `emptyBody` to say so plainly.
function renderUnavailableBody(config) {
  const link = `<a href="${escapeHtml(config.unavailableUrl)}">${escapeHtml(config.unavailableLabel)}</a>`;
  if (config.emptyBody) return `<p>${escapeHtml(config.emptyBody)} ${link}</p>`;
  return `<p>release notes are temporarily unavailable. ${link}</p>`;
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
