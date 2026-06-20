#!/usr/bin/env python3
"""Validate the Quips collections data.

Single source of truth for the integrity checks the `add-quotes` and
`add-collection` skills rely on, and for CI. Stdlib only.

Checks (errors fail the run; warnings are reported but pass unless --strict):

  ERROR
    - collections.json and every collections/<id>.json parse as JSON
    - every index entry has a matching file, and every file is in the index
    - index entry id matches its filename
    - quoteCount equals the actual number of quotes in the file
    - core fields agree between the index entry and the file
      (name, author, category, colorName, iconName)
    - quote ids are unique within a collection and match <prefix>-NNN (3+ digits)
    - all quotes in a collection share one prefix
    - each collection's prefix is unique across all collections (full run only)
    - every quote has the required fields and a valid verificationStatus
      (verified, attributed, unverified, folk-wisdom)
    - sourceType, when present, is a known QuoteSourceType rawValue
      (speech, book, movie, podcast, …)
    - no duplicate quote text within a collection

  WARN
    - description differs between index entry and file
    - lastUpdated is not YYYY-MM-DDTHH:MM:SSZ
    - previewQuotes is not a list of 2 non-empty strings
    - quoteDate, when present, is not one of the accepted shapes
      (YYYY[-MM[-DD]], "c. YYYY", decade/year ranges, "c. N BCE/CE",
       "c. Nth century [BCE]")

Usage:
    validate_collections.py [--root ROOT] [--collection ID] [--strict]

    --root        repo root containing collections.json (default: .)
    --collection  validate only this collection + its index entry
                  (skips orphan and cross-collection prefix checks)
    --strict      treat warnings as errors (use in CI)

Exit code 0 on success, 1 on failure.
"""

import argparse
import json
import os
import re
import sys
from collections import Counter

REQUIRED_QUOTE_FIELDS = {"id", "content", "authorName", "source", "verificationStatus", "notes"}
MIRRORED_FIELDS = ("name", "author", "category", "colorName", "iconName")
VALID_STATUS = {"verified", "attributed", "unverified", "folk-wisdom"}
# Optional per-quote source category. Mirrors QuoteSourceType.rawValue in the iOS
# app (QuotebookCore/.../Models/QuoteSourceType.swift) — keep in sync; values are
# additive only. Validated only when the field is present.
VALID_SOURCE_TYPES = {
    "unspecified", "inPerson", "book", "article", "newspaper", "magazine",
    "movie", "television", "podcast", "radio", "song", "speech", "interview",
    "website", "socialMedia", "video", "letter", "poem", "play", "lecture",
    "documentary",
}
ID_RE = re.compile(r"^[a-z0-9]+-\d{3,}$")
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
# Accepts the date shapes actually used across the collections:
#   YYYY, YYYY-MM, YYYY-MM-DD
#   c. YYYY               c. 1969
#   c. YYYYs[-YYYYs]      c. 1950s, c. 1920s-1930s   (decade / decade range)
#   c. YYYY-YYYY          c. 2009-2014               (year range)
#   c. N[-N] BCE|CE       c. 500 BCE, c. 170-180 CE
#   c. Nth century [BCE]  c. 13th century, c. 6th century BCE
QUOTE_DATE_RE = re.compile(
    r"""^(
        \d{4}(-\d{2}(-\d{2})?)?
      | c\.\ \d{4}
      | c\.\ \d{4}s(-\d{4}s)?
      | c\.\ \d{4}-\d{4}
      | c\.\ \d{1,4}(-\d{1,4})?\ (BCE|CE)
      | c\.\ \d{1,2}(st|nd|rd|th)\ century(\ BCE)?
    )$""",
    re.VERBOSE,
)


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def load_json(path, rep):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        rep.error(f"missing file: {path}")
    except json.JSONDecodeError as e:
        rep.error(f"{path}: invalid JSON ({e})")
    return None


def prefix_of(quote_id):
    return quote_id.rsplit("-", 1)[0] if "-" in quote_id else quote_id


