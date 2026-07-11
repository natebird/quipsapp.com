#!/usr/bin/env node
// Build script: renders /terms.html and /privacy.html from the Markdown
// source in legal/terms.md and legal/privacy.md.
//
// Markdown is the source of truth so the same file can be fetched and
// rendered natively by the iOS app (https://quipsapp.com/legal/terms.md,
// /legal/privacy.md) without a WebView, instead of drifting from a
// hand-authored HTML copy. See docs/SITE-CONVENTIONS.md, "Legal documents".
//
// Supported Markdown subset (deliberately small — matches what the app's
// native renderer needs and what these two documents actually use):
//   # / ## / ###   headings (optionally `## Heading {#custom-id}`)
//   blank-line-separated paragraphs (a single `\n` inside one becomes <br>)
//   - item                unordered lists
//   1. item               ordered lists
//   > line                blockquote (rendered as the "summary box" callout;
//                         a bare `>` line is a blank line *inside* the quote)
//   **bold**              inline emphasis
//   [text](url)           links (http(s) links get target="_blank")
//
// Output is gitignored — never hand-edit terms.html/privacy.html; edit the
// Markdown source instead. Runs in CI via .github/workflows/deploy.yml;
// run locally with: node scripts/build-legal.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://quipsapp.com';

function fail(message) {
    console.error(`build-legal: ERROR: ${message}`);
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

// ---------------------------------------------------------------------------
// Markdown -> block AST -> HTML
// ---------------------------------------------------------------------------

function inlineHtml(rawText) {
    let html = escapeHtml(rawText);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
        const external = /^https?:\/\//.test(url) && !url.startsWith(SITE);
        const attrs = external ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${url}"${attrs}>${text}</a>`;
    });
    return html;
}

// Parses an array of raw (un-indented) markdown lines into block nodes.
// Recursively reused for the lines inside a blockquote.
function parseBlocks(lines) {
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {
            i += 1;
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            let text = heading[2].trim();
            let id = null;
            const idMatch = text.match(/^(.*)\s*\{#([\w-]+)\}\s*$/);
            if (idMatch) {
                text = idMatch[1].trim();
                id = idMatch[2];
            }
            blocks.push({ type: `h${level}`, id, html: inlineHtml(text) });
            i += 1;
            continue;
        }

        if (/^>\s?/.test(line)) {
            const inner = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                inner.push(lines[i].replace(/^>\s?/, ''));
                i += 1;
            }
            blocks.push({ type: 'blockquote', children: parseBlocks(inner) });
            continue;
        }

        if (/^-\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^-\s+/.test(lines[i])) {
                items.push(inlineHtml(lines[i].replace(/^-\s+/, '')));
                i += 1;
            }
            blocks.push({ type: 'ul', items });
            continue;
        }

        if (/^\d+\.\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
                items.push(inlineHtml(lines[i].replace(/^\d+\.\s+/, '')));
                i += 1;
            }
            blocks.push({ type: 'ol', items });
            continue;
        }

        // Paragraph: consume until a blank line or the start of another block type.
        const para = [];
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !/^(#{1,3})\s+/.test(lines[i]) &&
            !/^>\s?/.test(lines[i]) &&
            !/^-\s+/.test(lines[i]) &&
            !/^\d+\.\s+/.test(lines[i])
        ) {
            para.push(lines[i]);
            i += 1;
        }
        blocks.push({ type: 'p', html: inlineHtml(para.join('\n')).replace(/\n/g, '<br>\n') });
    }

    return blocks;
}

function parseMarkdown(source) {
    const blocks = parseBlocks(source.split('\n'));
    // The paragraph immediately after the H1 is the effective/last-updated
    // line — flag it so it gets the .last-updated class, matching the
    // previous hand-authored markup.
    if (blocks[0]?.type === 'h1' && blocks[1]?.type === 'p') {
        blocks[1].lastUpdated = true;
    }
    return blocks;
}

function renderBlocks(blocks) {
    return blocks
        .map((block) => {
            switch (block.type) {
                case 'h1':
                    return `<h1>${block.html}</h1>`;
                case 'h2':
                    return `<h2${block.id ? ` id="${block.id}"` : ''}>${block.html}</h2>`;
                case 'h3':
                    return `<h3>${block.html}</h3>`;
                case 'p':
                    return `<p${block.lastUpdated ? ' class="last-updated"' : ''}>${block.html}</p>`;
                case 'ul':
                    return `<ul>\n${block.items.map((item) => `    <li>${item}</li>`).join('\n')}\n</ul>`;
                case 'ol':
                    return `<ol>\n${block.items.map((item) => `    <li>${item}</li>`).join('\n')}\n</ol>`;
                case 'blockquote':
                    return `<div class="summary-box">\n${renderBlocks(block.children)}\n</div>`;
                default:
                    fail(`unknown block type ${block.type}`);
                    return '';
            }
        })
        .join('\n');
}

// ---------------------------------------------------------------------------
// Page shell (shared head/nav/footer chrome — see docs/SITE-CONVENTIONS.md)
// ---------------------------------------------------------------------------

