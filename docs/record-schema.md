# Record files: `data/records/<record_id>.json`

One JSON file per tracked record, holding everything we know about it that
isn't geometry: the dated timeline, money, facts, images and sources. Written
so that several people (or threads) can research different parcels at once
without ever editing the same file.

`record_id` is the same key the site's tables already use: the `blklot` for a
`status.csv` row (e.g. `4114010`) or the geometry file stem for an
approximate project (e.g. `pier70_building_101`). A record file for an id that
doesn't exist in `status.csv` or `approximate_projects.csv` fails validation.

`python3 src/validate_records.py` checks every file (CI runs it).

## Shape

```json
{
  "record_id": "pier70_building_101",
  "names": ["Building 101", "Bethlehem Steel Administration Building"],
  "summary": "One or two sourced sentences a visitor reads first.",
  "summary_sources": ["src-hpc-2013"],
  "milestones": [
    {"date": "2020-12", "status": "complete", "text": "Rehabilitation completed",
     "sources": ["src-hpc-2013"], "expected": false, "approximate": true}
  ],
  "costs": [
    {"amount_usd": 100000000, "what": "Historic core rehabilitation, all buildings",
     "date": "2017", "approximate": true, "sources": ["src-sfbt-2017"]}
  ],
  "facts": [
    {"key": "developer", "value": "Orton Development", "sources": ["src-sfport-core"]},
    {"key": "architect", "value": "Marcy Wong Donn Logan Architects", "sources": ["src-sfport-core"]},
    {"key": "gross_sqft", "value": "56,000", "sources": ["src-sfport-core"]}
  ],
  "images": [
    {"path": "data/manual/images/building101_1917.jpg", "kind": "before",
     "taken": "1917", "credit": "Library of Congress, HAER CA-...", "license": "public-domain",
     "source_url": "https://www.loc.gov/item/...",
     "focus": [0.1, 0.2, 0.5, 0.6]}
  ],
  "sources": [
    {"id": "src-hpc-2013", "title": "Historic Preservation Commission packet 2013.1168E",
     "publisher": "SF Planning", "date": "2013-11", "url": "https://...", "accessed": "2026-09-18"}
  ],
  "open_questions": ["Construction start for the seismic work is not dated in any source found."],
  "last_verified": "2026-09-18"
}
```

## Rules the validator enforces

- `record_id` matches the filename and exists in the manifest tables.
- Every `milestone`, `cost`, `fact` and the `summary` cites at least one
  source id, and every cited id exists in `sources`. No source, no claim.
- Dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. `expected: true` for dates
  that haven't happened; `approximate: true` when only a year or range is
  sourced.
- `status` on a milestone, if set, is one of `complete`,
  `under_construction`, `planned`, `existing`, `being_removed`.
- Every image has `path`, `kind`, `credit`, `license` and `source_url`, and
  the file exists. `kind` is one of:
  - `historic`: long before the redevelopment -- an old photograph of the
    site as it was, well before any of the current project's history.
  - `before`: within about two years before construction start, showing
    the state the project replaced.
  - `now`: the most recent photograph.
  - `completed`: within about a year after the project's completion date.
  - `rendering`: an artist's or architect's depiction of a proposed
    project, not a photograph.
  - `document`: a scanned figure, plan or page from a source document.

  The two-year and one-year windows are judged against the record's own
  `milestones` (the dated construction-start and completion events): an
  image's `taken` date inside the window for its kind is what makes the
  tag correct, not a guess. If `taken` can't place a photo against either
  window, leave its existing kind and note the uncertainty in
  `open_questions` rather than guess.

  `kind`, together with `figure`, `quality` and the record's own status,
  decides which tier an image ranks in; `sitegen/imagepick.py` is the one
  place that ranks images (by tier, then score) for the sharing card and
  the record page. See the `figure`, `appeal`, `quality`, `pin`, `subject`
  and `aerial` fields below.

  Allowed licenses: `public-domain`, `public-record`, `cc-by`, `cc-by-sa`,
  `cc0`, `owner` (our own photo). Anything else is not hosted here: link it
  in `sources` instead.
- An image may set `scope`: `record` (default, not usually written
  explicitly), `area` or `site`.
  - `record`: depicts this record specifically.
  - `area`: a figure that covers several records at once (a block plan, a
    site plan sheet), this record among them. Requires a `focus` box on
    this record's entry -- the validator rejects an `area` image with no
    `focus`. The focus crop is eligible for the sharing card, and the
    record page labels the figure "part of a larger drawing" since the
    crop only shows this record's part of it.
  - `site`: depicts the wider site the record belongs to (an aerial of all
    of Mission Rock, say), not the record itself, and is never used to
    choose a sharing card (`sitegen/cards.py`) even with a `focus` box set;
    it can still appear in the record's own photo gallery on the page.
  The same source figure can be referenced by several records' entries,
  each with its own `focus` box pointing at that record's part of the
  sheet -- don't duplicate the image file for that.
- An image may carry `license_evidence` (a URL to the terms, permissions or
  figure-credit page that was read to establish reuse is allowed) and
  `license_note` (one sentence saying what that page allows, and the date
  it was read). Optional, but a hosted image without them gets a build-time
  warning (`src/validate_records.py`), so the count of unverified images is
  visible on every run. An image whose source doesn't establish reuse isn't
  hosted here at all -- see the note on `license` above.