def validate_collection(cid, data, entry, rep):
    """Validate one collection file against its index entry. Returns the
    collection's quote-id prefix (or None) for the cross-collection check."""
    if data is None:
        return None

    if data.get("id") != cid:
        rep.error(f"{cid}: file id {data.get('id')!r} != filename")

    quotes = data.get("quotes")
    if not isinstance(quotes, list):
        rep.error(f"{cid}: 'quotes' is missing or not a list")
        return None

    ids = [q.get("id", "") for q in quotes]

    if entry is not None:
        if entry.get("quoteCount") != len(quotes):
            rep.error(f"{cid}: index quoteCount {entry.get('quoteCount')} != {len(quotes)} quotes")
        for field in MIRRORED_FIELDS:
            if entry.get(field) != data.get(field):
                rep.error(f"{cid}: index {field} {entry.get(field)!r} != file {data.get(field)!r}")
        if entry.get("description") != data.get("description"):
            rep.warn(f"{cid}: description differs between index and file")
        if not TS_RE.match(str(entry.get("lastUpdated", ""))):
            rep.warn(f"{cid}: index lastUpdated not YYYY-MM-DDTHH:MM:SSZ")
        pq = entry.get("previewQuotes")
        if not (isinstance(pq, list) and len(pq) == 2 and all(isinstance(p, str) and p.strip() for p in pq)):
            rep.warn(f"{cid}: previewQuotes should be 2 non-empty strings")

    if not TS_RE.match(str(data.get("lastUpdated", ""))):
        rep.warn(f"{cid}: file lastUpdated not YYYY-MM-DDTHH:MM:SSZ")

    dup_ids = sorted(i for i, n in Counter(ids).items() if n > 1)
    if dup_ids:
        rep.error(f"{cid}: duplicate quote ids {dup_ids}")

    bad_ids = sorted(i for i in ids if not ID_RE.match(i))
    if bad_ids:
        rep.error(f"{cid}: malformed quote ids {bad_ids}")

    prefixes = {prefix_of(i) for i in ids if ID_RE.match(i)}
    if len(prefixes) > 1:
        rep.error(f"{cid}: mixed id prefixes {sorted(prefixes)}")

    for q in quotes:
        qid = q.get("id", "?")
        missing = REQUIRED_QUOTE_FIELDS - q.keys()
        if missing:
            rep.error(f"{cid}/{qid}: missing fields {sorted(missing)}")
        if q.get("verificationStatus") not in VALID_STATUS:
            rep.error(f"{cid}/{qid}: invalid verificationStatus {q.get('verificationStatus')!r}")
        if "sourceType" in q and q.get("sourceType") not in VALID_SOURCE_TYPES:
            rep.error(f"{cid}/{qid}: invalid sourceType {q.get('sourceType')!r}")
        if not str(q.get("content", "")).strip():
            rep.error(f"{cid}/{qid}: empty content")
        qd = q.get("quoteDate")
        if qd is not None and not QUOTE_DATE_RE.match(str(qd)):
            rep.warn(f"{cid}/{qid}: unrecognized quoteDate {qd!r}")

    texts = [str(q.get("content", "")).strip().lower() for q in quotes]
    dup_text = sorted(t for t, n in Counter(t for t in texts if t).items() if n > 1)
    if dup_text:
        rep.error(f"{cid}: {len(dup_text)} duplicate quote text(s) within collection")

    return next(iter(prefixes)) if len(prefixes) == 1 else None


def main():
    ap = argparse.ArgumentParser(description="Validate Quips collections data.")
    ap.add_argument("--root", default=".", help="repo root containing collections.json")
    ap.add_argument("--collection", help="validate only this collection id")
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    args = ap.parse_args()

    rep = Report()
    index_path = os.path.join(args.root, "collections.json")
    coll_dir = os.path.join(args.root, "collections")

    index = load_json(index_path, rep)
    if index is None:
        print("[ERROR] cannot read collections.json", file=sys.stderr)
        return 1

    if not TS_RE.match(str(index.get("lastUpdated", ""))):
        rep.warn("collections.json: top-level lastUpdated not YYYY-MM-DDTHH:MM:SSZ")

    entries = {e.get("id"): e for e in index.get("collections", [])}

    files = set()
    if os.path.isdir(coll_dir):
        files = {fn[:-5] for fn in os.listdir(coll_dir) if fn.endswith(".json")}

    if args.collection:
        targets = [args.collection]
        if args.collection not in entries:
            rep.error(f"{args.collection}: no entry in collections.json")
        if args.collection not in files:
            rep.error(f"{args.collection}: no file collections/{args.collection}.json")
    else:
        targets = sorted(entries.keys() | files)
        for cid in entries.keys() - files:
            rep.error(f"{cid}: in index but no collections/{cid}.json")
        for cid in files - entries.keys():
            rep.error(f"{cid}: file present but not in collections.json index")

    prefixes = {}
    for cid in targets:
        if cid not in files:
            continue
        data = load_json(os.path.join(coll_dir, f"{cid}.json"), rep)
        prefix = validate_collection(cid, data, entries.get(cid), rep)
        if prefix:
            prefixes.setdefault(prefix, []).append(cid)

    if not args.collection:
        for prefix, owners in sorted(prefixes.items()):
            if len(owners) > 1:
                rep.error(f"prefix {prefix!r} used by multiple collections: {sorted(owners)}")

    for msg in rep.errors:
        print(f"[ERROR] {msg}")
    for msg in rep.warnings:
        print(f"[WARN]  {msg}")

    n_coll = len([c for c in targets if c in files])
    print(f"\n{len(rep.errors)} error(s), {len(rep.warnings)} warning(s) across {n_coll} collection(s)")

    failed = bool(rep.errors) or (args.strict and bool(rep.warnings))
    if not failed:
        print("ok")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())