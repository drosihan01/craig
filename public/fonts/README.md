# Fonts

Craig uses **PP Mori** (Pangram Pangram). It's a licensed typeface, so the files
are deliberately not committed. Buy/obtain the webfont licence, then drop these
three `.woff2` files into this directory:

```
public/fonts/
  PPMori-Extralight.woff2   → font-weight 200
  PPMori-Regular.woff2      → font-weight 400  (sold as "Book")
  PPMori-SemiBold.woff2     → font-weight 600
```

The `@font-face` rules already point at these exact paths — see the Fonts block
in `src/app/globals.css`. Until the files exist the rules fail silently and the
stack falls through to `system-ui`, so the app still renders correctly.

If the filenames you receive differ, rename them rather than editing the CSS.

## Adding a weight

Only add a weight if a component genuinely needs it. The system uses three:
200 for display sizes, 400 for body and UI, 600 for titles and emphasis.
