/**
 * Quips Marketing Website
 * Dynamic collection feeds (homepage + collections page)
 *
 * Renders the generated cross-collection feeds published by data.quipsapp.com
 * — New Collections, Recently Added, On This Day, and Newsletter Picks — into a
 * #feed-shelves container, plus the weekly featured collection into
 * #featured-collection (collections.html only). The feeds are pulled
 * same-origin at build time (see .github/workflows/deploy.yml), so this just
 * fetches the local JSON.
 *
 * Contract: docs/CONSUMING-COLLECTIONS-MANIFEST.md.
 *
 * Most feeds carry `quotes[]`, where each quote's `sourceCollection` names the
 * real collection it lives in; we look that up in collections.json for the
 * name + color and link the card to its detail page. New Collections is the
 * exception: it carries `collections[]` and each entry is already
 * self-contained, so it renders a different card and needs no join. Any feed
 * that is missing or empty is skipped; on a total failure the container's
 * fallback markup (if any) stays in place.
 *
 * The container's `data-mode` controls density:
 *   - "teaser" (homepage): cap each shelf and show a "See all" link.
 *   - "full"   (collections page): every quote in the feed.
 */
(function () {
    'use strict';

    var TEASER_LIMIT = 8;

    // New Collections is capped in *both* modes, unlike the quote shelves.
    // The feed is a top-N rather than a time window, so once the genuinely
    // recent collections run out it continues into older ones that share a
    // backfilled `addedAt` — showing all twelve would present those as new.
    var NEW_COLLECTIONS_LIMIT = 6;

    // Same arrow the collection cards use, so the featured card's CTA matches.
    var ARROW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';

    // Local calendar day as "MM-DD" (the on-this-day.json key).
    function localMMDD(date) {
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return m + '-' + d;
    }

    // Local calendar day as "YYYY-MM-DD" — the featured schedule's week bounds
    // are plain ISO dates, so string comparison is the whole comparison.
    function localISODate(date) {
        return date.getFullYear() + '-' + localMMDD(date);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    // Optional fetch: resolve to null instead of rejecting so a missing feed
    // just drops its shelf rather than failing the whole render.
    function fetchJsonOptional(url) {
        return fetch(url)
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function quoteCard(quote, collById) {
        var source = collById[quote.sourceCollection];
        var card = document.createElement('a');
        card.className = 'feed-card';
        card.href = 'collections/' + encodeURIComponent(quote.sourceCollection || '') + '.html';
        if (source && source.colorName) {
            card.setAttribute('data-color', String(source.colorName));
        }

        card.append(el('p', 'feed-card-quote', quote.content || ''));
        if (quote.authorName) card.append(el('p', 'feed-card-author', quote.authorName));

        var foot = el('div', 'feed-card-foot');
        foot.append(el('span', 'feed-card-collection', source ? source.name : 'View collection'));
        if (quote.newsletterIssue) {
            foot.append(el('span', 'feed-card-issue', 'Quote Unquote #' + quote.newsletterIssue));
        }
        card.append(foot);
        return card;
    }

    // A card for a whole collection rather than a quote. Unlike quoteCard this
    // needs no `collById` join: new-collections.json entries carry their own
    // name, colour, icon and preview quotes, so the card renders from the feed
    // alone and a collection missing from the index still draws correctly.
    function collectionCard(collection) {
        var card = el('a', 'feed-card feed-collection-card');
        card.href = 'collections/' + encodeURIComponent(collection.id || '') + '.html';
        if (collection.colorName) {
            card.setAttribute('data-color', String(collection.colorName));
        }

        var head = el('div', 'feed-collection-head');
        if (collection.iconName && typeof window.getIconSvg === 'function') {
            var icon = el('span', 'feed-collection-icon');
            icon.innerHTML = window.getIconSvg(collection.iconName); // trusted constant SVG
            head.append(icon);
        }
        head.append(el('h4', 'feed-collection-name', collection.name || ''));
        card.append(head);

        // One preview quote says more about a collection than its description.
        var preview = (collection.previewQuotes || [])[0];
        if (preview) card.append(el('p', 'feed-card-quote', preview));

        var foot = el('div', 'feed-card-foot');
        var meta = [collection.category, (Number(collection.quoteCount) || 0) + ' quotes']
            .filter(Boolean).join(' · ');
        foot.append(el('span', 'feed-card-collection', meta));
        card.append(foot);
        return card;
    }

    // Takes ready-built cards rather than quotes, so a shelf can hold quote
    // cards or collection cards without knowing the difference.
    function buildShelf(opts) {
        var shelf = el('section', 'feed-shelf');
        if (opts.colorName) shelf.setAttribute('data-color', String(opts.colorName));

        var head = el('div', 'feed-shelf-head');
        var title = el('div', 'feed-shelf-title');
        if (opts.iconName && typeof window.getIconSvg === 'function') {
            var icon = el('span', 'feed-shelf-icon');
            icon.innerHTML = window.getIconSvg(opts.iconName); // trusted constant SVG
            title.append(icon);
        }
        title.append(el('h3', 'feed-shelf-name', opts.title));
        head.append(title);
        if (opts.seeAllHref) {
            var link = el('a', 'feed-shelf-link', 'See all');
            link.href = opts.seeAllHref;
            head.append(link);
        }

        var scroller = el('div', 'feed-shelf-scroller');
        opts.cards.forEach(function (card) {
            scroller.append(card);
        });

        shelf.append(head, scroller);
        return shelf;
    }

    // The week whose bounds contain today, or null. A gap is normal: the
    // schedule is maintained ~12 weeks out and a long release gap can outrun
    // it. Never fall back to the newest past week — a stale "featured this
    // week" is worse than no featured section at all.
    function currentWeek(featured, today) {
        var weeks = (featured && featured.weeks) || [];
        for (var i = 0; i < weeks.length; i++) {
            var week = weeks[i];
            if (week && week.weekStart <= today && today <= week.weekEnd) return week;
        }
        return null;
    }

    // The page's one editorial slot: the week's collection, the curator's note,
    // and a quote from it. The feed carries no presentation — name, colour and
    // icon are joined from collections.json, so a rename or palette change
    // ships in that file alone. No join, no card.
    function renderFeatured(container, featured, collById) {
        var week = currentWeek(featured, localISODate(new Date()));
        if (!week) return;
        var collection = collById[week.collectionId];
        if (!collection) return;

        var card = el('a', 'feed-card feed-card-featured');
        card.href = 'collections/' + encodeURIComponent(collection.id) + '.html';
        if (collection.colorName) card.setAttribute('data-color', String(collection.colorName));

        var head = el('div', 'featured-head');
        if (collection.iconName && typeof window.getIconSvg === 'function') {
            var icon = el('span', 'featured-icon');
            icon.innerHTML = window.getIconSvg(collection.iconName); // trusted constant SVG
            head.append(icon);
        }
        var heading = el('div', 'featured-headings');
        var name = el('h2', 'featured-name', collection.name);
        name.id = 'featured-collection-heading';
        heading.append(name);
        var meta = [collection.category, (Number(collection.quoteCount) || 0) + ' quotes']
            .filter(Boolean).join(' · ');
        heading.append(el('p', 'featured-meta', meta));
        head.append(heading);
        card.append(head);

        // Editorial prose written for a reader — safe to show as-is.
        if (week.note) card.append(el('p', 'featured-note', week.note));

        var quote = week.quote || {};
        if (quote.content) {
            var block = el('blockquote', 'featured-quote');
            block.append(el('p', 'featured-quote-text', quote.content));
            if (quote.authorName) block.append(el('footer', 'featured-quote-author', quote.authorName));
            card.append(block);
        }

        var cta = el('span', 'collection-card-cta', 'View all quotes');
        cta.insertAdjacentHTML('beforeend', ARROW_SVG); // trusted constant SVG
        card.append(cta);

        container.replaceChildren(el('p', 'featured-eyebrow', 'Featured this week'), card);
        container.hidden = false;
    }

    async function init() {
        var container = document.getElementById('feed-shelves');
        if (!container) return;

        var teaser = (container.getAttribute('data-mode') || 'full') === 'teaser';
        var cap = function (quotes) {
            return teaser ? quotes.slice(0, TEASER_LIMIT) : quotes;
        };

        // Only collections.html has a featured slot; skip the fetch elsewhere.
        var featuredEl = document.getElementById('featured-collection');

        try {
            var results = await Promise.all([
                fetch('collections.json').then(function (r) { return r.json(); }),
                fetchJsonOptional('recently-added.json'),
                fetchJsonOptional('new-collections.json'),
                fetchJsonOptional('on-this-day.json'),
                fetchJsonOptional('newsletter-picks.json'),
                featuredEl ? fetchJsonOptional('featured-collections.json') : null
            ]);

            var index = results[0], recentlyAdded = results[1], newCollections = results[2],
                onThisDay = results[3], newsletter = results[4], featured = results[5];

            var collById = {};
            ((index && index.collections) || []).forEach(function (c) { collById[c.id] = c; });

            if (featuredEl && featured) renderFeatured(featuredEl, featured, collById);

            var shelves = [];

            // New Collections — whole collections, newest first. Leads the
            // shelves because it is the most direct answer to "what's new":
            // Recently Added deliberately excludes every quote that arrived
            // with a brand-new collection, so a new collection shows up here
            // and nowhere else.
            if (newCollections && Array.isArray(newCollections.collections)
                && newCollections.collections.length) {
                shelves.push(buildShelf({
                    title: newCollections.name || 'New Collections',
                    iconName: newCollections.iconName,
                    colorName: newCollections.colorName,
                    cards: newCollections.collections
                        .slice(0, NEW_COLLECTIONS_LIMIT)
                        .map(collectionCard),
                    seeAllHref: teaser ? 'collections.html' : null
                }));
            }

            // On This Day — day-keyed by MM-DD; hidden when today has no entry.
            if (onThisDay && onThisDay.days) {
                var todays = onThisDay.days[localMMDD(new Date())];
                if (Array.isArray(todays) && todays.length) {
                    shelves.push(buildShelf({
                        title: onThisDay.name || 'On This Day',
                        iconName: onThisDay.iconName,
                        colorName: onThisDay.colorName,
                        cards: cap(todays).map(function (quote) {
                            return quoteCard(quote, collById);
                        }),
                        seeAllHref: teaser ? 'collections.html' : null
                    }));
                }
            }

            // Recently Added — newest-first quotes across existing collections.
            if (recentlyAdded && Array.isArray(recentlyAdded.quotes) && recentlyAdded.quotes.length) {
                shelves.push(buildShelf({
                    title: recentlyAdded.name || 'Recently Added',
                    iconName: recentlyAdded.iconName,
                    colorName: recentlyAdded.colorName,
                    cards: cap(recentlyAdded.quotes).map(function (quote) {
                        return quoteCard(quote, collById);
                    }),
                    seeAllHref: teaser ? 'collections.html' : null
                }));
            }

            // Newsletter Picks — quotes featured in Quote Unquote.
            if (newsletter && Array.isArray(newsletter.quotes) && newsletter.quotes.length) {
                shelves.push(buildShelf({
                    title: newsletter.name || 'From Quote Unquote',
                    iconName: newsletter.iconName,
                    colorName: newsletter.colorName,
                    cards: cap(newsletter.quotes).map(function (quote) {
                        return quoteCard(quote, collById);
                    }),
                    seeAllHref: teaser ? 'quote-unquote.html' : null
                }));
            }

            if (!shelves.length) return; // Nothing to show: leave any fallback markup.
            container.replaceChildren.apply(container, shelves);
        } catch (error) {
            // Leave the container's fallback markup (homepage links to collections.html).
            console.error('Error loading collection feeds:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
