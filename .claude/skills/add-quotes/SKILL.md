---
name: add-quotes
description: Add one or more new quotes to an existing Quips collection. Use when the user wants to add, append, or insert quotes into a collection (e.g. "add 5 quotes to seinfeld", "add this Barney line to How I Met Your Mother"). Handles the quote objects, id numbering, and keeps the collections.json index in sync.
---

# Add quotes to a collection

Quotes live in `collections/<id>.json` under the `quotes` array. The root `collections.json`
is an index of every collection and must be kept in sync (its `quoteCount` and `lastUpdated`).

## Steps

1. **Identify the collection.** Match the user's request to a file in `collections/`. If
   ambiguous, list candidates and ask. The filename (minus `.json`) is the collection `id`.

2. **Read the collection file** to learn the quote `id` prefix and the current highest number.
   Quote ids are `<prefix>-NNN`, zero-padded to 3 digits (e.g. `himym-040`, `seinfeld-025`).
   New quotes continue from the highest existing number. Prefixes are per-collection — check
   the file, don't assume (e.g. `inspiration-daily` uses `di`, `tech-visionaries` uses `tv`).

3. **Append each new quote** to the `quotes` array with all fields:
   ```json
   {
     "id": "himym-041",
     "content": "The exact quote text.",
     "authorName": "Character Name (Actor Name)",
     "source": "Show/Book/Film, S1E1 'Episode Title' (Year)",
     "quoteDate": "2005-09-19",
     "verificationStatus": "verified",
     "notes": "One sentence of context about the quote."
   }
   ```
   - `authorName` — for shows/films use `Character (Actor)`; for people, the person's name.
   - `source` — be as specific as the evidence allows. Use `Show (2005-2014)` when you can't
     pin the episode.
   - `quoteDate` — `YYYY-MM-DD` when known; otherwise `c. YYYY` for an approximate year.
   - `verificationStatus` — `verified` only if you're confident the wording is exact. Use
     `unverified` for paraphrases or approximate wording, and say so in `notes`.
   - `notes` — a single sentence of context.

4. **Update the collection file's** top-level `lastUpdated` to today's date in
   `YYYY-MM-DDT12:00:00Z` form.

5. **Update `collections.json`** — find the matching entry in the `collections` array:
   - Set `quoteCount` to the new total length of the `quotes` array.
   - Set that entry's `lastUpdated` to today (`YYYY-MM-DDT12:00:00Z`).
   - Bump the file's top-level `lastUpdated` to the same value.
   - Only touch `previewQuotes` if the user asks to feature a new quote.

6. **Validate JSON.** Both files must parse. Run:
   ```bash
   python3 -c "import json; json.load(open('collections/<id>.json')); json.load(open('collections.json')); print('ok')"
   ```

7. **Report** how many quotes were added, the new total, and any that you marked `unverified`.
