// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

const SOL_ORANGE = '#E8923A';
const SOL_GOLD = '#F5C740';

const SOL_WORDMARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2.5 2.5 27 27" role="img" aria-label="sol logo">
  <title>sol</title>
  <path fill="${SOL_GOLD}" d="M16.0 2.5 L18.6 7.3 A9.1 9.1 0 0 0 13.4 7.3 Z M23.9 5.1 L23.2 10.5 A9.1 9.1 0 0 0 19.0 7.4 Z M28.8 11.8 L25.1 15.8 A9.1 9.1 0 0 0 23.5 10.9 Z M28.8 20.2 L23.5 21.1 A9.1 9.1 0 0 0 25.1 16.2 Z M23.9 26.9 L19.0 24.6 A9.1 9.1 0 0 0 23.2 21.5 Z M16.0 29.5 L13.4 24.7 A9.1 9.1 0 0 0 18.6 24.7 Z M8.1 26.9 L8.8 21.5 A9.1 9.1 0 0 0 13.0 24.6 Z M3.2 20.2 L6.9 16.2 A9.1 9.1 0 0 0 8.5 21.1 Z M3.2 11.8 L8.5 10.9 A9.1 9.1 0 0 0 6.9 15.8 Z M8.1 5.1 L13.0 7.4 A9.1 9.1 0 0 0 8.8 10.5 Z"/>
  <circle cx="16" cy="16" r="8.0" fill="none" stroke="${SOL_ORANGE}" stroke-width="1.2"/>
  <path fill="${SOL_ORANGE}" fill-rule="evenodd" d="M12.079 18.795C13.489 18.795 14.229 18.065 14.229 17.155C14.229 16.365 13.729 15.835 12.229 15.535C11.149 15.315 10.939 15.095 10.939 14.725C10.939 14.345 11.399 14.135 11.989 14.135C12.499 14.135 12.859 14.235 13.199 14.555C13.399 14.745 13.729 14.815 13.949 14.665C14.159 14.505 14.169 14.255 13.989 14.035C13.589 13.545 12.889 13.245 12.009 13.245C10.989 13.245 9.959 13.735 9.959 14.755C9.959 15.525 10.529 16.075 11.879 16.335C12.919 16.525 13.249 16.815 13.239 17.215C13.229 17.615 12.809 17.895 12.039 17.895C11.429 17.895 10.889 17.625 10.659 17.375C10.469 17.175 10.189 17.125 9.929 17.335C9.699 17.515 9.659 17.825 9.859 18.035C10.299 18.475 11.149 18.795 12.079 18.795Z M16.999 18.795C18.609 18.795 19.749 17.645 19.749 16.025C19.739 14.395 18.599 13.245 16.999 13.245C15.379 13.245 14.239 14.395 14.239 16.025C14.239 17.645 15.379 18.795 16.999 18.795ZM16.999 17.895C15.959 17.895 15.219 17.125 15.219 16.025C15.219 14.925 15.959 14.145 16.999 14.145C18.039 14.145 18.769 14.925 18.769 16.025C18.769 17.125 18.039 17.895 16.999 17.895Z M21.569 18.755H21.589C21.989 18.755 22.269 18.545 22.269 18.255C22.269 17.965 22.079 17.755 21.819 17.755H21.569C21.279 17.755 21.069 17.405 21.069 16.905V11.445C21.069 11.155 20.859 10.945 20.569 10.945C20.279 10.945 20.069 11.155 20.069 11.445V16.905C20.069 17.985 20.689 18.755 21.569 18.755Z"/>
