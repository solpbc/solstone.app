// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

const SOL_ORANGE = '#E8923A';
const SOL_GOLD = '#F5C740';

const COMFORTAA_B64 = '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';

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
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⛺</text></svg>">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @font-face {
      font-family: 'Comfortaa';
      src: url(data:font/woff2;base64,${COMFORTAA_B64}) format('woff2');
      font-weight: 300 700;
      font-display: swap;
    }
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
      font-family: 'Comfortaa', system-ui, sans-serif;
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: lowercase;
      color: #222;
      margin-bottom: 0.5rem;
    }
    h2 {
      font-family: 'Comfortaa', system-ui, sans-serif;
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
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      min-height: 44px;
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
      padding: 0.65rem 0.75rem;
      min-height: 44px;
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
      color: #767676;
      margin-bottom: 0.25rem;
    }
    .card {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 10px;
      padding: 1.75rem;
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
    .news-date { font-size: 0.8rem; color: #767676; }
    .status-badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: lowercase;
    }
    .status-unknown { background: #f0f0f0; color: #767676; }
    .status-applied { background: #fef3cd; color: #856404; }
    .status-approved { background: #d4edda; color: #155724; }
    .status-revoked { background: #f8d7da; color: #721c24; }
    footer {
      margin-top: auto;
      padding: 3rem 0 2rem;
      border-top: 1px solid #eee;
      font-family: 'Comfortaa', system-ui, sans-serif;
      font-size: 0.85rem;
      color: #767676;
    }
    footer a { color: #767676; }
    .error { color: #c0392b; background: #fdf0ef; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .nav { display: flex; gap: 1rem; margin-bottom: 2rem; align-items: center; }
    .nav .logo { margin-bottom: 0; width: 40px; height: 40px; }
    .nav-right { margin-left: auto; font-size: 0.85rem; }
    @media (max-width: 640px) {
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
  return `<div class="nav"><div class="logo" style="flex-shrink:0;">${SOL_WORDMARK}</div>${handleHtml}</div>`;
}

// --- Public pages ---

export function renderLanding(error) {
  const errorHtml = error ? `<div class="error">${esc(error)}</div>` : '';
  const landingStyles = `<style>
    body { display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; }
    .container form { text-align: left; }
    .container .btn { width: 100%; display: block; }
  </style>`;
  return layout(
    'solstone scouts',
    `<div class="container">
  <div class="logo" style="margin:0 auto;">${SOL_WORDMARK}</div>
  <h1>solstone scouts</h1>
  <p>help shape what comes next. sign in with your atmosphere account to get started.</p>
  <p style="font-size:0.85rem; color:#767676;">if you're on bluesky, you already have one — it runs on the atmosphere network. don't have one? <a href="https://bsky.app">create one at bsky.app</a> — takes 30 seconds.</p>
  ${errorHtml}
  <p style="font-size:0.8rem; color:#767676; margin-bottom:1.5rem;">no analytics, no tracking, no third parties</p>
  <form method="POST" action="/login" style="margin-top: 1.5rem;">
    <label for="handle">your handle</label>
    <input type="text" id="handle" name="handle" placeholder="yourname.bsky.social" required>
    <button type="submit" class="btn">sign in with atmosphere</button>
  </form>
  <footer>
    <p>solstone scouts is a program by <a href="https://solpbc.org">sol pbc</a>. your data stays on your machine — no analytics, no tracking, no third parties. <a href="https://solpbc.org/articles">read our covenants</a>.</p>
  </footer>
</div>`,
    landingStyles
  );
}

export function renderError(message) {
  return layout(
    'solstone scouts — error',
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
    'solstone scouts — apply',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>join the scouts</h1>
  <p>leave your email so we can reach you. it's only used for scout program updates — nothing else.</p>
  <form method="POST" action="/apply">
    <label for="email">email</label>
    <input type="email" id="email" name="email" required placeholder="you@example.com">
    <label for="use_case">what do you want to use solstone for? (optional)</label>
    <textarea id="use_case" name="use_case" placeholder="what are you hoping it helps with?"></textarea>
    <button type="submit" class="btn">apply</button>
  </form>
  <footer><p><a href="https://solpbc.org">sol pbc</a></p></footer>
</div>`
  );
}

export function renderApplied(scout, news) {
  return layout(
    'solstone scouts',
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

  const dataLink = `<p style="font-size:0.8rem; color:#767676; margin-top:0.5rem;"><a href="/data" style="color:#767676;">how your data is handled</a></p>`;

  let tokenHtml;
  if (!scout.data_acknowledged && geminiKey) {
    // Gate: must acknowledge data disclosure before revealing key
    tokenHtml = `<div class="card">
    <h2>your gemini token</h2>
    <p>before your token — <a href="/data">read how your data is handled</a> when you use this key.</p>
  </div>`;
  } else if (geminiKey) {
    tokenHtml = `<div class="card">
    <h2>your gemini token</h2>
    <p>this is your personal API key. it powers solstone's thinking layer. don't share it.</p>
    <div class="token-box">
      <span id="token-value" class="token-hidden">${esc(geminiKey)}</span>
      <button class="copy-btn" id="copy-btn" onclick="copyToken()">copy</button>
    </div>
    <button class="btn btn-secondary" id="reveal-btn" onclick="toggleToken()" style="font-size:0.85rem;">reveal</button>
    ${dataLink}
  </div>`;
  } else {
    tokenHtml = `<div class="card">
    <h2>your gemini token</h2>
    <p>your token is being set up. check back soon.</p>
  </div>`;
  }

  const installHtml = `<div class="card">
    <h2>get started</h2>
    <p>open your terminal and paste this to your coding agent (claude code, codex cli, or similar):</p>
    <div class="token-box" style="font-size:0.85rem; margin-bottom:0.75rem;">
      <span>follow https://solstone.app/install to install and configure solstone with my gemini token</span>
      <button class="copy-btn" onclick="navigator.clipboard.writeText('follow https://solstone.app/install to install and configure solstone with my gemini token').then(()=>{this.textContent='copied!';setTimeout(()=>this.textContent='copy',1500)})">copy</button>
    </div>
    <p style="font-size:0.85rem; color:#767676;">don't have a coding agent? <a href="https://docs.anthropic.com/en/docs/claude-code/overview">install claude code</a> first — it takes 2 minutes.</p>
  </div>`;

  return layout(
    'solstone scouts',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>⛺ welcome, scout</h1>
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
    'solstone scouts',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>access revoked</h1>
  <p>your scout access has been revoked. questions? <a href="mailto:jer@solpbc.org">jer@solpbc.org</a></p>
  <footer><p><a href="https://solpbc.org">sol pbc</a></p></footer>
</div>`
  );
}

export function renderDataDisclosure(scout) {
  const ackButton = scout.data_acknowledged
    ? ''
    : `<form method="POST" action="/data/acknowledge" style="margin-top:2rem;">
    <button type="submit" class="btn">i've read this</button>
  </form>`;

  return layout(
    'solstone scouts — your data',
    `<div class="container">
  ${nav(scout.handle)}
  <h1>your gemini key and your data</h1>

  <p><strong>the short version</strong></p>
  <p>your gemini key connects solstone's thinking layer to google's gemini API. when solstone thinks on your behalf, it sends content from your journal to google and gets responses back. google does not use any of that to train their models — your key is on a paid tier that explicitly prohibits it. sol pbc can't see what you send or what comes back. we see a bill at the end of the month, not your journal.</p>

  <hr style="border:none; border-top:1px solid #eee; margin:2rem 0;">

  <h2>what happens when solstone calls gemini</h2>
  <p>solstone runs on your machine. when it needs to think — reflect on what you've captured, generate insights, connect ideas — it sends prompts to google's gemini API using your key. those prompts contain content derived from your journal. google processes them and sends responses back to solstone on your device.</p>
  <p>your journal content travels directly between your machine and google. sol pbc is not in that path.</p>

  <h2>google doesn't train on your data</h2>
  <p>your key is provisioned under a paid google cloud project. under google's <a href="https://ai.google.dev/gemini-api/terms">gemini API terms</a>, paid-tier data is explicitly excluded from training:</p>
  <blockquote style="border-left:3px solid #eee; padding-left:1rem; color:#666; margin:1rem 0; font-style:italic;">"google doesn't use your prompts (including associated system instructions, cached content, and files such as images, videos, or documents) or responses to improve our products."</blockquote>
  <p>nobody at google reads your content either. on the paid tier, there's no human review of what flows through the API.</p>

  <h2>how long google keeps it</h2>
  <p>google stores prompts and responses for up to <strong>55 days</strong> for safety monitoring — checking for violations of their <a href="https://ai.google.dev/gemini-api/docs/usage-policies">usage policy</a>. only authorized google personnel can access this data, and only when investigating potential policy violations. it's automatically deleted after 55 days.</p>
  <p>google also keeps a temporary copy in memory (RAM, not disk) for up to 24 hours to speed up responses. that's isolated to our project and clears itself.</p>
  <p>we've applied to google for zero data retention on the project that provisions scout keys. if approved, google will stop storing prompts and responses entirely — eliminating the 55-day window. we'll update this page when that's in effect.</p>

  <h2>sol pbc can't see your data</h2>
  <p>sol pbc <strong>does not have access to the content</strong> of your API calls. we can't read your prompts. we can't read gemini's responses. we see billing — how many calls were made, how many tokens, what it cost. that's it.</p>
  <p>we gave you the key and we can revoke it. we cannot see what flows through it. this is intentional — our <a href="https://solpbc.org/bylaws">bylaws</a> prohibit us from using your data for anything other than providing the service directly to you, and we've built the architecture to match.</p>

  <h2>what you control</h2>
  <p>solstone runs on your hardware. you decide what it observes and what it sends to gemini. you can stop using the key anytime. if you want it revoked, email <a href="mailto:jer@solpbc.org">jer@solpbc.org</a> and we'll delete it from google's systems.</p>
  <p>one thing: don't share your key. it's provisioned specifically for you and tied to your scout account.</p>

  <h2>the covenants behind this</h2>
  <p>sol pbc is a colorado public benefit corporation. our <a href="https://solpbc.org/bylaws">bylaws</a> contain irrevocable data governance covenants — not policies that can be quietly updated, but structural commitments baked into how the company is built:</p>
  <ul style="padding-left:1.25rem; color:#555; margin-bottom:1rem;">
    <li style="margin-bottom:0.5rem;"><strong>we will never sell your data.</strong> not anonymized, not aggregated, not de-identified. no third-party access, no exceptions. (bylaws, article IV, section 4.1)</li>
    <li style="margin-bottom:0.5rem;"><strong>we will never use your data for anything other than the service.</strong> no analytics, no tracking, no profiling, no advertising. ever. (bylaws, article IV, section 4.2)</li>
  </ul>
  <p>these can't be changed without 90% shareholder approval and the founder's personal written consent. they survive any change in management. they're the reason sol pbc exists as a public benefit corporation in the first place.</p>
  <p>google's role here is what the bylaws call a permitted processor — they handle your data solely to provide the gemini API service, under <a href="https://cloud.google.com/terms/data-processing-addendum">contractual terms</a> that prohibit them from using it for their own purposes.</p>

  <h2>questions?</h2>
  <p><a href="mailto:jer@solpbc.org">jer@solpbc.org</a> — always.</p>

  ${ackButton}

  <footer>
    <p><a href="/dashboard">back to dashboard</a> · <a href="https://solpbc.org">sol pbc</a></p>
  </footer>
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

