/**
 * Quips Marketing Website
 * Dynamic collection feeds (homepage + collections page)
 *
 * Renders the generated cross-collection feeds published by data.quipsapp.com
 * — Recently Added, On This Day, and Newsletter Picks — into a #feed-shelves
 * container. The feeds are pulled same-origin at build time (see
 * .github/workflows/deploy.yml), so this just fetches the local JSON.
 *
 * Contract: docs/CONSUMING-COLLECTIONS-MANIFEST.md.
 *
 * Each quote carries `sourceCollection` (the real collection it lives in); we
 * look that up in collections.json for the collection's name + color and link
 * the card to its detail page. Any feed that is missing or empty is skipped;
 * on a total failure the container's fallback markup (if any) stays in place.
 *
 * The container's `data-mode` controls density:
 *   - "teaser" (homepage): cap each shelf and show a "See all" link.
 *   - "full"   (collections page): every quote in the feed.
 */
(function () {
    'use strict';

    var TEASER_LIMIT = 8;

    // Local calendar day as "MM-DD" (the on-this-day.json key).
    function localMMDD(date) {
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return m + '-' + d;
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
        opts.quotes.forEach(function (quote) {
            scroller.append(quoteCard(quote, opts.collById));
        });

        shelf.append(head, scroller);
        return shelf;
    }

    async function init() {
        var container = document.getElementById('feed-shelves');
        if (!container) return;

        var teaser = (container.getAttribute('data-mode') || 'full') === 'teaser';
        var cap = function (quotes) {
            return teaser ? quotes.slice(0, TEASER_LIMIT) : quotes;
        };

        try {
            var results = await Promise.all([
                fetch('collections.json').then(function (r) { return r.json(); }),
                fetchJsonOptional('recently-added.json'),
                fetchJsonOptional('on-this-day.json'),
                fetchJsonOptional('newsletter-picks.json')
            ]);

            var index = results[0], recentlyAdded = results[1], onThisDay = results[2], newsletter = results[3];

            var collById = {};
            ((index && index.collections) || []).forEach(function (c) { collById[c.id] = c; });

            var shelves = [];

            // On This Day — day-keyed by MM-DD; hidden when today has no entry.
            if (onThisDay && onThisDay.days) {
                var todays = onThisDay.days[localMMDD(new Date())];
                if (Array.isArray(todays) && todays.length) {
                    shelves.push(buildShelf({
                        title: onThisDay.name || 'On This Day',
                        iconName: onThisDay.iconName,
                        colorName: onThisDay.colorName,
                        quotes: cap(todays),
                        collById: collById,
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
                    quotes: cap(recentlyAdded.quotes),
                    collById: collById,
                    seeAllHref: teaser ? 'collections.html' : null
                }));
            }

            // Newsletter Picks — quotes featured in Quote Unquote.
            if (newsletter && Array.isArray(newsletter.quotes) && newsletter.quotes.length) {
                shelves.push(buildShelf({
                    title: newsletter.name || 'From Quote Unquote',
                    iconName: newsletter.iconName,
                    colorName: newsletter.colorName,
                    quotes: cap(newsletter.quotes),
                    collById: collById,
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
