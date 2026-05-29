import assert from "node:assert/strict";
import test from "node:test";

import {
  formatReleaseDate,
  parseAppcastItems,
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
  assert.equal(formatReleaseDate(undefined), null);
  assert.equal(formatReleaseDate("garbage"), null);
});

test("renderNotesMarkdown preserves heading and list structure", () => {
  const html = renderNotesMarkdown("### Added\n- one\n- two");

  assert.match(html, /<h3 class="rel-section">Added<\/h3>/);
  assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
  assert.doesNotMatch(html.toLowerCase(), /addedone/);
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
  assert.match(html, /<title>what's new — solstone<\/title>/);
  assert.match(
    html,
    /<footer>&copy; 2026 <a href="https:\/\/solpbc\.org">sol pbc<\/a> &middot; your data stays on your machine — never sold, never shared\. solstone is a trademark of sol pbc\.<\/footer>/,
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
  assert.match(html, /<h2 id="v1\.3\.4">solstone 1\.3\.4<\/h2>/);
  assert.match(html, /<h2 id="v1\.3\.3">solstone 1\.3\.3<\/h2>/);
  assert.match(html, /<p class="rel-date">may 28, 2026<\/p>/);

  const secondArticle = html.slice(html.indexOf('id="v1.3.3"'), html.indexOf("</article>", html.indexOf('id="v1.3.3"')));
  assert.doesNotMatch(secondArticle, /class="rel-date"/);
});

test("renderReleasesPage preserves chrome copy", () => {
  const html = renderReleasesPage([]);

  assert.match(
    html,
    /<meta property="og:description" content="every solstone release for macOS, in plain language\. your co-brain runs on your machine — never sold, never shared\.">/,
  );
  assert.match(
    html,
    /<p>every solstone release for macOS, newest first — in plain language\. what's new, what changed, what's no longer in your way\.<\/p>/,
  );
});

test("renderReleasesPage inserts notes with $-sequences literally (no replace-pattern interpretation)", () => {
  // $&, $', $` and $$ are special in a String.replace string replacement; a
  // release note containing them (e.g. a shell example) must render verbatim,
  // not splice in the matched/surrounding template text.
  const html = renderReleasesPage([
    {
      version: "1.4.0",
      pubDate: "Thu, 28 May 2026 05:42:58 GMT",
      description: "- run `echo $'literal'` then export $$HOME and $`path",
    },
  ]);

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
  const html = renderReleasesPage(items);

  assert.equal(items.length, 8);
  assert.deepEqual(
    items.map((item) => item.version),
    ["1.3.4", "1.3.3", "1.3.2", "1.3.1", "1.3.0", "1.2.0", "1.1.3", "1.1.2"],
  );
  assert.equal((html.match(/<article class="release">/g) ?? []).length, 8);
});
