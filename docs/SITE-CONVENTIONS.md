# Site Conventions — quipsapp.com

Single source of truth for the shared pieces of every page. When adding or
editing a page, copy the snippets below verbatim. If you change a shared
snippet, update it here first, then apply it to **every** page listed in the
inventory. This file exists because pages drifted (privacy/terms were missing
the Email Course nav item, press.html had a different footer encoding, etc.).

## Page inventory

| Page | Purpose | Notes |
|------|---------|-------|
| `index.html` | Marketing homepage | Primary CTA = app download (Coming Soon until launch) |
| `collections.html` | Public collections index | Links to pre-rendered `/collections/<id>.html` pages |
| `collection.html` | Legacy client-rendered collection view (`?id=`) | Kept as fallback; canonical points to static page |
| `collections/<id>.html` | Pre-rendered collection pages | **Generated** by `scripts/build-collections.mjs` — never hand-edit; edit the script's template |
| `course.html` | 7-day email course landing | |
| `support.html` | Support + FAQ (renders `faqs.json`) | |
| `releases.html` | What's New / changelog | |
| `press.html` | Press kit | |
| `privacy.html` | Privacy policy | **Generated** by `scripts/build-legal.mjs` from `legal/privacy.md` — never hand-edit; edit the Markdown |
| `terms.html` | Terms & conditions | **Generated** by `scripts/build-legal.mjs` from `legal/terms.md` — never hand-edit; edit the Markdown |
| `404.html` | GitHub Pages not-found page | `noindex`; all paths root-absolute (it renders at any missing URL depth) |

## Canonical `<head>` requirements (every page)

In this order, after charset/viewport:

1. `<meta name="description">` — unique per page.
2. Canonical: `<link rel="canonical" href="https://quipsapp.com/<page>.html">`
   (homepage uses `https://quipsapp.com/`).
3. Open Graph — **absolute URLs only**:
   ```html
   <meta property="og:title" content="…">
   <meta property="og:description" content="…">
   <meta property="og:type" content="website">
   <meta property="og:url" content="https://quipsapp.com/<page>.html">
   <meta property="og:image" content="https://quipsapp.com/images/og-image.png">
   <meta property="og:image:width" content="1200">
   <meta property="og:image:height" content="630">
   ```
4. Twitter card (mirrors OG):
   ```html
   <meta name="twitter:card" content="summary_large_image">
   <meta name="twitter:title" content="…">
   <meta name="twitter:description" content="…">
   <meta name="twitter:image" content="https://quipsapp.com/images/og-image.png">
   ```
5. `<title>` — pattern: `<Page Name> — Quips` (homepage keeps its full marketing title).
6. Favicons, Google Fonts (with preconnects), `css/styles.css` — unchanged from existing pages.
7. Smart App Banner placeholder (uncomment at launch, one place to fill the id):
   ```html
   <!-- TODO(launch): uncomment and set the App Store id
   <meta name="apple-itunes-app" content="app-id=XXXXXXXXXX, app-argument=https://quipsapp.com/">
   -->
   ```
8. Cloudflare Web Analytics placeholder (uncomment + set token only if the
   beacon is NOT auto-injected by the Cloudflare proxy — adding both
   double-counts):
   ```html
   <!-- Cloudflare Web Analytics (manual beacon; skip if auto-injected)
   <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "TODO"}'></script>
   -->
   ```
9. Organization JSON-LD (identical on every page):
   ```html
   <script type="application/ld+json">
   {
     "@context": "https://schema.org",
     "@type": "Organization",
     "name": "Tweeting Birds",
     "url": "https://quipsapp.com/",
     "logo": "https://quipsapp.com/images/app-icon.png",
     "email": "feedback@quipsapp.com"
   }
   </script>
   ```
   Page-specific JSON-LD (SoftwareApplication on index, FAQPage where FAQs
   render) goes after it.

## Content Security Policy (every page)

Every page carries a CSP `<meta http-equiv>` tag. Two variants — the only
difference is MailerLite in `connect-src`/`form-action` on pages with signup
forms. Never add MailerLite hosts to `script-src` (we don't load their
scripts), and keep the Cloudflare Insights hosts so the analytics beacon works
when enabled.

Pages **with** MailerLite forms (`index.html`, `course.html`):

```
default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://assets.mailerlite.com https://cloudflareinsights.com; form-action 'self' https://assets.mailerlite.com; base-uri 'self'; object-src 'none';
```

