import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_PAGE_CONFIGS,
  formatReleaseDate,
  parseAppcastItems,
  parseGitHubReleaseItems,
  parseWinFeedItems,
  renderNotesMarkdown,
  renderReleasesPage,
} from "../releases.js";

test("parseAppcastItems extracts item fields in document order and ignores channel fields", () => {
  const xml = `<rss>
    <channel>
      <title>solstone</title>
      <description>solstone observer updates</description>
      <item>
        <title>Solstone 1.3.4</title>
        <sparkle:shortVersionString>1.3.4</sparkle:shortVersionString>
        <pubDate>Thu, 28 May 2026 05:42:58 GMT</pubDate>
        <description sparkle:format="markdown">### Added
- one</description>
      </item>
      <item>
        <title>Solstone 1.3.3</title>
        <sparkle:shortVersionString>1.3.3</sparkle:shortVersionString>
        <pubDate>Fri, 22 May 2026 14:40:31 GMT</pubDate>
        <description>### Fixed
- two</description>
      </item>
    </channel>
  </rss>`;

  assert.deepEqual(parseAppcastItems(xml), [
    {
      version: "1.3.4",
      pubDate: "Thu, 28 May 2026 05:42:58 GMT",
      description: "### Added\n- one",
    },
    {
      version: "1.3.3",
      pubDate: "Fri, 22 May 2026 14:40:31 GMT",
      description: "### Fixed\n- two",
    },
  ]);
  assert.deepEqual(parseAppcastItems("<rss><channel><description>channel only</description></channel></rss>"), []);
});

test("parseAppcastItems omits malformed items and keeps missing pubDate as null", () => {
  const mixed = `<rss><channel>
    <item>
      <description>missing version</description>
    </item>
    <item>
      <sparkle:shortVersionString>1.2.0</sparkle:shortVersionString>
    </item>
    <item>
      <sparkle:shortVersionString>1.2.1</sparkle:shortVersionString>
      <pubDate>Mon, 05 May 2026 15:39:42 GMT</pubDate>
      <description>valid notes</description>
    </item>
  </channel></rss>`;

  assert.deepEqual(parseAppcastItems(mixed), [
    {
      version: "1.2.1",
      pubDate: "Mon, 05 May 2026 15:39:42 GMT",
      description: "valid notes",
    },
  ]);

  const malformedOnly = `<rss><channel><item><description>no version</description></item></channel></rss>`;
  assert.deepEqual(parseAppcastItems(malformedOnly), []);

  const missingDate = `<rss><channel><item>
    <sparkle:shortVersionString>1.2.2</sparkle:shortVersionString>
    <description>no date</description>
  </item></channel></rss>`;
  assert.deepEqual(parseAppcastItems(missingDate), [
    { version: "1.2.2", pubDate: null, description: "no date" },
  ]);
});

test("formatReleaseDate formats RFC-822 dates with GMT calendar components", () => {
  assert.equal(formatReleaseDate("Thu, 28 May 2026 05:42:58 GMT"), "may 28, 2026");
  assert.equal(formatReleaseDate("Mon, 05 May 2026 15:39:42 GMT"), "may 5, 2026");
  assert.equal(formatReleaseDate("Fri, 22 May 2026 14:40:31 GMT"), "may 22, 2026");
  assert.equal(formatReleaseDate("Sun, 31 May 2026 23:30:00 GMT"), "may 31, 2026");
  assert.equal(formatReleaseDate("2026-06-01T05:56:31Z"), "june 1, 2026");
  assert.equal(formatReleaseDate(undefined), null);
  assert.equal(formatReleaseDate("garbage"), null);
});

test("parseGitHubReleaseItems normalizes public GitHub release JSON", () => {
  const items = parseGitHubReleaseItems([
    {
      tag_name: "v0.4.8",
      published_at: "2026-06-01T05:56:31Z",
      body: "## [0.4.8] - 2026-06-01\n\n### Fixed\n- one",
    },
    { tag_name: "", published_at: "2026-06-01T05:56:31Z", body: "missing tag" },
    { tag_name: "v0.4.7", published_at: "2026-05-31T20:00:00Z", body: "" },
  ]);

  assert.deepEqual(items, [
    {
      version: "0.4.8",
      pubDate: "2026-06-01T05:56:31Z",
      description: "### Fixed\n- one",
    },
  ]);
});

