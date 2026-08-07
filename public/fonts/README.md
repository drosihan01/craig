# Fonts

Craig uses **Google Sans Flex**, self-hosted. The files here are committed.

```
GoogleSansFlex-latin.woff2       51KB  — preloaded in src/app/layout.tsx
GoogleSansFlex-latin-ext.woff2   25KB  — loaded on demand via unicode-range
```

One variable file covers **weight 100–1000**, so every weight in the system
comes from a single request and there's no FOUT switching between them. The
`@font-face` rules live in the Fonts block of `src/app/globals.css`.

## Why self-hosted rather than `fonts.googleapis.com`

- No third-party connection, so no extra DNS + TLS round trip on first paint.
- Survives a strict `Content-Security-Policy` without a `font-src` exception.
- The font can't change under us.

## Licence

Google Sans Flex is flagged `isOpenSource: true` in the Google Fonts catalogue,
which is why these files are committed to a public repo.

**`.gitignore` blocks font binaries by default** and allow-lists only
`GoogleSansFlex-*.woff2`. That's deliberate — it stops a licensed face landing
in a public repo by accident. If you vendor another font, confirm its licence
permits redistribution, then add an explicit negation.

## Updating

Re-fetch from the Google Fonts CSS API with a modern browser User-Agent (an old
one gets static `.ttf` instances instead of the variable `.woff2`):

```bash
curl -A "Mozilla/5.0 ... Chrome/131.0.0.0 ..." \
  "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@100..1000&display=swap"
```

Pull the `latin` and `latin-ext` URLs from the response. If the `unicode-range`
values changed, update them in `globals.css` to match.
