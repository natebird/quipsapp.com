/**
 * Quips Marketing Website
 * Featured Collection of the Week (homepage)
 *
 * Reads featured-schedule.json (a list of { weekStart: "YYYY-MM-DD", id })
 * and collections.json, picks this week's collection, and renders it into
 * #featured-card on index.html. If anything fails (no JS, fetch error,
 * unknown id), the static fallback markup in index.html stays in place.
 *
 * Week selection:
 * - Use the entry with the latest weekStart <= today.
 * - Before the first entry (or on bad data): use the first entry.
 * - More than a week past the last entry: rotate deterministically through
 *   the list by ISO week number modulo list length.
 */
(function () {
    'use strict';

    // Local date as "YYYY-MM-DD" (comparable lexicographically).
    function localISODate(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    // Whole days from a "YYYY-MM-DD" string to a "YYYY-MM-DD" string.
    function daysBetween(fromISO, toISO) {
        var from = new Date(fromISO + 'T00:00:00Z').getTime();
        var to = new Date(toISO + 'T00:00:00Z').getTime();
        return Math.floor((to - from) / 86400000);
    }

    // ISO-8601 week number (1-53).
    function isoWeekNumber(date) {
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        var dayNum = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
        d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    }

    function pickEntry(entries, now) {
        var sorted = entries.slice().sort(function (a, b) {
            return a.weekStart < b.weekStart ? -1 : (a.weekStart > b.weekStart ? 1 : 0);
        });
        var today = localISODate(now);

        var current = null;
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].weekStart <= today) current = sorted[i];
        }

        // Today is before the schedule starts: use the first entry.
        if (!current) return sorted[0];

        // Past the end of the schedule: rotate by ISO week number.
        var last = sorted[sorted.length - 1];
        if (current === last && daysBetween(last.weekStart, today) >= 7) {
            return sorted[isoWeekNumber(now) % sorted.length];
        }

        return current;
    }

    // Render with DOM APIs + textContent only — collection data is never
    // injected as HTML.
    function render(card, collection) {
        var body = document.createElement('div');
        body.className = 'featured-card-body';

        var meta = document.createElement('p');
        meta.className = 'featured-meta';
        var count = Number(collection.quoteCount);
        meta.textContent = (collection.category ? collection.category + ' · ' : '') +
            (isFinite(count) && count > 0 ? count + ' quotes' : 'Curated collection');

        var name = document.createElement('h3');
        name.className = 'featured-name';
        name.textContent = collection.name || '';

        var description = document.createElement('p');
        description.className = 'featured-description';
        description.textContent = collection.description || '';

        var link = document.createElement('a');
        link.className = 'featured-browse-link';
        link.href = 'collections/' + encodeURIComponent(collection.id) + '.html';
        link.textContent = 'Browse the collection';

        body.append(meta, name, description, link);

        if (collection.colorName) {
            card.setAttribute('data-color', String(collection.colorName));
        }
        card.replaceChildren(body);
    }

    async function initFeaturedCollection() {
        var card = document.getElementById('featured-card');
        if (!card) return;

        try {
            var responses = await Promise.all([
                fetch('featured-schedule.json'),
                fetch('collections.json')
            ]);
            var schedule = await responses[0].json();
            var data = await responses[1].json();

            var entries = (schedule && schedule.featured) || [];
            if (!entries.length) return;

            var entry = pickEntry(entries, new Date());
            if (!entry) return;

            var collections = (data && data.collections) || [];
            var collection = collections.find(function (c) { return c.id === entry.id; });
            if (!collection) return; // Unknown id: keep the static fallback.

            render(card, collection);
        } catch (error) {
            // Keep the static fallback (links to collections.html).
            console.error('Error loading featured collection:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFeaturedCollection);
    } else {
        initFeaturedCollection();
    }
})();
