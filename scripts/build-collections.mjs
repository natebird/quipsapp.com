#!/usr/bin/env node
// Build script: pre-renders /collections/<id>.html pages and sitemap.xml.
//
// Reads collections.json (manifest) and collections/<id>.json (quote data),
// emits one static HTML page per collection plus a sitemap.xml at the repo
// root. Both outputs are gitignored — never hand-edit them; edit the template
// in this file instead (see docs/SITE-CONVENTIONS.md, "Generated files").
//
// Usage: node scripts/build-collections.mjs   (from the repo root or anywhere)
// No npm dependencies — plain node:fs / node:path.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Plain CommonJS so the same file can also load as a <script> in the browser.
import iconSet from '../js/icons.js';

const { ICONS, ALIASES: ICON_ALIASES } = iconSet;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://quipsapp.com';
const COLLECTIONS_DIR = path.join(ROOT, 'collections');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(message) {
    console.error(`build-collections: ERROR: ${message}`);
    process.exit(1);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// JSON.stringify for embedding inside <script type="application/ld+json">.
// Escapes `<` so quote text can never terminate the script element early.
function jsonLd(value) {
    return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function readJson(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        fail(`cannot read ${path.relative(ROOT, filePath)}: ${e.message}`);
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        fail(`malformed JSON in ${path.relative(ROOT, filePath)}: ${e.message}`);
    }
}

// "<Name> Quotes — Quips", unless the name already contains "Quote(s)".
function pageTitle(name) {
    return /\bquotes?\b/i.test(name) ? `${name} — Quips` : `${name} Quotes — Quips`;
}

function metaDescription(collection, quoteCount) {
    let desc = String(collection.description || '').trim();
    if (desc && !/[.!?]$/.test(desc)) desc += '.';
    const suffix = `Read all ${quoteCount} quotes in the ${collection.name} collection, free from Quips.`;
    let text = desc ? `${desc} ${suffix}` : suffix;
    if (text.length > 250) text = `${text.slice(0, 249).replace(/\s+\S*$/, '')}…`;
    return text;
}

// Icon lookup. The SVG set itself lives in js/icons.js so the browser and this
// build render from one copy — they used to hold separate literals and drifted.
function resolveIconName(iconName) {
    return Object.prototype.hasOwnProperty.call(ICON_ALIASES, iconName) ? ICON_ALIASES[iconName] : iconName;
}

function hasIcon(iconName) {
    return Object.prototype.hasOwnProperty.call(ICONS, resolveIconName(iconName));
}

// Published as /icons.json so quips-collections can validate a new collection's
// iconName offline, against a checked-in mirror of this list, instead of finding
// out at deploy time. Names only — the drawings stay here, where they are used.
// An alias counts as supported: hasIcon() resolves it before looking up.
function iconNamesJson() {
    const names = [...new Set([...Object.keys(ICONS), ...Object.keys(ICON_ALIASES)])].sort();
    return JSON.stringify(
        {
            note: 'iconName values quipsapp.com can render. Generated from js/icons.js by scripts/build-collections.mjs — do not hand-edit.',
            names
        },
        null,
        2
    ) + '\n';
}

function getIconSvg(iconName) {
    return ICONS[resolveIconName(iconName)] || ICONS['sunrise.fill'];
}

// ---------------------------------------------------------------------------
// Page template (mirrors collection.html's rendered markup; root-absolute
// paths because these pages live under /collections/).
// ---------------------------------------------------------------------------

const ORGANIZATION_JSON_LD = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tweeting Birds',
    url: 'https://quipsapp.com/',
    logo: 'https://quipsapp.com/images/app-icon.png',
    email: 'feedback@quipsapp.com'
});

function quoteItemHtml(quote) {
    const source = quote.source
        ? `\n                        <span class="quote-source">${escapeHtml(quote.source)}</span>`
        : '';
    const note = quote.notes
        ? `\n                    <p class="quote-note">${escapeHtml(quote.notes)}</p>`
        : '';
    return `                <div class="quote-item">
                    <p class="quote-text">${escapeHtml(quote.content)}</p>
                    <div class="quote-attribution">
                        <span class="quote-author">${escapeHtml(quote.authorName)}</span>${source}
                    </div>${note}
                </div>`;
}