All other pages (and the generated collection template in
`scripts/build-collections.mjs`): same policy minus
`https://assets.mailerlite.com` in `connect-src` and `form-action`.

## Theme pre-paint script (every page)

The theme class lives on `<body>` (`light-theme` / `dark-theme`, stored in
`localStorage['quips-theme']`, falling back to `prefers-color-scheme`).
`js/main.js` applies it too late to avoid a light-mode flash, so every page
must have this **inline script as the very first child of `<body>`** (body tag
keeps its hardcoded `class="light-theme"`):

```html
<body class="light-theme">
    <script>
    (function () {
        try {
            var theme = localStorage.getItem('quips-theme') ||
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            if (theme === 'dark') document.body.classList.replace('light-theme', 'dark-theme');
        } catch (e) { /* leave default light theme */ }
    })();
    </script>
```

## Canonical nav (every page)

Logo links to `index.html` (never `#`). Dropdown items, in this order:

```html
<a href="collections.html" class="nav-dropdown-item">Collections</a>
<a href="course.html" class="nav-dropdown-item">Email Course</a>
<a href="support.html" class="nav-dropdown-item">Support</a>
<a href="releases.html" class="nav-dropdown-item">What's New</a>
<a href="press.html" class="nav-dropdown-item">Press Kit</a>
<div class="nav-dropdown-divider"></div>
<button class="nav-dropdown-item theme-toggle-item" id="themeToggle">…</button>
```

The nav action button is `<a href="index.html#download" class="btn btn-primary">Get Quips</a>`
(`href="#download"` on index itself, `/index.html#download` on pages in
subdirectories). Pre-rendered collection pages and 404.html use root-absolute
paths (`/index.html`, `/css/styles.css`) since they render at non-root URLs.

## Canonical footer (every page)

Brand block, then links **in this order** (raw `&` — not `&amp;amp;`):

```html
<a href="privacy.html">Privacy Policy</a>
<a href="terms.html">Terms & Conditions</a>
<a href="press.html">Press Kit</a>
```

Copyright line: `&copy; <span id="copyright-year">2025</span> Tweeting Birds. All rights reserved.`
(year is updated by `js/main.js`).

## App Store links & click tracking

- Until launch, download CTAs render as a non-link "Coming Soon to the
  App Store" pill (`.btn-coming-soon`), NOT an `href="#"` badge.
- At launch, every badge points to the local redirect page
  `/go/appstore.html?p=<placement>` (placements: `hero`, `cta`, `nav`,
  `collection`). The redirect page holds the single real App Store URL and
  appends `ct=website-<placement>` campaign tokens. Cloudflare Web Analytics
  pageviews of `/go/appstore.html` = badge clicks (CF WA has no custom
  events), so visits vs. clicks gives the conversion funnel.

## Forms (MailerLite)

- We POST directly to MailerLite's subscribe endpoints from `js/main.js`.
  **Never** load MailerLite scripts (`webforms.min.js`) or their `takel`
  tracking pixel — the site must not run third-party trackers.
- Every email input needs an associated visually-hidden `<label>`
  (`class="sr-only"`), not just a placeholder.
- Success copy must say "check your inbox to confirm" (double opt-in), since
  `no-cors` POSTs can't verify acceptance.

## Copy & naming

- App name is **Quips** everywhere. "Quotebook" is the retired codename —
  the only permitted use is the legacy SEO keyword in index.html meta keywords.
- Marketing prose says "curated collections" (lowercase); the capitalized UI
  label "Public Collections" appears only in the press kit fact sheet.
- Feature names: Share Studio, Quote Style, Daily Quote, Private Collections.
- Voice: first person singular ("I", indie developer) on support/press/
  collections pages; avoid corporate "we".
- Public contact email: `feedback@quipsapp.com`. (`nate@quipsapp.com` appears
  only in the course welcome copy as a personal touch.)
- Pricing: free tier = 25 saved quotes; Premium = $0.99/month or $8.99/year
  (limited launch pricing), unlocking unlimited quotes, all Quote Style colors
  and typefaces, and watermark-free Share Studio sharing. Keep faqs.json,
  terms.html, press.html, and the homepage pricing strip in sync.

## App icon assets

- `images/app-icon.png` (512px, light/default) and `images/app-icon-dark.png`
  (512px, dark variant) are the site-chrome icons. Every logo/footer/CTA icon
  renders BOTH as a pair — `class="… app-icon-light"` then the dark img with
  `class="… app-icon-dark"` — and the active theme shows one via CSS
  (`.light-theme .app-icon-dark { display: none }` etc.), same pattern as the
  screenshot pairs.