- A hosted image must decode as a baseline JPEG (`src/normalize_images.py`
  re-encodes one that doesn't); sitegen's own stdlib decoder
  (`sitegen/jpeg.py`) has no path through a progressive scan, and a sharing
  card silently drops a photo it can't decode.
- `focus` is optional: `[x, y, w, h]` as fractions (0-1) of the image,
  meaning "cover-crop the sharing card to this box" instead of the default
  contain-fit. Only worth setting where the record is a small part of a much
  wider photo (an aerial, say) and showing the whole frame would waste most
  of the card on unrelated surroundings -- most images should leave it unset.
  Required when `scope` is `area`.
- `caption` is an optional string: the figure's own title or caption,
  copied verbatim from the document, with the page number (e.g. "Figure
  4.2: Illustrative Site Plan, Design for Development p.38"). Shown under
  the image on the record page. The validator only checks that it's a
  string.
- `crop_note` is an optional string, for a hosted figure whose crop still
  includes some surrounding body text because the figure and the prose
  share a rectangle on the page (a caption wrapped by text, a legend inline
  with a text column). One short sentence saying so, e.g. "excerpt includes
  adjacent body text from p.38" -- crop pixels are never painted over or
  masked to remove that text (see `src/extract_pdf_figure.py`), so this
  says plainly that the excerpt isn't figure-only. The validator only
  checks that it's a string.
- `source_crop` is an optional string recording the exact
  `src/extract_pdf_figure.py` invocation (page, rect mode) that produced a
  hosted figure, so the extract is reproducible. The validator only checks
  that it's a string.
- `figure` is optional, meaningful only on a `document`: `illustrative` (a
  color, labelled drawing with a legend -- a park schematic-design sheet is
  the model) or `positioning` (a key plan, black-and-white massing, a block
  diagram). It decides the image's tier in `sitegen/imagepick.py`: an
  illustrative drawing is card-eligible, a positioning one is ranked on the
  record page only. A `document` with no `figure` set ranks like
  `positioning` (never card-eligible) until one is set.
- `appeal` is an optional integer 1 to 5, an editorial judgement of how well
  the image reads at card size and what it shows. Setting `appeal` without
  `appeal_note` (one sentence saying why, e.g. "shows the plaza and the
  retail frontage from the street") is a validation error -- an unexplained
  score is a guess, and this repo doesn't guess. Unset counts as 3 (the
  middle) when `sitegen/imagepick.py` scores the image.
- `quality` is optional: `poor` when the photo is obstructed, tiny,
  distant, blurred or watermarked. Requires `quality_note`, same rule as
  `appeal`. A `poor` entry drops one tier in `sitegen/imagepick.py`'s
  ranking, so a strong image of the next kind down can beat it.
- `pin` is an optional boolean. `true` forces this entry to win the sharing
  card and the record-page lead, overriding tier and score -- the visible
  way to override a pick without reordering the JSON. At most one pinned
  entry per record and per `subject`.
- `subject` is optional: `record` (default, not usually written explicitly)
  or `retail:<tenant-slug>`. A retail image belongs to a tenant of this
  record rather than the record itself; the record's own sharing card and
  gallery ignore it, and a later retail thread's tenant rows use it
  instead. Same license rules, same validator.
- `aerial` is an optional boolean for a photo taken from the air (NAIP, a
  Port drone survey). It ranks as a photo for tier purposes but defaults
  `appeal` to 2, rather than the usual 3, when no `appeal` is written,
  since aerials rarely read at card size.
- Keys in `facts` are free text but stay lowercase snake_case so they can be
  compared across records (`developer`, `architect`, `units`, `gross_sqft`,
  `height_ft`, `affordable_units`, `ground_lease_term`, ...).

## Rules the validator can't enforce (you must)

- A fact copied from a press release is a press-release claim: say so in the
  source `publisher`. Prefer the primary document (Port Commission memo,
  Planning packet, D4D, EIR) when one exists.
- `open_questions` is for what you looked for and couldn't find. It is as
  valuable as the facts: it tells the next person where not to waste time
  and keeps the "nothing is fabricated" rule visible.
- Don't duplicate `data/milestones.csv` by hand. During the transition the
  site still reads that CSV; the data-layer thread will switch `sitegen/`
  to read record files and fold the CSV in. Until then, put new dated events
  in the record file only.

## Drafts

A record file may set a top-level `"draft": true`. A draft record, and every
record belonging to a site whose `data/sites.csv` row sets `draft: yes`, is
left out of the build entirely -- no page, no card, not in any API file --
unless the environment variable `PP_DRAFTS=1` is set, for a local preview.
Default is not a draft (the key can be omitted). See `sitegen/README.md` and
`docs/briefs/publish.md`, "Rendered site in the public repo". No record is a
draft today; this is the mechanism, not a change to any record's content.

## Relationship to the geometry files

Geometry files keep their own `digitized_from`, `accuracy_caveat`,
`regulatory_context`, `images` and `source_doc_urls`. Those stay where they
are (the caveat must travel with the shape). A record file is the place for
everything else about the parcel.