test("renderNotesMarkdown preserves heading and list structure", () => {
  const html = renderNotesMarkdown("### Added\n- one\n- two");

  assert.match(html, /<h3 class="rel-section">Added<\/h3>/);
  assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
  assert.doesNotMatch(html.toLowerCase(), /addedone/);
});

test("renderNotesMarkdown keeps wrapped list items inside the list", () => {
  const html = renderNotesMarkdown("- first line\n  continued line\n- second line");

  assert.match(html, /<li>first line continued line<\/li>/);
  assert.match(html, /<li>second line<\/li>/);
  assert.equal((html.match(/<ul>/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<p>continued line<\/p>/);
});

test("renderNotesMarkdown applies inline rules safely and non-greedily", () => {
  const html = renderNotesMarkdown(
    "Bundled solstone backend pinned to **0.3.2**, which makes `sol doctor` PATH-independent and keeps `journal setup` stable.",
  );
  assert.match(html, /<strong>0\.3\.2<\/strong>/);
  assert.match(html, /<code>sol doctor<\/code>/);
  assert.match(html, /<code>journal setup<\/code>/);

  assert.equal(renderNotesMarkdown("**bold**"), "<p><strong>bold</strong></p>");
  assert.equal(renderNotesMarkdown("`code`"), "<p><code>code</code></p>");
  assert.equal(renderNotesMarkdown("`**not bold**`"), "<p><code>**not bold**</code></p>");

  const twoBold = renderNotesMarkdown("**a** and **b**");
  assert.equal((twoBold.match(/<strong>/g) ?? []).length, 2);
  assert.match(twoBold, /<strong>a<\/strong> and <strong>b<\/strong>/);

  const unmatched = renderNotesMarkdown("keep ** literal");
  assert.match(unmatched, /\*\*/);
  assert.doesNotMatch(unmatched, /<strong>/);

  assert.equal(
    renderNotesMarkdown("[x](https://example.com)"),
    '<p><a href="https://example.com">x</a></p>',
  );
  assert.equal(
    renderNotesMarkdown("updated the bundled solstone journal to 0.4.8 →", { linkifyBundledJournal: true }),
    '<p>updated the bundled solstone journal to <a href="/releases#v0.4.8">0.4.8</a> →</p>',
  );

  const invalidLinks = renderNotesMarkdown(
    "[x](javascript:alert(1))\n[x](ftp://h)\n[x]( https://leading-space)",
  );
  assert.doesNotMatch(invalidLinks, /<a /);
  assert.match(invalidLinks, /\[x\]\(javascript:alert\(1\)\)/);
  assert.match(invalidLinks, /\[x\]\(ftp:\/\/h\)/);
  assert.match(invalidLinks, /\[x\]\( https:\/\/leading-space\)/);
});

test("renderNotesMarkdown escapes raw HTML and prevents attribute breakout", () => {
  const html = renderNotesMarkdown("<script>alert(1)</script> & 5 > 4");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&gt;/);
  assert.doesNotMatch(html, /<script>/);

  const link = renderNotesMarkdown('[x](https://e.com/"onmouseover=y)');
  assert.match(link, /href="https:\/\/e\.com\/&quot;onmouseover=y"/);
  assert.doesNotMatch(link, /"onmouseover/);
});

test("renderReleasesPage renders graceful fallback inside full chrome", () => {
  const html = renderReleasesPage([]);

  assert.match(html, /release notes are temporarily unavailable/);
  assert.match(html, /<title>journal releases — solstone<\/title>/);
  assert.match(html, /https:\/\/github\.com\/solpbc\/solstone-journal\/releases/);
  assert.match(
    html,
    /<footer>&copy; 2026 <a href="https:\/\/solpbc\.org">sol pbc<\/a> &middot; <a href="\/releases">releases<\/a> &middot; your data stays on your device — never sold, never shared\. solstone is a trademark of sol pbc\.<\/footer>/,
  );
});

test("renderReleasesPage renders articles in order and omits null dates", () => {
  const html = renderReleasesPage([
    {
      version: "1.3.4",
      pubDate: "Thu, 28 May 2026 05:42:58 GMT",
      description: "### Added\n- first",
    },
    {
      version: "1.3.3",
      pubDate: null,
      description: "second",
    },
  ]);

  assert.equal((html.match(/<article class="release">/g) ?? []).length, 2);
  assert.ok(html.indexOf('id="v1.3.4"') < html.indexOf('id="v1.3.3"'));
  assert.match(html, /<h2 id="v1\.3\.4">journal 1\.3\.4<\/h2>/);
  assert.match(html, /<h2 id="v1\.3\.3">journal 1\.3\.3<\/h2>/);
  assert.match(html, /<p class="rel-date">may 28, 2026<\/p>/);

  const secondArticle = html.slice(html.indexOf('id="v1.3.3"'), html.indexOf("</article>", html.indexOf('id="v1.3.3"')));
  assert.doesNotMatch(secondArticle, /class="rel-date"/);
});

test("renderReleasesPage preserves chrome copy", () => {
  const html = renderReleasesPage([]);
  const macosHtml = renderReleasesPage([], RELEASE_PAGE_CONFIGS.macos);
  const linuxHtml = renderReleasesPage([], RELEASE_PAGE_CONFIGS.linux);

  assert.match(
    html,
    /<meta property="og:description" content="what's new in the journal — the memory sol keeps — in plain language\. it runs on your device: never sold, never shared\.">/,
  );
  assert.match(
    macosHtml,
    /<link rel="canonical" href="https:\/\/solstone\.app\/releases\/macos">/,
  );
  assert.match(
    linuxHtml,
    /<link rel="canonical" href="https:\/\/solstone\.app\/releases\/linux">/,
  );
});

test("renderReleasesPage renders sticky stream switcher across streams", () => {
  const journalHtml = renderReleasesPage([], RELEASE_PAGE_CONFIGS.journal);
  const macosHtml = renderReleasesPage([], RELEASE_PAGE_CONFIGS.macos);
  const linuxHtml = renderReleasesPage([], RELEASE_PAGE_CONFIGS.linux);
  const iosSoon = '<span class="ss-pill ss-soon" aria-disabled="true">iOS soon</span>';

  const assertOrder = (html, expected) => {
    let previousIndex = -1;
    for (const item of expected) {
      const index = html.indexOf(item);
      assert.notEqual(index, -1, `${item} should be rendered`);
      assert.ok(index > previousIndex, `${item} should render in stream order`);
      previousIndex = index;
    }
  };

  for (const html of [journalHtml, macosHtml, linuxHtml]) {
    const switcherIndex = html.indexOf('<nav class="stream-switch" aria-label="release streams">');
    const leadIndex = html.indexOf('<span class="ss-lead">release notes for:</span>');
    const firstPillIndex = html.indexOf('class="ss-pill', leadIndex);
    const introIndex = html.indexOf('<div class="page-intro">');
    const introCloseIndex = html.indexOf("</div>", introIndex);
    const sectionIndex = html.indexOf('<section class="releases"', switcherIndex);

    assert.notEqual(switcherIndex, -1);
    assert.ok(leadIndex > switcherIndex);
    assert.ok(leadIndex < firstPillIndex);
    assert.ok(introCloseIndex < switcherIndex);
    assert.ok(switcherIndex < sectionIndex);
    assert.match(html, /scroll-margin-top: 3\.5rem;/);
    assert.match(html, new RegExp(iosSoon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(html, /<a[^>]*>iOS soon<\/a>/);
    assert.doesNotMatch(html, /stream-links/);
    assert.doesNotMatch(html, /<script/i);
  }

  assertOrder(journalHtml, [
    '<span class="ss-pill ss-active ss-home" aria-current="page">journal</span>',
    '<a class="ss-pill" href="/releases/macos">macOS</a>',
    '<a class="ss-pill" href="/releases/linux">Linux</a>',
    iosSoon,
  ]);
  assert.doesNotMatch(journalHtml, /<a class="ss-pill ss-active ss-home"[^>]*>journal<\/a>/);

  assertOrder(macosHtml, [
    '<a class="ss-pill ss-home" href="/releases">journal</a>',
    '<span class="ss-pill ss-active" aria-current="page">macOS</span>',
    '<a class="ss-pill" href="/releases/linux">Linux</a>',
    iosSoon,
  ]);
  assert.doesNotMatch(macosHtml, /<a class="ss-pill ss-active"[^>]*>macOS<\/a>/);

  assertOrder(linuxHtml, [
    '<a class="ss-pill ss-home" href="/releases">journal</a>',
    '<a class="ss-pill" href="/releases/macos">macOS</a>',
    '<span class="ss-pill ss-active" aria-current="page">Linux</span>',
    iosSoon,
  ]);
  assert.doesNotMatch(linuxHtml, /<a class="ss-pill ss-active"[^>]*>Linux<\/a>/);

  // model line removed from every stream (req_faqjh32h) — the switcher's
  // always-first journal pill + primacy underline carry the cross-stream
  // navigation and the journal-is-substance signal, so the prose was redundant.
  assert.doesNotMatch(journalHtml, /class="stream-model"/);
  assert.doesNotMatch(macosHtml, /class="stream-model"/);
  assert.doesNotMatch(linuxHtml, /class="stream-model"/);
});

test("renderReleasesPage inserts notes with $-sequences literally (no replace-pattern interpretation)", () => {
  // $&, $', $` and $$ are special in a String.replace string replacement; a
  // release note containing them (e.g. a shell example) must render verbatim,
  // not splice in the matched/surrounding template text.
  const html = renderReleasesPage(
    [
      {
        version: "1.4.0",
        pubDate: "Thu, 28 May 2026 05:42:58 GMT",
        description: "- run `echo $'literal'` then export $$HOME and $`path",
      },
    ],
    RELEASE_PAGE_CONFIGS.macos,
  );

  // $'…' would splice in the template tail; the code span must stay intact.
  assert.match(html, /<code>echo \$'literal'<\/code>/);
  // $$ collapses to a single $ under buggy string replacement.
  assert.match(html, /export \$\$HOME and \$`path/);
  // exactly one article and one closing tag — a botched replace duplicates the tail.
  assert.equal((html.match(/<article class="release">/g) ?? []).length, 1);
  assert.equal((html.match(/<\/html>/g) ?? []).length, 1);
});

test("live-shape appcast fixture parses and renders eight releases", () => {
  const xml = `<rss>
    <channel>
      <title>solstone</title>
      <description>solstone observer updates</description>
      <item>
        <sparkle:shortVersionString>1.3.4</sparkle:shortVersionString>
        <pubDate>Thu, 28 May 2026 05:42:58 GMT</pubDate>
        <description sparkle:format="markdown">### Added
- Bundled solstone backend pinned to **0.3.2**, which makes \`sol doctor\` PATH-independent and keeps \`journal setup\` plus \`uv tool run\` stable.</description>
      </item>
      <item>
        <sparkle:shortVersionString>1.3.3</sparkle:shortVersionString>
        <pubDate>Fri, 22 May 2026 14:40:31 GMT</pubDate>
        <description>### Fixed
- Fixed updater handoff copy.</description>
      </item>
      <item>
        <sparkle:shortVersionString>1.3.2</sparkle:shortVersionString>
        <pubDate>Wed, 20 May 2026 13:00:00 GMT</pubDate>
        <description sparkle:format="markdown">### Changed
- Tightened observer startup.</description>
      </item>
      <item>
        <sparkle:shortVersionString>1.3.1</sparkle:shortVersionString>
        <pubDate>Tue, 19 May 2026 11:00:00 GMT</pubDate>
        <description>### Fixed
- Improved first run logging.</description>
      </item>
      <item>
        <sparkle:shortVersionString>1.3.0</sparkle:shortVersionString>
        <pubDate>Mon, 18 May 2026 10:00:00 GMT</pubDate>
        <description sparkle:format="markdown">### Added
- Added setup status checks.</description>
      </item>
      <item>
        <sparkle:shortVersionString>1.2.0</sparkle:shortVersionString>
        <pubDate>Fri, 15 May 2026 10:00:00 GMT</pubDate>
        <description>### Changed
- Updated packaging.</description>
      </item>
      <item>
        <sparkle:shortVersionString>1.1.3</sparkle:shortVersionString>
        <pubDate>Thu, 14 May 2026 10:00:00 GMT</pubDate>
        <description sparkle:format="markdown">### Fixed
- Stabilized launch services registration.</description>
      </item>
      <item>
        <sparkle:shortVersionString>1.1.2</sparkle:shortVersionString>
        <pubDate>Wed, 13 May 2026 10:00:00 GMT</pubDate>
        <description>### Added
- Initial signed Sparkle channel.</description>
      </item>
    </channel>
  </rss>`;

  const items = parseAppcastItems(xml);
  const html = renderReleasesPage(items, RELEASE_PAGE_CONFIGS.macos);

  assert.equal(items.length, 8);
  assert.deepEqual(
    items.map((item) => item.version),
    ["1.3.4", "1.3.3", "1.3.2", "1.3.1", "1.3.0", "1.2.0", "1.1.3", "1.1.2"],
  );
  assert.equal((html.match(/<article class="release">/g) ?? []).length, 8);
});

test("parseWinFeedItems maps Full assets newest-first, skips deltas, note-less, and malformed", () => {
  const feed = {
    Assets: [
      { PackageId: "Solstone", Version: "0.3.0", Type: "Full", FileName: "Solstone-0.3.0-full.nupkg", NotesMarkdown: "### Added\n- newest" },
      { PackageId: "Solstone", Version: "0.3.0", Type: "Delta", FileName: "Solstone-0.3.0-delta.nupkg", NotesMarkdown: "### Added\n- newest" },
      { PackageId: "Solstone", Version: "0.2.0", Type: "Full", FileName: "Solstone-0.2.0-full.nupkg", NotesMarkdown: "### Fixed\n- middle" },
      { PackageId: "Solstone", Version: "0.1.0", Type: "Full", FileName: "Solstone-0.1.0-full.nupkg" },
    ],
  };

  assert.deepEqual(parseWinFeedItems(feed), [
    { version: "0.3.0", pubDate: null, description: "### Added\n- newest" },
    { version: "0.2.0", pubDate: null, description: "### Fixed\n- middle" },
  ]);

  // empty/whitespace NotesMarkdown is treated as "no notes" and skipped.
  assert.deepEqual(
    parseWinFeedItems({ Assets: [{ Version: "0.1.1", Type: "Full", NotesMarkdown: "  " }] }),
    [],
  );

  // the real live feed shape (no notes on any asset) yields [] -> the page shows
  // the graceful "unavailable" body, never a hollow list of bare versions.
  assert.deepEqual(
    parseWinFeedItems({
      Assets: [
        { PackageId: "Solstone", Version: "0.1.1", Type: "Full", FileName: "Solstone-0.1.1-full.nupkg", SHA1: "x", SHA256: "y", Size: 1 },
        { PackageId: "Solstone", Version: "0.1.1", Type: "Delta", FileName: "Solstone-0.1.1-delta.nupkg", SHA1: "x", SHA256: "y", Size: 1 },
        { PackageId: "Solstone", Version: "0.1.0", Type: "Full", FileName: "Solstone-0.1.0-full.nupkg", SHA1: "x", SHA256: "y", Size: 1 },
      ],
    }),
    [],
  );

  // defensive de-dupe: at most one row per version (keep the first Full seen).
  assert.deepEqual(
    parseWinFeedItems({
      Assets: [
        { Version: "0.5.0", Type: "Full", NotesMarkdown: "first" },
        { Version: "0.5.0", Type: "Full", NotesMarkdown: "second" },
      ],
    }),
    [{ version: "0.5.0", pubDate: null, description: "first" }],
  );

  // malformed inputs never throw.
  assert.deepEqual(parseWinFeedItems(null), []);
  assert.deepEqual(parseWinFeedItems({}), []);
  assert.deepEqual(parseWinFeedItems({ Assets: "nope" }), []);
  assert.deepEqual(parseWinFeedItems({ Assets: [null, { Type: "Full" }] }), []);
});

test("renderReleasesPage renders the windows stream with notes, no date, and an active Windows pill", () => {
  const items = parseWinFeedItems({
    Assets: [
      { Version: "0.3.0", Type: "Full", NotesMarkdown: "### Added\n- a windows thing" },
      { Version: "0.3.0", Type: "Delta", NotesMarkdown: "### Added\n- a windows thing" },
    ],
  });
  const html = renderReleasesPage(items, RELEASE_PAGE_CONFIGS.windows);

  assert.equal(RELEASE_PAGE_CONFIGS.windows.stream, "windows");
  assert.match(html, /<link rel="canonical" href="https:\/\/solstone\.app\/releases\/windows">/);
  assert.match(html, /<title>Windows app releases — solstone<\/title>/);
  assert.match(html, /<h2 id="v0\.3\.0">solstone for Windows 0\.3\.0<\/h2>/);
  assert.match(html, /a windows thing/);
  // the Velopack feed carries no per-release date — the page renders none.
  assert.doesNotMatch(html, /class="rel-date"/);
  // download permalink + the Windows pill marked active on its own page.
  assert.match(html, /<a href="\/download\/windows" class="intro-dl">download solstone for Windows →<\/a>/);
  assert.match(html, /<span class="ss-pill ss-active" aria-current="page">Windows<\/span>/);

  // and the Windows pill renders as a link in the desktop trio on other streams.
  const macosHtml = renderReleasesPage([], RELEASE_PAGE_CONFIGS.macos);
  assert.match(macosHtml, /<a class="ss-pill" href="\/releases\/windows">Windows<\/a>/);
  assert.ok(
    macosHtml.indexOf('>macOS<') < macosHtml.indexOf('href="/releases/windows"') &&
      macosHtml.indexOf('href="/releases/windows"') < macosHtml.indexOf('href="/releases/linux"'),
    "Windows pill sits between macOS and Linux",
  );
});

test("renderReleasesPage renders the android stream from github releases with an active Android pill", () => {
  const items = parseGitHubReleaseItems([
    {
      tag_name: "v0.1.0",
      published_at: "2026-06-27T00:00:00Z",
      body: "## [0.1.0] - 2026-06-27\n\n### Added\n- an android thing",
    },
  ]);
  const html = renderReleasesPage(items, RELEASE_PAGE_CONFIGS.android);

  assert.equal(RELEASE_PAGE_CONFIGS.android.stream, "android");
  assert.match(html, /<link rel="canonical" href="https:\/\/solstone\.app\/releases\/android">/);
  assert.match(html, /<title>Android app releases — solstone<\/title>/);
  assert.match(html, /<h2 id="v0\.1\.0">solstone for Android 0\.1\.0<\/h2>/);
  assert.match(html, /an android thing/);
  // GitHub releases carry a date; the release heading is stripped from the body.
  assert.match(html, /class="rel-date"/);
  assert.doesNotMatch(html, /## \[0\.1\.0\]/);
  // beta channel: no public download, so no primary CTA on the intro.
  assert.doesNotMatch(html, /class="intro-dl"/);
  assert.match(html, /<span class="ss-pill ss-active" aria-current="page">Android<\/span>/);

  // and the Android pill renders as a link after Linux on other streams.
  const linuxHtml = renderReleasesPage([], RELEASE_PAGE_CONFIGS.linux);
  assert.match(linuxHtml, /<a class="ss-pill" href="\/releases\/android">Android<\/a>/);
  assert.ok(
    linuxHtml.indexOf('href="/releases/linux"') < linuxHtml.indexOf('href="/releases/android"') &&
      linuxHtml.indexOf('href="/releases/android"') < linuxHtml.indexOf("iOS soon"),
    "Android pill sits between Linux and the iOS-soon marker",
  );
});