- `images/app-icon@1024.png` / `images/app-icon-dark@1024.png` are full-res
  originals, linked only from the press kit downloads.
- `images/apple-touch-icon.png` (180px) and `images/favicon-64.png` (64px) are
  derived from the light/default icon (`sips -z`). Regenerate all derivatives
  whenever the icon changes.
- JSON-LD `logo` and OG images always use the light/default icon.

## Social preview (og-image)

`images/og-image.svg` is the editable source; `images/og-image.png` (exactly
1200×630) is what every page's `og:image`/`twitter:image` points at and what
the press kit bundles. To regenerate after editing the SVG: render it in
headless Chromium at a 1200×630 viewport with `deviceScaleFactor: 2`
(Playwright screenshot), downscale to 1200×630 (`sips -z 630 1200`), replace
og-image.png, then rerun `node scripts/build-press-kit.mjs`. Design notes:
brand teal gradient (#00D7D0 → #00B8B2), "Quips" in Baskerville (the site's
heading serif), tagline "QUOTES DESERVE MORE THAN A SCREENSHOT".

## Images

- Every `<img>` gets explicit `width`/`height` attributes (intrinsic pixel
  size — check with `sips -g pixelWidth -g pixelHeight <file>`); CSS keeps
  them responsive.
- Below-the-fold images get `loading="lazy"`. Above-the-fold hero images stay
  eager. PNG format (no WebP conversion — owner preference).

## Generated files (never hand-edit)

`collections/*.html` and `sitemap.xml` are generated by
`scripts/build-collections.mjs` (run in CI by `.github/workflows/deploy.yml`
after the collections data pull; run locally with `node scripts/build-collections.mjs`).
Both are gitignored. `robots.txt` is static and committed.

`images/quips-press-kit.zip` is generated by `scripts/build-press-kit.mjs`
(also in CI + locally). Its fact-sheet text is extracted from press.html at
build time and its screenshots come from `images/screenshots.json`, so editing
those sources is all that's needed — never hand-edit the zip.

`terms.html` and `privacy.html` are generated by `scripts/build-legal.mjs`
(also in CI + locally; run with `node scripts/build-legal.mjs`) from
`legal/terms.md` and `legal/privacy.md`. Edit the Markdown, not the HTML —
see "Legal documents" below.

## Legal documents (Markdown source)

`legal/terms.md` and `legal/privacy.md` are the source of truth for the
Terms and Privacy Policy. They're Markdown for two reasons: they stay
human-readable/diffable as a source, and the same file is fetched and
rendered natively by the iOS app — at `https://quipsapp.com/legal/terms.md`
and `/legal/privacy.md` — instead of showing a WebView (mirrors the existing
pattern of the app fetching `announcements.json`/`faqs.json` directly from
this repo).

`scripts/build-legal.mjs` converts each file to HTML at build time, using a
small hand-rolled, zero-dependency parser (matches the no-npm-deps
convention of `build-collections.mjs`/`build-press-kit.mjs`). It only
supports the subset these documents actually need — keep new edits inside
this subset so both the website and the app's native Markdown renderer
display them identically:

- `#` / `##` / `###` — headings. Add an explicit anchor with
  `## Heading {#custom-id}` (needed for the Privacy Policy's
  `#website-newsletter` cross-reference); there's no auto-slug fallback.
- Blank-line-separated paragraphs. A single `\n` inside one becomes `<br>`.
- `- item` / `1. item` — flat (non-nested) unordered/ordered lists only.
- `> line` — blockquote; renders as the "In simple terms" summary-box
  callout on the website. A bare `>` line is a blank line *inside* the
  quote (needed to separate the lead-in paragraph, the list, and the
  closing "Questions?" line without ending the callout early).
- `**bold**` and `[text](url)` inline. Links to `http(s)://` URLs outside
  `quipsapp.com` automatically get `target="_blank" rel="noopener"`.
- No italics, tables, or nested lists — the docs don't need them; don't add
  syntax to the parser without adding a document that actually uses it.
- Conspicuous disclaimers (e.g. the "AS IS" warranty section) are written
  in literal ALL CAPS in the Markdown itself, not via a CSS class — that
  way the emphasis survives being rendered by the app instead of a browser.
