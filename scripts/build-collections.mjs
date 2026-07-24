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

// Same inline SVG set the client-side pages use (js/collections.js).
const ICONS = {
    'sunrise.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a5 5 0 0 0-10 0"></path><line x1="12" y1="2" x2="12" y2="9"></line><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line><line x1="1" y1="18" x2="3" y2="18"></line><line x1="21" y1="18" x2="23" y2="18"></line><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line><line x1="23" y1="22" x2="1" y2="22"></line><polyline points="8 6 12 2 16 6"></polyline></svg>`,
    'building.columns.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7"></polygon></svg>`,
    'paintbrush.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"></path><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"></path><path d="M14.5 17.5 4.5 15"></path></svg>`,
    'cpu.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`,
    'book.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
    'theatermasks.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3A2.5 2.5 0 0 0 3 5.5v5A6.5 6.5 0 0 0 9.5 17h1A6.5 6.5 0 0 0 17 10.5v-5A2.5 2.5 0 0 0 14.5 3Z"></path><path d="M7 8h.01"></path><path d="M12 8h.01"></path><path d="M7.5 12.5c1.2 1 2.8 1 4 0"></path><path d="M17 9.5a2.5 2.5 0 0 1 4 2v3a6.5 6.5 0 0 1-6.5 6.5h-1a6.4 6.4 0 0 1-3.2-.85"></path></svg>`,
    'leaf.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>`,
    'bolt.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    'shield.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    'wand.and.stars': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></svg>`,
    'tv.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`,
    'flame.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`,
    'sun.dust.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`,
    'sparkles': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>`,
    'star.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    'heart.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
    'eye.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    'magnifyingglass': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    'mic.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
    'umbrella.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 12a11.05 11.05 0 0 0-22 0Z"></path><path d="M12 12v7a2 2 0 0 0 4 0"></path><line x1="12" y1="2" x2="12" y2="3"></line></svg>`,
    'quote.bubble.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
    'scroll.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17V5a2 2 0 0 0-2-2H4"></path><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"></path></svg>`,
    'book.pages.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>`,
    'bird.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h.01"></path><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"></path><path d="m20 7 2 .5-2 .5"></path><path d="M10 18v3"></path><path d="M14 17.75V21"></path><path d="M7 18a6 6 0 0 0 3.84-10.61"></path></svg>`,
    'teddybear.fill': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2.5"></circle><circle cx="18" cy="5" r="2.5"></circle><path d="M16.5 7.5a6 6 0 0 1-9 0"></path><circle cx="12" cy="14" r="6.5"></circle><circle cx="10" cy="12.5" r="0.5" fill="currentColor"></circle><circle cx="14" cy="12.5" r="0.5" fill="currentColor"></circle><path d="M10.5 16a2 2 0 0 0 3 0"></path></svg>`
};

function getIconSvg(iconName) {
    return ICONS[iconName] || ICONS['sunrise.fill'];
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
