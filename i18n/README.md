# Account portal copy

Edit the English in [the catalog](catalog/source/en-US.ftl). Each message has a
sidecar in `catalog/meta/` with its context, arguments and review class. Follow
the pinned compiler's `tools/i18n/README.md` when adding or retiring a message
or refreshing its source revision. Keep contract, statutory, payment and
consent messages in English until their translations are reviewed.

The Worker imports the generated `account` bundle. Pages and transactional
mail both use `en-US`, including mail sent on a schedule. Build the
`i18n-catalog` binary from the revision in [compiler.json](compiler.json),
then regenerate the bundle and run the account tests.

```sh
I18N_COMPILER=/path/to/i18n-catalog node i18n/update.mjs --write
cd account
npm test
```

The test command checks that the catalog, compiler pin and generated bundle
match the last regeneration. Rendering and tests use the committed output.
