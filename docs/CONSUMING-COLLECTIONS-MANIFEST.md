# Consuming the collections manifest & generated feeds

How the website (and any other client) reads the published collections data from
`data.quipsapp.com` to surface **recently added** and **recently updated**
collections, plus the dynamic cross-collection feeds (Recently Added, On This
Day, Newsletter Picks).

> Everything the client needs is in the published JSON. You do **not** need the
> `quips-collections` data repo to implement consumption.

## Where it lives

- **Versioned dataset:** `https://data.quipsapp.com/v<version>/…` — immutable,
  cache-forever. The website pins the version in `.data-version` and the deploy
  workflow pulls `v<version>/collections.json` (+ each `collections/<id>.json`).
- **Mutable pointer:** `https://data.quipsapp.com/latest/manifest.json` — the one
  thing you poll; it names the current version and the URL/hash/bytes of every
  asset.

## The index: `collections.json`

The manifest of collections shown on `collections.html` and in the iOS app. Each
entry carries two per-collection dates (both ISO-8601 UTC):

| Field         | Since | Meaning                                    | Use it for                       |
| ------------- | ----- | ------------------------------------------ | -------------------------------- |
| `addedAt`     | v1.8.0| When the collection was **first published**| "New" / "Recently added" sort    |
| `lastUpdated` |       | When its quotes were **most recently changed** | Freshness / "Updated" sort   |

A collection added long ago but freshly edited has an **old `addedAt`** and a
**recent `lastUpdated`** — that's why both exist. v1.7.0 also added per-collection
`colorLightHex` / `colorDarkHex` (Palette 2.0) alongside the existing `colorName`.

### Newest-added sort (what `collections.html` implements)

Sort by `addedAt` descending, then `lastUpdated`, then original array order
(stable). ISO-8601 UTC strings compare correctly as plain strings — no date
parsing. Keep the manifest's array order as the final tiebreak so equal-timestamp
entries stay in their curated sequence. Fall back to `lastUpdated` if an older
feed lacks `addedAt`.

```js
function sortByNewest(collections) {
  const added   = c => c.addedAt     || c.lastUpdated || "";
  const updated = c => c.lastUpdated  || "";
  return collections
    .map((collection, index) => ({ collection, index }))
    .sort((a, b) => {
      const byAdded = added(b.collection).localeCompare(added(a.collection));
      if (byAdded !== 0) return byAdded;
      const byUpdated = updated(b.collection).localeCompare(updated(a.collection));
      if (byUpdated !== 0) return byUpdated;
      return a.index - b.index;
    })
    .map(entry => entry.collection);
}
```

Don't rely on array order alone for "newest" — order is curated, not
chronological. And don't hand-edit the served `collections.json`; it's pulled
fresh from `data.quipsapp.com` on every deploy.

## Generated feeds (dynamic, cross-collection)

v1.9.0's `manifest.json` gained a `generated` block advertising three read-only
presentation feeds under the same versioned base, each with the same
`url`/`hash`/`bytes` integrity contract as `indexUrl`/`indexHash`:

```jsonc
"generated": {
  "recentlyAdded":   { "url": ".../v1.9.0/recently-added.json",   "hash": "sha256-…", "bytes": 14036 },
  "onThisDay":       { "url": ".../v1.9.0/on-this-day.json",       "hash": "sha256-…", "bytes": 401445 },
  "newsletterPicks": { "url": ".../v1.9.0/newsletter-picks.json",  "hash": "sha256-…", "bytes": 3242 }
}
```

**Discover via the manifest — never hardcode feed URLs.** A key may be absent (a
feed can be added later or skipped); iterate the map and degrade gracefully (a
missing feed just means "don't show that shelf"). Verify `sha256(bytes) == hash`
before caching, and cache keyed by hash (skip refetch when the manifest hash is
unchanged). Versioned URLs are immutable.

