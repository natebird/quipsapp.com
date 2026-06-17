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

2. **Read the collection file** to learn:
   - the quote `id` prefix and the current highest number. Quote ids are `<prefix>-NNN`,
     zero-padded to 3 digits (e.g. `himym-040`, `seinfeld-025`). Prefixes are per-collection
     — read it from the file, don't assume (e.g. `inspiration-daily` uses `di`,
     `tech-visionaries` uses `tv`).
   - the **exact field shape of existing entries**. The object in step 4 is illustrative; if
     the real entries carry extra or differently-named fields, match the file, not the template.

3. **Check for duplicates.** Before appending, confirm the quote — and any near-paraphrase of
   it — is not already in the collection. Skip duplicates and report them rather than adding them.

4. **Append each new quote** to the `quotes` array with all fields. When adding several at
   once, number them sequentially from the current max (`max+1`, `max+2`, …):
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
     Never invent a specific date to look precise.
   - `verificationStatus` — `verified` / `unverified`. See **Verification** below. The default
     is `unverified`; promote to `verified` only when the bar is met.
   - `notes` — a single sentence of context (and, if `unverified`, which axis failed).

## Verification — the point of the task, do not cut corners

`verified` is a claim, not a feeling. Model confidence is exactly the failure mode: the most
quoted lines on the internet are also the most misattributed. Set `verificationStatus`
to `verified` **only when both axes hold**:

- **Wording is exact** — matches the primary source (allowing honest punctuation/transcription
  variance), not a popular paraphrase.
- **Attribution is real** — speaker *and* source trace to a primary or authoritative record:
  the actual episode/transcript, book (edition/page where possible), recorded speech, or
  published interview.

Rules:

- Aggregator sites (BrainyQuote, Goodreads, AZQuotes, Pinterest, "quotes about X" listicles)
  establish **neither** axis. A quote found only there is `unverified`.
- Be actively suspicious of lines attributed to magnet names — Einstein, Twain, Lincoln,
  Gandhi, Monroe, Mandela, Churchill. Trace it to a real source or drop it.
- For show/film quotes the primary source is the episode itself (or a faithful transcript):
  confirm the named character actually says the line, in that wording.
- If wording is exact but attribution is contested (or vice versa), it is `unverified` — name
  the failing axis in `notes`.
- Never invent or approximate a source, and never pad a batch to hit a number. Four solidly
  verified quotes beat seven shaky ones.

5. **Update the collection file's** top-level `lastUpdated` to today in `YYYY-MM-DDT12:00:00Z`.

6. **Update `collections.json`** — find the matching entry in the `collections` array:
   - Set `quoteCount` to the new total length of the `quotes` array.
   - Set that entry's `lastUpdated` to today (`YYYY-MM-DDT12:00:00Z`).
   - Bump the file's top-level `lastUpdated` to the same value.
   - Only touch `previewQuotes` if the user asks to feature a new quote.

7. **Validate.** Run the shared validator, scoped to the collection you changed. It confirms
   both files parse, `quoteCount` matches the actual count, ids are unique and well-formed,
   required fields are present, and there's no duplicate quote text. Don't report success until
   it passes.
   ```bash
   python3 scripts/validate_collections.py --collection <id>
   ```

8. **Report** how many quotes were added, the new total, anything marked `unverified` (with
   reason), and any duplicates skipped.
