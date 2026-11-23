# Website and account portal copy

Edit English messages in [the catalog](catalog/source/en-US.ftl). Each message
has a sidecar in `catalog/meta/` with its context, arguments and review class.
Follow the compiler's `tools/i18n/README.md` when adding or retiring a message
or refreshing its source revision. Keep `legal` and `statutory` messages in
their source text until their translations are approved. Translate `consent`
and `payment` messages through the normal catalog workflow with human review;
their sidecars keep `auto_merge: false`.

For changes to the public site, edit layouts in [pages](pages/). A
`[[i18n:message.id]]` marker reads the corresponding message. Keep IDs, URLs
and code used by browsers as fixed values. When a sentence has an inline link
or command, keep it with the sentence and preserve its markup in protected
slots. The Dayground generator reads the catalog before expanding the worked
examples in `scripts/dayground/dayground.src.md`.

Both Workers use English (`en-US`). The site generates its files in `public/`
and reads the `website` bundle for copy composed by the Worker. The account
portal reads the `account` bundle for pages and transactional mail.

Build `i18n-catalog` from the revision in [compiler.json](compiler.json). From
the repository root, regenerate the bundles and check the public site.

```sh
I18N_COMPILER=/path/to/i18n-catalog node i18n/update.mjs --write
make stamp
make check
```

Run `npm test` in `account/` for portal changes. Commit the catalog and
generated output together.
