# Services Portal Design

The services portal experience layer was ported to the operator-approved redesign, approved 2026-06-11.

The active design system lives in `account/src/portal.css` and `account/src/fonts/*.woff2`. Those source assets are embedded for Worker serving through `account/src/assets.js`, and are served same-origin at `/portal.css` and `/fonts/<name>.woff2`.

Full rationale and accessibility numbers live in the private design record for this pass, approved 2026-06-11.

Chrome decision: the persistent top-bar usermenu shows the owner's email and last sign-in on every authenticated page; a shared menu-context helper loads that data and each signed-in handler threads it into its renderer.
