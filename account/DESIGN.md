# Services Portal Design

The services portal experience layer was ported to the operator-approved redesign, approved 2026-06-11.

The active design system lives in `account/src/portal.css` and `account/src/fonts/*.woff2`. Those source assets are embedded for Worker serving through `account/src/assets.js`, and are served same-origin at `/portal.css` and `/fonts/<name>.woff2`.

Full rationale and accessibility numbers live in the private design record for this pass, approved 2026-06-11.

Chrome decision: the persistent top-bar usermenu shows the owner's email and last sign-in on every authenticated page; a shared menu-context helper loads that data and each signed-in handler threads it into its renderer.

Deletion chrome (2026-09-23): while an account has an active deletion, its session reaches only `/account/delete*` and, until purging, the export carve-out. The deletion and export pages then use `loadDeletionMenuContext`, and the top bar drops every link that would end that session: the wordmark is not a link, the menu offers only the deletion request, data download (when the carve-out allows it) and sign out, and the footer leaves out data transparency and support. The receipt-only status page offers sign-in only while the hold can still be cancelled and the viewer cannot cancel from where they are.
