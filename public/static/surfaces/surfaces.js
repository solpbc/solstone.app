// the surfaces element: chapter tabs and view switches.
// Without this script every chapter and every view shows, stacked; with it, one chapter shows at a
// time (the WAI-ARIA tabs pattern: arrow keys, Home, End). Nothing advances on its own.
(function () {
  for (const root of document.querySelectorAll('[data-sf]')) {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const select = (i, focus) => {
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i, false));
      t.addEventListener('keydown', (e) => {
        const n = tabs.length;
        const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
        if (to !== undefined) { e.preventDefault(); select(to, true); }
      });
    });
    // views inside a chapter: toggle buttons, one pressed at a time
    for (const group of root.querySelectorAll('[data-sf-views]')) {
      const buttons = [...group.querySelectorAll('button[data-for]')];
      const shots = buttons.map((b) => document.getElementById(b.dataset.for));
      const show = (i) => buttons.forEach((b, k) => {
        b.setAttribute('aria-pressed', String(k === i));
        shots[k].hidden = k !== i;
      });
      buttons.forEach((b, i) => b.addEventListener('click', () => show(i)));
      show(0);
    }
    root.classList.add('is-live');
    select(0, false);
  }
})();