</svg>`;

function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title, body, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(SOL_WORDMARK)}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      background: #fff;
      color: #222;
      line-height: 1.6;
    }
    .container {
      max-width: 640px;
      margin: 0 auto;
      padding: 3rem 1.5rem;
    }
    .logo { width: 64px; height: 64px; margin-bottom: 1.5rem; }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: lowercase;
      color: #222;
      margin-bottom: 0.5rem;
    }
    h2 {
      font-size: 1.2rem;
      font-weight: 600;
      color: ${SOL_ORANGE};
      margin: 2rem 0 0.75rem;
      text-transform: lowercase;
    }
    p { color: #555; margin-bottom: 1rem; }
    a { color: ${SOL_ORANGE}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .btn {
      display: inline-block;
      background: ${SOL_ORANGE};
      color: #fff;
      padding: 0.65rem 1.5rem;
      border-radius: 6px;
      border: none;
      font-size: 0.95rem;
      cursor: pointer;
      text-decoration: none;
      font-family: inherit;
    }
    .btn:hover { background: #d47e2e; text-decoration: none; }
    .btn-secondary {
      background: #f5f5f5;
      color: #555;
    }
    .btn-secondary:hover { background: #eee; }
    input[type="text"], input[type="email"], textarea, select {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 0.95rem;
      font-family: inherit;
      margin-bottom: 0.75rem;
    }
    textarea { min-height: 100px; resize: vertical; }
    label {
      display: block;
      font-size: 0.85rem;
      color: #888;
      margin-bottom: 0.25rem;
    }
    .card {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .token-box {
      background: #1a1a1a;
      color: #F5C740;
      font-family: monospace;
      padding: 1rem;
      border-radius: 6px;
      word-break: break-all;
      position: relative;
      margin-bottom: 0.75rem;
    }
    .token-hidden { filter: blur(5px); user-select: none; }
    .copy-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: ${SOL_ORANGE};
      color: #fff;
      border: none;
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .news-item { border-bottom: 1px solid #eee; padding: 1rem 0; }
    .news-item:last-child { border-bottom: none; }
    .news-date { font-size: 0.8rem; color: #aaa; }
    .status-badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-unknown { background: #f0f0f0; color: #888; }
    .status-applied { background: #fef3cd; color: #856404; }
    .status-approved { background: #d4edda; color: #155724; }
    .status-revoked { background: #f8d7da; color: #721c24; }
    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid #eee;
      font-size: 0.8rem;
      color: #aaa;
    }
    footer a { color: #aaa; }
    .error { color: #c0392b; background: #fdf0ef; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .nav { display: flex; gap: 1rem; margin-bottom: 2rem; align-items: center; }
    .nav .logo { margin-bottom: 0; width: 40px; height: 40px; }
    .nav-right { margin-left: auto; font-size: 0.85rem; }
    @media (max-width: 600px) {
      .container { padding: 2rem 1rem; }
      h1 { font-size: 1.4rem; }
    }
  </style>
  ${extraHead}
</head>
<body>
${body}
</body>
</html>`;
}

function nav(handle) {
  const handleHtml = handle ? `<span class="nav-right">@${esc(handle)} · <a href="/logout" onclick="fetch('/logout',{method:'POST'}).then(()=>location.href='/');return false;">sign out</a></span>` : '';
  return `<div class="nav">${SOL_WORDMARK.replace('width: 64px', '')}${handleHtml}</div>`;
}

// --- Public pages ---

export function renderLanding(error) {
  const errorHtml = error ? `<div class="error">${esc(error)}</div>` : '';
  return layout(
    'solstone scouts',
    `<div class="container">
  <div class="logo">${SOL_WORDMARK}</div>
  <h1>solstone scouts</h1>
  <p>help shape what comes next. sign in with your atmosphere account to get started.</p>
  <p style="font-size:0.85rem; color:#888;">if you have a Bluesky account, you already have one.</p>
  ${errorHtml}
  <form method="POST" action="/login" style="margin-top: 1.5rem;">
    <label for="handle">your handle</label>
    <input type="text" id="handle" name="handle" placeholder="yourname.bsky.social" required>
    <button type="submit" class="btn">sign in with atmosphere</button>
  </form>
  <footer>
    <p>solstone scouts is a program by <a href="https://solpbc.org">sol pbc</a>. your data stays with us — no analytics, no tracking, no third parties. <a href="https://solpbc.org/bylaws">read our bylaws</a>.</p>
  </footer>
</div>`
  );
}

export function renderError(message) {
  return layout(
    'error — solstone scouts',
    `<div class="container">
  <div class="logo">${SOL_WORDMARK}</div>
  <h1>something went wrong</h1>
  <div class="error">${esc(message)}</div>
  <a href="/" class="btn">back to home</a>
  <footer><p><a href="https://solpbc.org">sol pbc</a></p></footer>
</div>`
  );
}

// --- Dashboard pages (authenticated) ---