function collectionPageHtml(collection) {
    const quotes = Array.isArray(collection.quotes) ? collection.quotes : [];
    const name = collection.name;
    const title = pageTitle(name);
    const description = metaDescription(collection, quotes.length);
    const pageUrl = `${SITE}/collections/${collection.id}.html`;

    const itemListJsonLd = jsonLd({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${name} quotes`,
        description: String(collection.description || ''),
        url: pageUrl,
        numberOfItems: quotes.length,
        itemListElement: quotes.map((quote, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
                '@type': 'Quotation',
                text: String(quote.content || ''),
                creator: { '@type': 'Person', name: String(quote.authorName || '') }
            }
        }))
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; form-action 'self'; base-uri 'self'; object-src 'none';">
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">

    <!-- Open Graph / Social -->
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="https://quipsapp.com/images/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="https://quipsapp.com/images/og-image.png">

    <title>${escapeHtml(title)}</title>

    <link rel="icon" type="image/png" sizes="64x64" href="/images/favicon-64.png">
    <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/css/styles.css">
    <style>
        /* Page-local styles for generated collection pages. :where() keeps
           specificity at zero so css/styles.css can override any of these. */
        :where(.quote-note) { margin-top: 0.75rem; font-size: 0.8125rem; font-style: italic; color: var(--text-muted); }
        :where(.collection-cta) { border-radius: var(--card-radius); margin-top: 3rem; }
        :where(.collection-cta .btn-coming-soon) { background-color: rgba(255, 255, 255, 0.15); color: #fff; border: 1px solid rgba(255, 255, 255, 0.4); cursor: default; }
    </style>

    <!-- TODO(launch): uncomment and set the App Store id
    <meta name="apple-itunes-app" content="app-id=XXXXXXXXXX, app-argument=${pageUrl}">
    -->

    <!-- Cloudflare Web Analytics (manual beacon; skip if auto-injected)
    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "TODO"}'></script>
    -->

    <script type="application/ld+json">
${ORGANIZATION_JSON_LD}
    </script>
    <script type="application/ld+json">
${itemListJsonLd}
    </script>
</head>
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
    <header class="header">
        <nav class="nav container">
            <a href="/index.html" class="logo">
                <img src="/images/app-icon.png" alt="Quips" class="logo-icon app-icon-light" width="512" height="512"><img src="/images/app-icon-dark.png" alt="Quips" class="logo-icon app-icon-dark" width="512" height="512">
                <span class="logo-text">Quips</span>
            </a>
            <div class="nav-actions">
                <div class="nav-menu-container">
                    <button class="menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false">
                        <svg class="icon-menu" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                        <svg class="icon-close" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    <div class="nav-dropdown" id="navDropdown">
                        <a href="/collections.html" class="nav-dropdown-item">Collections</a>
                        <a href="/releases.html" class="nav-dropdown-item">What's New</a>
                        <a href="/quote-unquote.html" class="nav-dropdown-item">Quote Unquote</a>
                        <a href="/course.html" class="nav-dropdown-item">Email Course</a>
                        <a href="/support.html" class="nav-dropdown-item">Support</a>
                        <a href="/press.html" class="nav-dropdown-item">Press Kit</a>
                        <div class="nav-dropdown-divider"></div>
                        <button class="nav-dropdown-item theme-toggle-item" id="themeToggle">
                            <span class="theme-label-light">Dark Mode</span>
                            <span class="theme-label-dark">Light Mode</span>
                            <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="5"></circle>
                                <line x1="12" y1="1" x2="12" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="23"></line>
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                <line x1="1" y1="12" x2="3" y2="12"></line>
                                <line x1="21" y1="12" x2="23" y2="12"></line>
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                            </svg>
                            <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <a href="/index.html#download" class="btn btn-primary">Get Quips</a>
            </div>
        </nav>
    </header>

    <main class="collections-content">
        <a href="/collections.html" class="back-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            All Collections
        </a>

        <div id="collection-detail">
            <div class="collection-hero" data-color="${escapeHtml(collection.colorName)}">
                <div class="collection-icon">${getIconSvg(collection.iconName)}</div>
                <h1>${escapeHtml(name)}</h1>
                <div class="collection-hero-meta">
                    <span class="collection-hero-badge">${escapeHtml(collection.category)}</span>
                    <span>${quotes.length} quotes</span>
                </div>
                <p>${escapeHtml(collection.description)}</p>
            </div>
            <div class="quotes-grid" data-color="${escapeHtml(collection.colorName)}">
${quotes.map(quoteItemHtml).join('\n')}
            </div>
        </div>

        <section class="cta collection-cta">
            <div class="container cta-content">
                <img src="/images/app-icon.png" alt="Quips app icon" class="cta-icon app-icon-light" width="512" height="512" loading="lazy"><img src="/images/app-icon-dark.png" alt="Quips app icon" class="cta-icon app-icon-dark" width="512" height="512" loading="lazy">
                <h2 class="cta-title">Add this collection to your library</h2>
                <p class="cta-subtitle">Get Quips and add ${escapeHtml(name)} to your library with one tap.</p>
                <span class="btn btn-coming-soon">Coming Soon to the App Store</span>
                <!-- TODO(launch): swap in badge linking to /go/appstore.html?p=collection
                     data-collection-id lets js/main.js's initDeepLinkBadges()
                     try the quips://public-collection/<id> scheme first and
                     fall back to this href if the app isn't installed.
                <a href="/go/appstore.html?p=collection" class="app-store-badge" data-collection-id="${escapeHtml(collection.id)}">
                    <img src="/images/app-store-badge.svg" alt="Download on the App Store" width="120" height="40">
                </a>
                -->
            </div>
        </section>
    </main>

    <footer class="footer">
        <div class="container footer-content">
            <div class="footer-brand">
                <img src="/images/app-icon.png" alt="Quips" class="footer-icon app-icon-light" width="512" height="512" loading="lazy"><img src="/images/app-icon-dark.png" alt="Quips" class="footer-icon app-icon-dark" width="512" height="512" loading="lazy">
                <span class="footer-name">Quips</span>
            </div>
            <div class="footer-links">
                <a href="/privacy.html">Privacy Policy</a>
                <a href="/terms.html">Terms & Conditions</a>
                <a href="/press.html">Press Kit</a>
            </div>
            <p class="footer-copyright">&copy; <span id="copyright-year">2025</span> Tweeting Birds. All rights reserved.</p>
        </div>
    </footer>

    <script src="/js/main.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

const STATIC_PAGES = [
    '', // homepage -> https://quipsapp.com/
    'collections.html',
    'course.html',
    'quote-unquote.html',
    'quote-unquote/1-jobs.html',
    'quote-unquote/2-crocker.html',
    'support.html',
    'releases.html',
    'press.html',
    'privacy.html',
    'terms.html'
];

function sitemapXml(collectionIds) {
    const urls = [
        ...STATIC_PAGES.map((page) => `${SITE}/${page}`),
        ...collectionIds.map((id) => `${SITE}/collections/${id}.html`)
    ];
    const entries = urls
        .map((url) => `  <url>\n    <loc>${escapeHtml(url)}</loc>\n  </url>`)
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

// Dataset totals for the cards at the top of collections.html. Per-quote
// verificationStatus lives only in collections/<id>.json, so it is tallied
// here — the page would otherwise have to fetch all 80+ files to show one
// number. Statuses are listed explicitly rather than derived from the data, so
// an unexpected value fails the build instead of silently missing a card.
const VERIFICATION_STATUSES = ['verified', 'attributed', 'unverified', 'folk-wisdom'];

// Feeds whose section header carries its own iconName, drawn by js/feeds.js
// through the same lookup. Pulled alongside the index and each one optional, so
// the check below skips any that a build didn't fetch.
const ICON_BEARING_FEEDS = [
    'recently-added.json',
    'newsletter-picks.json',
    'on-this-day.json',
    'new-collections.json'
];

function statsJson(collectionCount, quoteCount, byStatus) {
    return `${JSON.stringify(
        {
            collections: collectionCount,
            quotes: quoteCount,
            verification: byStatus
        },
        null,
        2
    )}\n`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function main() {
    const manifest = readJson(path.join(ROOT, 'collections.json'));
    const collections = manifest.collections;
    if (!Array.isArray(collections) || collections.length === 0) {
        fail("collections.json: 'collections' must be a non-empty array");
    }

    const ids = [];
    let pageCount = 0;
    let quoteCount = 0;
    const byStatus = Object.fromEntries(VERIFICATION_STATUSES.map((s) => [s, 0]));

    for (const entry of collections) {
        if (!entry || typeof entry.id !== 'string' || !entry.id) {
            fail(`collections.json: collection entry missing 'id': ${JSON.stringify(entry)}`);
        }
        const id = entry.id;
        if (!/^[a-z0-9-]+$/i.test(id)) {
            fail(`collections.json: unsafe collection id ${JSON.stringify(id)}`);
        }
        const collection = readJson(path.join(COLLECTIONS_DIR, `${id}.json`));
        if (typeof collection.name !== 'string' || !collection.name) {
            fail(`collections/${id}.json: missing 'name'`);
        }
        if (!Array.isArray(collection.quotes) || collection.quotes.length === 0) {
            fail(`collections/${id}.json: 'quotes' must be a non-empty array`);
        }
        // Refuse to ship an icon we can't draw. getIconSvg falls back to
        // sunrise.fill, which is silent at render time: 51 collections shared
        // that one sunrise for months before anyone spotted it.
        if (!hasIcon(collection.iconName)) {
            fail(
                `collections/${id}.json: unknown iconName ${JSON.stringify(collection.iconName)} — ` +
                    'add an SVG for it to js/icons.js, or alias it there to an existing icon'
            );
        }
        for (const quote of collection.quotes) {
            if (!quote || typeof quote.content !== 'string' || !quote.content) {
                fail(`collections/${id}.json: quote missing 'content': ${JSON.stringify(quote)}`);
            }
            const status = quote.verificationStatus;
            if (!(status in byStatus)) {
                fail(
                    `collections/${id}.json: quote ${quote.id} has unknown verificationStatus ` +
                        `${JSON.stringify(status)} (expected one of ${VERIFICATION_STATUSES.join(', ')})`
                );
            }
            byStatus[status] += 1;
            quoteCount += 1;
        }
        collection.id = id;

        fs.writeFileSync(path.join(COLLECTIONS_DIR, `${id}.html`), collectionPageHtml(collection), 'utf8');
        ids.push(id);
        pageCount += 1;
    }

    for (const feed of ICON_BEARING_FEEDS) {
        const feedPath = path.join(ROOT, feed);
        if (!fs.existsSync(feedPath)) continue;
        const iconName = readJson(feedPath).iconName;
        if (iconName !== undefined && !hasIcon(iconName)) {
            fail(
                `${feed}: unknown iconName ${JSON.stringify(iconName)} — ` +
                    'add an SVG for it to js/icons.js, or alias it there to an existing icon'
            );
        }
    }

    fs.writeFileSync(path.join(ROOT, 'icons.json'), iconNamesJson(), 'utf8');
    fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml(ids), 'utf8');
    fs.writeFileSync(
        path.join(ROOT, 'collections-stats.json'),
        statsJson(pageCount, quoteCount, byStatus),
        'utf8'
    );

    console.log(
        `build-collections: wrote ${pageCount} collection pages to collections/ and sitemap.xml with ${STATIC_PAGES.length + ids.length} URLs.`
    );
    console.log(
        `build-collections: wrote collections-stats.json — ${quoteCount} quotes, ` +
            VERIFICATION_STATUSES.map((s) => `${s} ${byStatus[s]}`).join(', ') + '.'
    );
}

main();
