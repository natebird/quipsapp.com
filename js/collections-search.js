/**
 * Quips Marketing Website
 * Search across collections, quotes, and authors (collections.html)
 *
 * The collection grid alone can be filtered from collections.json (82 records,
 * already loaded). search-index.json adds every quote in the dataset (~2,670)
 * plus an author roster, so it is ~1 MB and is fetched **lazily** — on the
 * first keystroke, once, cached in a module-level promise. Until it resolves,
 * the page shows the collection-only results it can already produce; if the
 * pinned data version doesn't publish the index at all, that stays the whole
 * search and nothing errors.
 *
 * Contract: docs/CONSUMING-COLLECTIONS-MANIFEST.md.
 *
 * Two rules drive the presentation:
 *
 *   1. **Identity outranks incidence.** A group that matched a name — a
 *      collection's, an author's — comes before one that matched a word inside
 *      quote text. Searching "angelou" must not scroll past empty Collections
 *      and Quotes headings to reach the one real answer.
 *   2. **Every result says why it matched.** A name match is highlighted; a
 *      collection surfaced by its contents says "4 quotes mention courage".
 */
(function () {
    'use strict';

    var QUOTE_LIMIT = 24;
    var AUTHOR_LIMIT = 12;
    var SNIPPET_RADIUS = 90;

    var indexPromise = null;
    var indexSettled = false;
    var indexData = null;
    var quotesByAuthor = null;

    function lc(value) {
        return String(value == null ? '' : value).toLowerCase();
    }

    function has(text, needle) {
        return lc(text).indexOf(needle) !== -1;
    }

    function plural(count, word) {
        return count + ' ' + word + (count === 1 ? '' : 's');
    }

    /**
     * Fetch the index once. Resolves to null (never rejects) when the file is
     * absent or unreadable — the missing-index path is a supported state, not
     * an error, so callers just keep the collection-only results.
     */
    function ensureIndex() {
        if (!indexPromise) {
            indexPromise = fetch('search-index.json')
                .then(function (response) { return response.ok ? response.json() : null; })
                .catch(function () { return null; })
                .then(function (data) {
                    indexData = data;
                    indexSettled = true;
                    // Lowercase once here rather than on every keystroke, so
                    // typing stays instant across ~2,670 quotes.
                    ((data && data.quotes) || []).forEach(function (quote) {
                        quote.lcContent = lc(quote.content);
                    });
                    ((data && data.authors) || []).forEach(function (author) {
                        author.lcNames = [lc(author.name)].concat((author.variants || []).map(lc));
                    });
                    return data;
                });
        }
        return indexPromise;
    }

    /** True only while the fetch is in flight — a failed fetch is not pending. */
    function pending() {
        return !!indexPromise && !indexSettled;
    }

    function stats() {
        if (!indexData) return null;
        return {
            quoteCount: Number(indexData.quoteCount) || (indexData.quotes || []).length,
            authorCount: Number(indexData.authorCount) || (indexData.authors || []).length
        };
    }

    /** Quotes grouped by their own spelling of the author's name. */
    function authorQuoteMap() {
        if (!quotesByAuthor) {
            quotesByAuthor = {};
            ((indexData && indexData.quotes) || []).forEach(function (quote) {
                var key = lc(quote.authorName);
                (quotesByAuthor[key] || (quotesByAuthor[key] = [])).push(quote);
            });
        }
        return quotesByAuthor;
    }

    /**
     * Collections an author appears in. The roster folds spellings of one name
     * into `variants` while quote entries keep whatever spelling their
     * collection file uses, so the join goes through `variants` — never
     * through a normalisation of our own.
     */
    function authorCollectionIds(author) {
        var map = authorQuoteMap();
        var seen = {};
        (author.lcNames || [lc(author.name)]).forEach(function (key) {
            (map[key] || []).forEach(function (quote) {
                if (quote.sourceCollection) seen[quote.sourceCollection] = true;
            });
        });
        return Object.keys(seen);
    }

    /** Escape, then wrap every occurrence of the term in <mark>. */
    function highlight(text, needle) {
        var raw = String(text == null ? '' : text);
        if (!needle) return escapeHtml(raw);
        var lower = raw.toLowerCase();
        var out = '';
        var from = 0;
        var at = lower.indexOf(needle);
        while (at !== -1) {
            out += escapeHtml(raw.slice(from, at)) +
                '<mark>' + escapeHtml(raw.slice(at, at + needle.length)) + '</mark>';
            from = at + needle.length;
            at = lower.indexOf(needle, from);
        }
        return out + escapeHtml(raw.slice(from));
    }

    /** Keep the matched words visible in a long quote instead of clipping them off. */
    function snippet(text, needle) {
        var raw = String(text == null ? '' : text);
        var at = raw.toLowerCase().indexOf(needle);
        if (at === -1 || raw.length <= SNIPPET_RADIUS * 3) return raw;
        var start = Math.max(0, at - SNIPPET_RADIUS);
        var end = Math.min(raw.length, at + needle.length + SNIPPET_RADIUS * 2);
        return (start > 0 ? '…' : '') + raw.slice(start, end) + (end < raw.length ? '…' : '');
    }

    function touch(collection) {
        return collection ? [{ id: collection.id, category: collection.category }] : [];
    }

    /**
     * Match `query` (already lowercased) against collections and, when the
     * index has loaded, quotes and authors. Returns groups in display order.
     */
    function search(query, collections) {
        var byId = {};
        collections.forEach(function (collection) { byId[collection.id] = collection; });

        var quotes = (indexData && indexData.quotes) || [];
        var authors = (indexData && indexData.authors) || [];

        // Quotes match on their *text* only. An author's name is the Authors
        // group's job; folding it in here would bury a name search in prose.
        var quoteItems = [];
        var hitsByCollection = {};
        quotes.forEach(function (quote) {
            if ((quote.lcContent || lc(quote.content)).indexOf(query) === -1) return;
            var collection = byId[quote.sourceCollection];
            hitsByCollection[quote.sourceCollection] = (hitsByCollection[quote.sourceCollection] || 0) + 1;
            quoteItems.push({ quote: quote, collection: collection, touches: touch(collection) });
        });

        var collectionItems = [];
        collections.forEach(function (collection) {
            var nameMatch = has(collection.name, query);
            var authorMatch = has(collection.author, query);
            var descMatch = has(collection.description, query) || has(collection.category, query);
            var quoteCount = hitsByCollection[collection.id] || 0;
            if (!nameMatch && !authorMatch && !descMatch && !quoteCount) return;
            collectionItems.push({
                collection: collection,
                identity: nameMatch || authorMatch,
                nameMatch: nameMatch,
                authorMatch: authorMatch,
                descMatch: descMatch,
                quoteCount: quoteCount,
                touches: touch(collection)
            });
        });
        collectionItems.sort(function (a, b) {
            if (a.identity !== b.identity) return a.identity ? -1 : 1;
            if (b.quoteCount !== a.quoteCount) return b.quoteCount - a.quoteCount;
            return String(a.collection.name).localeCompare(String(b.collection.name));
        });

        var authorItems = [];
        authors.forEach(function (author) {
            var names = author.lcNames || [lc(author.name)];
            var matched = names.some(function (name) { return name.indexOf(query) !== -1; });
            if (!matched) return;
            var ids = authorCollectionIds(author);
            authorItems.push({
                author: author,
                touches: ids.map(function (id) {
                    return { id: id, category: byId[id] && byId[id].category };
                })
            });
        });
        authorItems.sort(function (a, b) {
            return (Number(b.author.quoteCount) || 0) - (Number(a.author.quoteCount) || 0);
        });

        return orderGroups([
            { key: 'collections', title: 'Collections', rank: 0, items: collectionItems },
            { key: 'authors', title: 'Authors', rank: 1, items: authorItems },
            { key: 'quotes', title: 'Quotes', rank: 2, items: quoteItems }
        ], query);
    }

    /**
     * How directly a group answers the query:
     *
     *   2 — an identity: an author's name, or a collection's own name/curator.
     *   1 — the thing's own words: a quote's text, a collection's description.
     *   0 — a roll-up: collections surfaced only because quotes inside them
     *       matched, which is the Quotes group summarised, so it sits below it.
     */
    function groupStrength(group) {
        if (group.key === 'authors') return 2;
        if (group.key === 'quotes') return 1;
        if (group.items.some(function (item) { return item.identity; })) return 2;
        if (group.items.some(function (item) { return item.descMatch; })) return 1;
        return 0;
    }

    /**
     * Drop empty groups and order what's left by how the query matched, then by
     * the natural Collections → Authors → Quotes order among equals. A fixed
     * order would put two empty headings above the one answer to "angelou".
     */
    function orderGroups(groups, query) {
        var kept = groups.filter(function (group) { return group.items.length; });
        kept.forEach(function (group) { group.strength = groupStrength(group); });
        kept.sort(function (a, b) {
            if (a.strength !== b.strength) return b.strength - a.strength;
            return a.rank - b.rank;
        });
        var total = kept.reduce(function (sum, group) { return sum + group.items.length; }, 0);
        return { query: query, groups: kept, total: total };
    }

    /**
     * Collections each category contributes to the current results. The count
     * is derived from the same items the filter keeps, so a pill showing 3 can
     * never be clicked into an empty screen.
     */
    function facetCounts(results) {
        var counts = {};
        var all = {};
        results.groups.forEach(function (group) {
            group.items.forEach(function (item) {
                item.touches.forEach(function (spot) {
                    if (!spot.category) return;
                    (counts[spot.category] || (counts[spot.category] = {}))[spot.id] = true;
                    all[spot.id] = true;
                });
            });
        });
        var totals = { all: Object.keys(all).length };
        Object.keys(counts).forEach(function (category) {
            totals[category] = Object.keys(counts[category]).length;
        });
        return totals;
    }

    /** Narrow results to one category. Authors follow their quotes' collections. */
    function applyCategory(results, category) {
        if (!category || category === 'all') return results;
        var groups = results.groups.map(function (group) {
            return {
                key: group.key,
                title: group.title,
                rank: group.rank,
                items: group.items.filter(function (item) {
                    return item.touches.some(function (spot) { return spot.category === category; });
                })
            };
        });
        return orderGroups(groups, results.query);
    }

    function collectionReason(item, query, display) {
        var parts = [];
        if (item.authorMatch && !item.nameMatch) {
            parts.push('Author ' + highlight(item.collection.author, query));
        } else if (!item.nameMatch && item.descMatch) {
            parts.push('Description mentions “' + escapeHtml(display) + '”');
        }
        if (item.quoteCount) {
            parts.push(plural(item.quoteCount, 'quote') + ' mention' +
                (item.quoteCount === 1 ? 's' : '') + ' “' + escapeHtml(display) + '”');
        }
        return parts.join(' · ');
    }

    function quoteCardHtml(item, query) {
        var quote = item.quote;
        var collection = item.collection;
        var href = 'collections/' + encodeURIComponent(quote.sourceCollection || '') + '.html';
        var color = collection && collection.colorName
            ? ' data-color="' + escapeHtml(collection.colorName) + '"' : '';
        return '<a class="feed-card quote-result" href="' + escapeHtml(href) + '"' + color + '>' +
            '<p class="quote-result-text">' + highlight(snippet(quote.content, query), query) + '</p>' +
            (quote.authorName ? '<p class="quote-result-author">' + escapeHtml(quote.authorName) + '</p>' : '') +
            '<div class="feed-card-foot"><span class="feed-card-collection">' +
            escapeHtml(collection ? collection.name : 'View collection') +
            '</span></div></a>';
    }

    function authorCardHtml(item, query) {
        var author = item.author;
        var meta = plural(Number(author.quoteCount) || 0, 'quote');
        if (author.collectionCount) {
            meta += ' across ' + plural(Number(author.collectionCount), 'collection');
        }
        var variants = (author.variants || []).filter(Boolean);
        // No author pages exist, so this seeds a search for the name rather
        // than linking somewhere that isn't there.
        return '<a class="author-result" href="collections.html?q=' + encodeURIComponent(author.name) +
            '" data-search-query="' + escapeHtml(author.name) + '">' +
            '<span class="author-result-name">' + highlight(author.name, query) + '</span>' +
            '<span class="author-result-meta">' + escapeHtml(meta) + '</span>' +
            (variants.length
                ? '<span class="author-result-variants">Also written ' +
                  variants.map(function (v) { return highlight(v, query); }).join(', ') + '</span>'
                : '') +
            '</a>';
    }

    function groupCountLabel(group, display) {
        if (group.key === 'collections') return plural(group.items.length, 'collection');
        if (group.key === 'authors') return plural(group.items.length, 'author');
        return plural(group.items.length, 'quote') +
            (group.items.length === 1 ? ' mentions ' : ' mention ') + '“' + escapeHtml(display) + '”';
    }

    function groupHtml(group, options) {
        var query = options.query;
        var display = options.display;
        var body;
        var note = '';

        if (group.key === 'collections') {
            var reasons = {};
            group.items.forEach(function (item) {
                reasons[item.collection.id] = collectionReason(item, query, display);
            });
            body = options.collectionsGridHtml(
                group.items.map(function (item) { return item.collection; }),
                { query: query, reasons: reasons, headingTag: 'h3' }
            );
        } else if (group.key === 'authors') {
            var authors = group.items.slice(0, AUTHOR_LIMIT);
            body = '<div class="author-results">' +
                authors.map(function (item) { return authorCardHtml(item, query); }).join('') + '</div>';
            if (group.items.length > authors.length) {
                note = 'Showing the first ' + authors.length + ' of ' + group.items.length + '.';
            }
        } else {
            var quotes = group.items.slice(0, QUOTE_LIMIT);
            body = '<div class="quote-results">' +
                quotes.map(function (item) { return quoteCardHtml(item, query); }).join('') + '</div>';
            if (group.items.length > quotes.length) {
                note = 'Showing the first ' + quotes.length + ' of ' + group.items.length +
                    ' — keep typing to narrow them down.';
            }
        }

        var headingId = 'search-group-' + group.key;
        return '<section class="search-group" aria-labelledby="' + headingId + '">' +
            '<h2 class="search-group-title" id="' + headingId + '">' + escapeHtml(group.title) +
            '<span class="search-group-count">' + groupCountLabel(group, display) + '</span></h2>' +
            (note ? '<p class="search-group-note">' + escapeHtml(note) + '</p>' : '') +
            body + '</section>';
    }

    /**
     * Render grouped results, including the two empty states: nothing matched
     * at all, and nothing matched *in this category* — the second names the
     * category and offers to clear it, since the category is what emptied the
     * screen.
     */
    function render(container, options) {
        var results = options.results;
        var display = options.display;

        if (!results.groups.length) {
            var pending = options.pending
                ? '<p class="search-empty-hint">Still loading quotes and authors…</p>' : '';
            if (options.category && options.category !== 'all' && options.unfilteredTotal) {
                container.innerHTML = '<div class="search-empty">' +
                    '<p>No matches in ' + escapeHtml(options.category) + ' — “' + escapeHtml(display) +
                    '” has ' + plural(options.unfilteredTotal, 'result') + ' in other categories.</p>' +
                    '<button type="button" class="btn btn-secondary" data-clear-category>' +
                    'Search all categories</button>' + pending + '</div>';
                return;
            }
            container.innerHTML = '<div class="search-empty">' +
                '<p>Nothing matches “' + escapeHtml(display) + '”.</p>' +
                '<button type="button" class="btn btn-secondary" data-clear-search>Clear search</button>' +
                pending + '</div>';
            return;
        }

        container.innerHTML = '<div class="search-results">' +
            results.groups.map(function (group) {
                return groupHtml(group, {
                    query: results.query,
                    display: display,
                    collectionsGridHtml: options.collectionsGridHtml
                });
            }).join('') + '</div>';
    }

    window.QuipsSearch = {
        ensureIndex: ensureIndex,
        pending: pending,
        stats: stats,
        search: search,
        applyCategory: applyCategory,
        facetCounts: facetCounts,
        highlight: highlight,
        render: render
    };
})();