export function renderUnknown(scout) {
  return layout(
    'apply — solstone scouts',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>join the scouts</h1>
  <p>leave your email so we can reach you. it's only used for scout program updates — nothing else.</p>
  <form method="POST" action="/apply">
    <label for="email">email</label>
    <input type="email" id="email" name="email" required placeholder="you@example.com">
    <label for="use_case">what do you want to use solstone for? (optional)</label>
    <textarea id="use_case" name="use_case" placeholder="tell us about your use case..."></textarea>
    <button type="submit" class="btn">apply</button>
  </form>
  <footer><p><a href="https://solpbc.org">sol pbc</a></p></footer>
</div>`
  );
}

export function renderApplied(scout, news) {
  return layout(
    'application received — solstone scouts',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>we've got your application</h1>
  <p>you'll hear from us soon.</p>
  ${renderNewsFeed(news)}
  <footer><p><a href="https://solpbc.org">sol pbc</a></p></footer>
</div>`
  );
}

export function renderApproved(scout, geminiKey, news) {
  const tokenScript = `
    <script>
      function toggleToken() {
        const el = document.getElementById('token-value');
        const btn = document.getElementById('reveal-btn');
        if (el.classList.contains('token-hidden')) {
          el.classList.remove('token-hidden');
          btn.textContent = 'hide';
        } else {
          el.classList.add('token-hidden');
          btn.textContent = 'reveal';
        }
      }
      function copyToken() {
        const el = document.getElementById('token-value');
        navigator.clipboard.writeText(el.textContent.trim()).then(() => {
          const btn = document.getElementById('copy-btn');
          btn.textContent = 'copied!';
          setTimeout(() => btn.textContent = 'copy', 1500);
        });
      }
    </script>`;

  const tokenHtml = geminiKey
    ? `<div class="card">
    <h2>your gemini token</h2>
    <p>this is your personal API key. it powers solstone's thinking layer. don't share it.</p>
    <div class="token-box">
      <span id="token-value" class="token-hidden">${esc(geminiKey)}</span>
      <button class="copy-btn" id="copy-btn" onclick="copyToken()">copy</button>
    </div>
    <button class="btn btn-secondary" id="reveal-btn" onclick="toggleToken()" style="font-size:0.85rem;">reveal</button>
  </div>`
    : `<div class="card">
    <h2>your gemini token</h2>
    <p>your token is being set up. check back soon.</p>
  </div>`;

  const installHtml = `<div class="card">
    <h2>get started</h2>
    <p>install solstone and configure your token:</p>
    <ol style="padding-left:1.25rem; color:#555; margin-bottom:0.5rem;">
      <li style="margin-bottom:0.5rem;">follow the <a href="https://solstone.app/install">install guide</a></li>
      <li style="margin-bottom:0.5rem;">set <code style="background:#f5f5f5;padding:0.15rem 0.3rem;border-radius:3px;">providers.auth.google: "api_key"</code> in your journal config</li>
      <li>set your gemini token as <code style="background:#f5f5f5;padding:0.15rem 0.3rem;border-radius:3px;">GOOGLE_API_KEY</code> in your environment</li>
    </ol>
  </div>`;

  return layout(
    'dashboard — solstone scouts',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>welcome, scout</h1>
  ${tokenHtml}
  ${installHtml}
  <div class="card">
    <h2>submit feedback</h2>
    <form method="POST" action="/feedback">
      <label for="category">category</label>
      <select id="category" name="category">
        <option value="bug">bug</option>
        <option value="idea">idea</option>
        <option value="confusion">confusion</option>
        <option value="praise">praise</option>
      </select>
      <label for="feedback-body">what's on your mind?</label>
      <textarea id="feedback-body" name="body" required placeholder="tell us what you're experiencing..."></textarea>
      <button type="submit" class="btn">send feedback</button>
    </form>
  </div>
  ${renderNewsFeed(news)}
  <footer><p><a href="https://solpbc.org">sol pbc</a></p></footer>
</div>`,
    tokenScript
  );
}

export function renderRevoked(scout) {
  return layout(
    'access revoked — solstone scouts',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>access revoked</h1>
  <p>your scout access has been revoked. questions? <a href="mailto:jer@solpbc.org">jer@solpbc.org</a></p>
  <footer><p><a href="https://solpbc.org">sol pbc</a></p></footer>
</div>`
  );
}

function renderNewsFeed(news) {
  if (!news || news.length === 0) return '';
  const items = news
    .map(
      (n) => `<div class="news-item">
    <strong>${esc(n.title)}</strong>
    <span class="news-date"> — ${esc(n.posted_at?.slice(0, 10) || '')}</span>
    <p style="margin-top:0.3rem;">${esc(n.body)}</p>
  </div>`
    )
    .join('');
  return `<h2>news</h2>${items}`;
}