function pageHtml({ title, metaDescription, socialDescription, canonicalPath, contentHtml }) {
    const pageUrl = `${SITE}/${canonicalPath}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; form-action 'self'; base-uri 'self'; object-src 'none';">
    <meta name="description" content="${escapeHtml(metaDescription)}">
    <link rel="canonical" href="${pageUrl}">

    <!-- Open Graph / Social -->
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(socialDescription)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="https://quipsapp.com/images/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(socialDescription)}">
    <meta name="twitter:image" content="https://quipsapp.com/images/og-image.png">

    <title>${escapeHtml(title)}</title>

    <link rel="icon" type="image/png" sizes="64x64" href="images/favicon-64.png">
    <link rel="apple-touch-icon" href="images/apple-touch-icon.png">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="css/styles.css">

    <!-- TODO(launch): uncomment and set the App Store id
    <meta name="apple-itunes-app" content="app-id=XXXXXXXXXX, app-argument=https://quipsapp.com/">
    -->

    <!-- Cloudflare Web Analytics (manual beacon; skip if auto-injected)
    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "TODO"}'></script>
    -->

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
    <style>
        .legal-content {
            max-width: 800px;
            margin: 0 auto;
            padding: calc(64px + 3rem) 1.5rem 4rem;
        }
        .legal-content h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        .last-updated {
            color: var(--text-secondary);
            margin-bottom: 2rem;
            font-size: 0.9rem;
        }
        .legal-content h2 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-top: 2.5rem;
            margin-bottom: 1rem;
            color: var(--accent-primary);
        }
        .legal-content h3 {
            font-size: 1.125rem;
            font-weight: 600;
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
        }
        .legal-content p {
            margin-bottom: 1rem;
            line-height: 1.7;
        }
        .legal-content ul, .legal-content ol {
            margin-left: 1.5rem;
            margin-bottom: 1.5rem;
        }
        .legal-content li {
            margin-bottom: 0.5rem;
            line-height: 1.7;
        }
        .legal-content a {
            color: var(--accent-primary);
            text-decoration: underline;
        }
        .legal-content a:hover {
            color: var(--accent-primary-dark);
        }
        .summary-box {
            background-color: var(--bg-secondary);
            border-left: 4px solid var(--accent-primary);
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 2rem;
        }
        .summary-box ul {
            margin-bottom: 0;
        }
        .back-link {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-secondary);
            margin-bottom: 2rem;
            font-size: 0.9rem;
            transition: color 150ms ease;
        }
        .back-link:hover {
            color: var(--accent-primary);
            text-decoration: none;
        }
    </style>
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
            <a href="index.html" class="logo">
                <img src="images/app-icon.png" alt="Quips" class="logo-icon app-icon-light" width="512" height="512"><img src="images/app-icon-dark.png" alt="Quips" class="logo-icon app-icon-dark" width="512" height="512">
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
                        <a href="collections.html" class="nav-dropdown-item">Collections</a>
                        <a href="course.html" class="nav-dropdown-item">Email Course</a>
                        <a href="support.html" class="nav-dropdown-item">Support</a>
                        <a href="releases.html" class="nav-dropdown-item">What's New</a>
                        <a href="press.html" class="nav-dropdown-item">Press Kit</a>
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
                <a href="index.html#download" class="btn btn-primary">Get Quips</a>
            </div>
        </nav>
    </header>

    <main class="legal-content">
        <a href="index.html" class="back-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Home
        </a>

${contentHtml}
    </main>

    <footer class="footer">
        <div class="container footer-content">
            <div class="footer-brand">
                <img src="images/app-icon.png" alt="Quips" class="footer-icon app-icon-light" width="512" height="512" loading="lazy"><img src="images/app-icon-dark.png" alt="Quips" class="footer-icon app-icon-dark" width="512" height="512" loading="lazy">
                <span class="footer-name">Quips</span>
            </div>
            <div class="footer-links">
                <a href="privacy.html">Privacy Policy</a>
                <a href="terms.html">Terms & Conditions</a>
                <a href="press.html">Press Kit</a>
            </div>
            <p class="footer-copyright">&copy; <span id="copyright-year">2025</span> Tweeting Birds. All rights reserved.</p>
        </div>
    </footer>

    <script src="js/main.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const PAGES = [
    {
        source: 'legal/terms.md',
        output: 'terms.html',
        canonicalPath: 'terms.html',
        title: 'Terms and Conditions — Quips',
        metaDescription: 'Quips Terms and Conditions - Terms of use for the Quips app.',
        socialDescription: 'Terms of use for the Quips app, including subscriptions, content ownership, and acceptable use.'
    },
    {
        source: 'legal/privacy.md',
        output: 'privacy.html',
        canonicalPath: 'privacy.html',
        title: 'Privacy Policy — Quips',
        metaDescription: "Quips Privacy Policy - In the app, your data stays on your device and we don't track you. See how our website handles optional newsletter signups.",
        socialDescription: "In the Quips app, your data stays on your device and we don't track you. See how our website handles optional newsletter signups."
    }
];

function main() {
    for (const page of PAGES) {
        const sourcePath = path.join(ROOT, page.source);
        let markdown;
        try {
            markdown = fs.readFileSync(sourcePath, 'utf8');
        } catch (e) {
            fail(`cannot read ${page.source}: ${e.message}`);
        }

        const blocks = parseMarkdown(markdown);
        const contentHtml = renderBlocks(blocks);
        const html = pageHtml({
            title: page.title,
            metaDescription: page.metaDescription,
            socialDescription: page.socialDescription,
            canonicalPath: page.canonicalPath,
            contentHtml
        });

        fs.writeFileSync(path.join(ROOT, page.output), html, 'utf8');
        console.log(`build-legal: wrote ${page.output} from ${page.source}`);
    }
}

main();
