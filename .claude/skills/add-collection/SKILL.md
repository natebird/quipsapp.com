---
name: add-collection
description: Create a brand-new Quips collection with its quotes and register it in the index. Use when the user wants to add, create, or start a new collection (e.g. "create a Friends collection", "add a new collection of JFK quotes"). Creates collections/<id>.json and adds the matching entry to collections.json.
---

# Add a new collection

A collection is two coordinated edits: a new `collections/<id>.json` file holding the full
quotes, and a new entry in the root `collections.json` index. Both must agree.

Quote-level mechanics — field shape, the verification bar, in-batch dedup, and id format —
are owned by the **`add-quotes`** skill. This skill does not restate them; it follows them,
and only covers what's unique to creating a collection: the collection metadata, the index
entry, and `previewQuotes`.

## Steps

1. **Gather the collection metadata.** Ask the user for anything missing:
   - `id` — kebab-case, also the filename (e.g. `how-i-met-your-mother`). Must not collide
     with an existing collection id / file in `collections/`.
   - `name` — display title (e.g. `How I Met Your Mother`).
   - `description` — one inviting sentence.
   - `author` — defaults to `Quips Editorial` unless told otherwise.
   - `category` — reuse an existing one when it fits: `Creativity`, `Inspiration`,
     `Literature`, `Movies`, `Philosophy`, `Technology`, `Television`, `Wellness`. Add a new
     one only if none fit.
   - `colorName` — pick from the palette in use: `brown`, `cyan`, `forestGreen`, `gold`,
     `magenta`, `mint`, `navyBlue`, `orange`, `primaryBlue`, `purple`, `red`.
   - `iconName` — an SF Symbol. Existing ones: `bolt.fill`, `book.fill`,
     `building.columns.fill`, `cpu.fill`, `flame.fill`, `leaf.fill`, `paintbrush.fill`,
     `shield.fill`, `sparkles`, `sun.dust.fill`, `sunrise.fill`, `tv.fill`, `wand.and.stars`.
     A new valid SF Symbol is fine if it fits the theme better.

2. **Choose a quote id prefix** — a short slug unique to the collection (e.g. `himym`,
   `seinfeld`, `marvel`). Quote ids follow the `add-quotes` format (`<prefix>-NNN`, zero-padded
   to 3 digits) starting at `001`. Check `collections/` for prefixes already in use and pick
   one that's free.

3. **Build the quotes following the `add-quotes` skill** — its field shape, its verification
   bar (`verified` requires *both* exact wording *and* a real primary source; aggregator sites
   establish neither; magnet names like Einstein/Twain/Lincoln get extra suspicion), its
   in-batch dedup, and its `notes` rules. Number ids from `<prefix>-001`.
   - Target ~30 quotes (existing collections run 25–40) unless the user specifies a count —
     but every quote still clears the verification bar. Don't pad to a number with shaky
     quotes; if you can't verify enough for a substantial collection, surface that rather than
     filling the gap.

4. **Create `collections/<id>.json`.** Match the shape of existing collection files (the block
   below is illustrative — if the real files carry other fields, match them):
   ```json
   {
     "id": "<id>",
     "name": "<name>",
     "description": "<description>",
     "author": "Quips Editorial",
     "colorName": "<colorName>",
     "iconName": "<iconName>",
     "category": "<category>",
     "lastUpdated": "<today>T12:00:00Z",
     "quotes": [ /* quote objects per the add-quotes skill, ids <prefix>-001, -002, … */ ]
   }
   ```

5. **Add the index entry to `collections.json`** in the `collections` array (append, or place
   thematically). It mirrors the file plus index-only fields:
   ```json
   {
     "id": "<id>",
     "name": "<name>",
     "description": "<description>",
     "author": "Quips Editorial",
     "quoteCount": <number of quotes>,
     "previewQuotes": [
       "A short, punchy quote from the collection.",
       "A second representative quote."
     ],
     "colorName": "<colorName>",
     "iconName": "<iconName>",
     "category": "<category>",
     "lastUpdated": "<today>T12:00:00Z"
   }
   ```
   - `quoteCount` must equal the number of quotes in the collection file.
   - `previewQuotes` — pick 2 of the most recognizable/short **verified** lines.
   - Bump the index's top-level `lastUpdated` to `<today>T12:00:00Z`.

6. **Validate.** Run the shared validator as a full sweep — no `--collection` — so the
   cross-collection prefix-uniqueness check runs and catches a new collection that reuses an
   existing prefix. It also confirms both files parse, `quoteCount` matches the actual count,
   ids are unique and well-formed, required fields are present, and there's no duplicate quote
   text. Don't report success until it passes.
   ```bash
   python3 scripts/validate_collections.py
   ```

7. **Report** the new collection id, quote count, and any quotes marked `unverified` (with reason).
