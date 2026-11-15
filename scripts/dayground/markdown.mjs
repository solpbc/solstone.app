// A small markdown renderer for the dayground page: headings, paragraphs, lists, tables, fenced code,
// inline code, bold, italic and links. Only what scripts/dayground/dayground.src.md uses, so the page
// and dayground.md carry the same words without a dependency.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slug(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u.replace(/^https:\/\/solstone\.app(?=\/)/, '')}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function table(lines) {
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  return '<div class="table-scroll"><table>\n<thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') +
    '</tr></thead>\n<tbody>\n' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('\n') +
    '\n</tbody></table></div>';
}

export function renderMarkdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const h = line.match(/^(#{1,4}) (.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level} id="${slug(h[2])}">${inline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { body.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i += 1; }
      out.push(table(rows));
      continue;
    }
    const list = line.match(/^(-|\d+\.) /);
    if (list) {
      const ordered = list[1] !== '-';
      const items = [];
      while (i < lines.length && /^(-|\d+\.) /.test(lines[i])) {
        let item = inline(lines[i].replace(/^(-|\d+\.) /, ''));
        i += 1;
        const nested = [];
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) {
          if (/^ {2,}- /.test(lines[i])) nested.push(lines[i].replace(/^ +- /, ''));
          else if (nested.length) nested[nested.length - 1] += ' ' + lines[i].trim();
          else item += ' ' + inline(lines[i].trim());
          i += 1;
        }
        if (nested.length) item += '\n<ul>\n' + nested.map((n) => `<li>${inline(n)}</li>`).join('\n') + '\n</ul>\n';
        items.push(`<li>${item}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>\n${items.join('\n')}\n</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4} |```|\||(-|\d+\.) )/.test(lines[i])) { para.push(lines[i].trim()); i += 1; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n') + '\n';
}