These feeds **reuse quotes from real collections** and deliberately break the
index's uniqueness rules — treat them as presentation-only. Every quote is the
normal quote object plus `sourceCollection` (id of the real collection — use it
to route a tap into collection detail and to de-dupe across feeds);
newsletter-picks quotes also carry `newsletterIssue`. Decode leniently.

| Feed | File | Shape | Render |
| ---- | ---- | ----- | ------ |
| Recently Added | `recently-added.json` | collection-shaped, `quotes[]` newest-first | "Recently Added" shelf |
| On This Day | `on-this-day.json` | **`days{}` keyed by `"MM-DD"`** (not `quotes[]`) | Look up the visitor's **local** `MM-DD`; hide if the key is absent (~222 of 366 populated). Quotes within a day are oldest-first by `quoteDate`. Decide a Feb-29 policy. |
| Newsletter Picks | `newsletter-picks.json` | collection-shaped, `quotes[]` with `newsletterIssue` | "As seen in Quote Unquote #N" badge; deep-link to the issue |

## Featured collections & search index

Two further artifacts are consumed the same optional way, both published since
data v1.11.0. They stay optional: the site pulls them if they exist and shows
nothing if they don't, so older pins keep working.

Note that v1.11.0's `manifest.json` advertises `featuredCollections` under
`generated` but **not** `searchIndex`, even though `search-index.json` is
served. Until the manifest lists it, manifest-driven clients won't discover the
index; this site pulls both by path at build time, so it's unaffected.

**`featured-collections.json`** — one featured collection per ISO week:

```jsonc
{ "weeks": [ { "weekStart": "2026-08-03", "weekEnd": "2026-08-09",
               "collectionId": "michael-jordan",
               "note": "Michael Jordan — seasonal: matches sport for August",
               "quote": { "id": "mj-001", "content": "…", "authorName": "Michael Jordan",
                          "sourceCollection": "michael-jordan" } } ] }
```

Pick the week whose bounds contain the visitor's **local** `YYYY-MM-DD` (plain
string comparison). No matching week is normal — the schedule runs ~12 weeks out
and a long release gap can outrun it — so render nothing rather than showing a
past week as current. The entry carries no presentation: name, colour, and icon
come from joining `collectionId` against `collections.json`, so a rename or
palette change ships in that file alone. If the join fails, skip the week.

**`search-index.json`** — every quote plus an author roster (~1 MB):

```jsonc
{ "quoteCount": 2670, "authorCount": 924,
  "quotes":  [ { "id": "mj-001", "content": "…", "authorName": "Michael Jordan",
                 "source": "…", "quoteDate": "1994",
                 "verificationStatus": "verified", "sourceCollection": "michael-jordan" } ],
  "authors": [ { "name": "C. S. Lewis", "quoteCount": 38, "collectionCount": 5,
                 "variants": ["C.S. Lewis"] } ] }
```

Fetch it **lazily** — on the first keystroke, not on page load — and fall back to
searching `collections.json` alone until it lands. The roster folds spellings of
one name into `variants` while quote entries keep their collection's spelling, so
join a quote to its author through `name` + `variants` rather than normalising
names yourself.

## Status on quipsapp.com

- The `collections.html` grid sorts newest-added first by `addedAt` (this doc's
  sort). `.data-version` is pinned to 1.11.0.
- The three generated feeds render as shelves via `js/feeds.js` — a homepage
  teaser (replacing the old "featured collection of the week") and full shelves
  above the collections grid. `.github/workflows/deploy.yml` pulls the feeds
  same-origin next to `collections.json` (so `connect-src 'self'` suffices);
  each is optional and a missing feed simply drops its shelf.
- `featured-collections.json` and `search-index.json` are pulled by the same
  optional loop and wired up: `js/feeds.js` renders the week's featured card
  into `#featured-collection`, and `js/collections-search.js` searches quotes and
  authors. Both are live as of the v1.11.0 pin (2,711 quotes, 941 authors).
  Before any future bump, check the target version actually publishes them —
  `curl -fsI https://data.quipsapp.com/v<VERSION>/search-index.json` — since a
  version missing them silently drops both features.
