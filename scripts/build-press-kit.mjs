#!/usr/bin/env node
// Build script: assembles images/quips-press-kit.zip for the press page.
//
// The kit's text (about copy, app details, contact) is extracted from
// press.html at build time so it can never drift from the page. Assets are
// copied from images/ (icons, marketing screenshots per screenshots.json,
// App Store badge, social preview). Output is gitignored — regenerate with:
//
//   node scripts/build-press-kit.mjs
//
// Runs in CI via .github/workflows/deploy.yml. Requires the `zip` CLI
// (present on macOS and ubuntu-latest runners). No npm dependencies.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ZIP = path.join(ROOT, 'images', 'quips-press-kit.zip');
const KIT_NAME = 'quips-press-kit';

function fail(message) {
    console.error(`build-press-kit: ERROR: ${message}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Extract the press page copy as plain text
// ---------------------------------------------------------------------------

function htmlToText(html) {
    return html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        // keep mailto addresses visible: "<a href=mailto:X>label</a>" -> "label: X"
        .replace(/<a [^>]*href="mailto:([^"?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$2: $1')
        .replace(/<h2[^>]*>/gi, '\n\n== ')
        .replace(/<\/h2>/gi, ' ==\n')
        .replace(/<h3[^>]*>/gi, '\n')
        .replace(/<\/(h1|h3|p|li|div)>/gi, '\n')
        .replace(/<\/th>/gi, ': ')
        .replace(/<\/(td|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        // decode &amp; LAST so escaped entities (&amp;lt;) don't double-decode
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const pressHtml = fs.readFileSync(path.join(ROOT, 'press.html'), 'utf8');
const mainMatch = pressHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/);
if (!mainMatch) fail('could not find <main> in press.html');

// Drop the Brand Assets section (download links are meaningless in the zip)
// and the "Back to Home" nav link.
const mainWithoutAssets = mainMatch[1]
    .replace(/<section class="press-section">\s*<h2>Brand Assets[\s\S]*?<\/section>/, '')
    .replace(/<a [^>]*class="back-link"[\s\S]*?<\/a>/, '');

const factSheet = [
    'QUIPS — PRESS KIT',
    `Generated from https://quipsapp.com/press.html`,
    '',
    htmlToText(mainWithoutAssets),
    '',
    '== Included Files ==',
    'icons/          App icon, light + dark variants (1024px PNG)',
    'screenshots/    Marketing screenshots, light + dark (iPhone)',
    'quips-social-preview.png  1200x630 social/OG image',
    '',
    'For the "Download on the App Store" badge, use Apple\'s official artwork:',
    'https://developer.apple.com/app-store/marketing/guidelines/',
].join('\n') + '\n';

// ---------------------------------------------------------------------------
// 2. Stage the kit
// ---------------------------------------------------------------------------

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'press-kit-'));
const kitDir = path.join(stage, KIT_NAME);
fs.mkdirSync(path.join(kitDir, 'icons'), { recursive: true });
fs.mkdirSync(path.join(kitDir, 'screenshots'), { recursive: true });

fs.writeFileSync(path.join(kitDir, 'quips-press-kit.txt'), factSheet);

const skipped = [];
function copyAsset(src, dest) {
    const from = path.join(ROOT, 'images', src);
    if (!fs.existsSync(from)) {
        skipped.push(src);
        return;
    }
    fs.copyFileSync(from, path.join(kitDir, dest));
}

copyAsset('app-icon@1024.png', 'icons/quips-app-icon-1024.png');
copyAsset('app-icon-dark@1024.png', 'icons/quips-app-icon-dark-1024.png');
copyAsset('og-image.png', 'quips-social-preview.png');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'images', 'screenshots.json'), 'utf8'));
for (const screen of manifest.gallery || []) {
    const slug = (screen.source || screen.label || 'screen').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    copyAsset(screen.light, `screenshots/quips-${slug}-light.png`);
    copyAsset(screen.dark, `screenshots/quips-${slug}-dark.png`);
}

// ---------------------------------------------------------------------------
// 3. Zip it
// ---------------------------------------------------------------------------

fs.mkdirSync(path.dirname(OUT_ZIP), { recursive: true });
fs.rmSync(OUT_ZIP, { force: true });
try {
    execFileSync('zip', ['-r', '-X', '-q', OUT_ZIP, KIT_NAME], { cwd: stage });
} catch (e) {
    fail(`zip failed (is the zip CLI installed?): ${e.message}`);
}
fs.rmSync(stage, { recursive: true, force: true });

const size = Math.round(fs.statSync(OUT_ZIP).size / 1024);
console.log(`build-press-kit: wrote images/quips-press-kit.zip (${size} KB)`);
if (skipped.length) {
    fail(`missing assets, refusing to ship an incomplete kit: ${skipped.join(', ')}`);
}
