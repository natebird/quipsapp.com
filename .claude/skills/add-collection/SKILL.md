---
name: add-collection
description: Create a brand-new Quips collection with its quotes and register it in the index. Use when the user wants to add, create, or start a new collection (e.g. "create a Friends collection", "add a new collection of JFK quotes"). Creates collections/<id>.json and adds the matching entry to collections.json.
---

# Add a new collection

A collection is two coordinated edits: a new `collections/<id>.json` file holding the full
quotes, and a new entry in the root `collections.json` index. Both must agree.

## Steps

1. **Gather the collection metadata.** Ask the user for anything missing:
   - `id` — kebab-case, unique, also the filename (e.g. `how-i-met-your-mother`).
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
   `seinfeld`, `marvel`). Quote ids are `<prefix>-NNN`, zero-padded to 3 digits starting at
   `001`. Look at existing files in `collections/` for the convention; pick a prefix not
   already used.

3. **Create `collections/<id>.json`:**
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
     "quotes": [
       {
         "id": "<prefix>-001",
         "content": "The exact quote text.",
         "authorName": "Character Name (Actor Name)",
         "source": "Show/Book/Film, S1E1 'Episode Title' (Year)",
         "quoteDate": "2005-09-19",
         "verificationStatus": "verified",
         "notes": "One sentence of context."
       }
     ]
   }
   ```
   Quote-field conventions (same as the `add-quotes` skill):
   - `authorName` — `Character (Actor)` for shows/films, the person's name otherwise.
   - `source` — as specific as the evidence allows; `Show (2005-2014)` when the episode is unknown.
   - `quoteDate` — `YYYY-MM-DD` when known, else `c. YYYY`.
   - `verificationStatus` — `verified` only when confident of exact wording; otherwise
     `unverified`, noting the paraphrase in `notes`.
   - Aim for ~30 quotes unless the user specifies a count; existing collections run 25–40.

4. **Add the index entry to `collections.json`** in the `collections` array (append, or place
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
   - `previewQuotes` — pick 2 of the most recognizable/short lines.
   - Bump the index's top-level `lastUpdated` to `<today>T12:00:00Z`.

5. **Validate JSON.** Both files must parse:
   ```bash
   python3 -c "import json; json.load(open('collections/<id>.json')); json.load(open('collections.json')); print('ok')"
   ```

6. **Report** the new collection id, quote count, and any quotes marked `unverified`.
