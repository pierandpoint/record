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
     "sources": ["src-hpc-2013"], "expected": false, "approximate": true},
    {"date": "2029", "status": "complete", "text": "Completion expected",
     "sources": ["src-da-2018"], "expected": true, "approximate": true,
     "basis": "phase", "basis_note": "Phase 3 in the 2018 Development Agreement's phasing schedule, Exhibit N; not a parcel-specific date"}
  ],
  "costs": [
    {"amount_usd": 15900000, "what": "Hard cost of the Building 101 rehabilitation",
     "date": "2019-01", "kind": "construction", "scope": "record", "approximate": true,
     "sources": ["src-port-hc-2019"]}
  ],
  "site_cost_refs": ["pier70-historic-core-rehab-2019"],
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
     "publisher": "SF Planning", "date": "2013-11", "url": "https://...", "accessed": "2026-09-18"},
    {"id": "src-d4d-2020", "title": "Design for Development, Feb 2020", "publisher": "SF Planning",
     "date": "2020-02", "url": "https://...", "accessed": "2026-09-18", "overview": true}
  ],
  "open_questions": ["Construction start for the seismic work is not dated in any source found."],
  "last_verified": "2026-09-18"
}
```

## Rules the validator enforces

- `record_id` matches the filename and exists in the manifest tables.
- Every `milestone`, `cost`, `fact` and the `summary` cites at least one
  source id, and every cited id exists in `sources`. No source, no claim.
- A source may set `overview: true` when it's a document worth calling out
  above the rest -- a master plan, an EIR or D4D's own site-plan/land-use
  figure, an agency deck showing the planned transformation of an area (the
  P12-P16 park decks, say) -- not a permit filing, a news article, or
  anything whose value here is a single cited fact rather than the whole
  document. It still stays in the numbered Sources list; `overview: true`
  only means it also renders in a short "Key documents" callout right after
  the summary, since a reader deciding whether to dig into a record often
  wants exactly this rather than a citation for one specific claim. Never
  mandatory -- most sources aren't one of these, and the callout doesn't
  render at all when none are flagged. Requires `url` (there has to be
  something to open); at most 3 per record, so it stays a highlight, not
  a second Sources list -- flag the ones that matter most, not everything
  that qualifies.
- Dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. `expected: true` for dates
  that haven't happened; `approximate: true` when only a year or range is
  sourced.
- `status` on a milestone, if set, is one of `complete`,
  `under_construction`, `planned`, `existing`, `being_removed`.
- `basis` is required on a milestone with `expected: true` and `status:
  complete` (a future completion): one of `record` (a date for this parcel
  from a source -- a permit, a developer or agency announcement, a
  commission report), `phase` (the parcel's phase in the Development
  Agreement, D4D or infrastructure plan phasing, and that phase's scheduled
  window -- not a parcel-specific date), or `project` (only the
  whole-project buildout target is known, softer still). Prefer `record`
  over `phase` over `project`: use the weakest basis the documents actually
  support, never a stronger label than the source justifies. A future
  completion with no `basis` fails validation.
- `basis_note` is required alongside `basis: phase` or `basis: project`: one
  sentence naming the phase or the buildout target and its document, e.g.
  "Phase 3 in the 2018 Development Agreement's phasing schedule, Exhibit N;
  not a parcel-specific date". Optional (usually omitted) for `basis:
  record`, since the milestone's own `sources` already name the document.
- A paused project doesn't get its expected completion deleted or
  silently re-dated: add a separate, sourced milestone (`status:
  under_construction` or `planned`) whose text says construction is paused
  and by whose statement, and keep the existing expected-completion
  milestone's `basis: project` with a `basis_note` explaining why the date
  is soft (e.g. "buildout target predates the 2026 pause announcement; no
  revised date sourced yet").
- Every cost entry requires `kind` and `scope`, in addition to the existing
  `amount_usd`, `what`, `date`/`approximate` and `sources`:
  - `kind` is one of `development` (a building's or parcel's stated total
    development cost), `construction` (hard cost only, when the source
    distinguishes it), `infrastructure` (streets, utilities, parks,
    shoreline -- horizontal work), `public_investment` (CFD bonds, IFD or
    tax-increment allocations, Port capital advances, grants),
    `financing` (construction loans, refinancing -- recorded, but every
    aggregation skips a `financing` entry, so it is never summed with
    anything else), `land_or_lease` (appraisals, prepaid lease values, land
    payments), `fee_or_subsidy` (impact fees, jobs-housing fees,
    affordable-housing subsidies), or `other` (requires a one-sentence
    `kind_note` saying what it is -- an unlabelled "other" is a guess).
  - `scope` on a record file's own `costs` array is always `record` (the
    parcel or building this record is): a `phase`- or `site`-scope figure
    is never written into a record file's `costs` array -- it belongs in
    `data/site_costs.csv` instead (see below), and the validator rejects
    one that shows up here.
  - `stated_on` is optional: only needed when the existing `date` field is
    already carrying a different meaning for this entry (for example, a
    spend total stated "as of" a period end) and the entry also needs to
    record the date the source itself was published or stated. Most
    entries don't need it; `date` alone is the date the source states.
  - `site_cost_refs` is an optional top-level array of `data/site_costs.csv`
    row ids: a pointer from this record to a phase- or site-scope figure,
    written only when the source itself ties that figure to this specific
    record (e.g. a Port memo naming this parcel among the several sharing a
    phase budget). It never carries its own `amount_usd` -- the amount lives
    once in `data/site_costs.csv` -- so the same figure is never
    double-counted by being copied onto every record it's a pointer from.
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
- The `basis`/`basis_note`/`approximate` rules above apply the same way to
  a row in `data/milestones.csv` for a record with no dossier file yet: the
  CSV gained `basis` and `basis_note` columns for exactly this (blank for
  every milestone that isn't a future completion). `src/validate_records.py`
  only checks the JSON files -- a CSV row's `basis` is not machine-checked,
  so get it right by hand.

## Drafts

A record file may set a top-level `"draft": true`. A draft record, and every
record belonging to a site whose `data/sites.csv` row sets `draft: yes`, is
left out of the build entirely -- no page, no card, not in any API file --
unless the environment variable `PP_DRAFTS=1` is set, for a local preview.
Default is not a draft (the key can be omitted). See `sitegen/README.md` and
`docs/briefs/publish.md`, "Rendered site in the public repo". No record is a
draft today; this is the mechanism, not a change to any record's content.

## Adjacent records: proposals outside a site

Most records sit inside the boundary of one of the four tracked sites. A record can
instead be `adjacent`: real, contested or proposed development next to a tracked site
but outside every tracked boundary -- the model is a proposal one block from Pier 70 or
Potrero Power Station that Pier & Point records without taking a side on
(`docs/briefs/adjacent-proposals.md`, "The stance, which is the whole point").

```json
{
  "record_id": "potrero_23rd_st_data_center",
  "relation": "adjacent",
  "adjacent_to": "potrero",
  "distance_note": "One block south of the Potrero Power Station boundary, across 23rd St.",
  "how_to_comment": [
    {"channel": "SF Planning project page", "detail": "Case No. 2026-XXXXXX",
     "url": "https://sfplanning.org/..."},
    {"channel": "Hearing notice", "detail": "Planning Commission calendar",
     "url": "https://sfplanning.org/calendar"}
  ],
  "positions": [
    {"who": "Supervisor X", "statement": "Quoted or paraphrased position, one sentence.",
     "sources": ["src-example"], "date": "2026-09-10"}
  ]
}
```

- `relation` is optional: `tracked` (the default, and the only value every existing
  record has) or `adjacent`. Omit it for a normal tracked record; don't write
  `"relation": "tracked"` explicitly.
- `adjacent_to` is required when `relation` is `adjacent`: the `slug` of a real row in
  `data/sites.csv` -- the site this record sits next to, not inside. The validator
  checks the slug exists. The record's own `site` grouping in `status.csv` or
  `approximate_projects.csv` (the column that decides which site page it renders on)
  must map to this same slug, so an adjacent record's "Nearby" section and its
  `adjacent_to` always agree.
- `distance_note` is required when `relation` is `adjacent`: one sourced phrase
  locating it relative to the site's boundary, e.g. "One block south of the Potrero
  Power Station boundary, across 23rd St." Not a citation object -- a short, plain
  sentence a reader sees directly under the record's name.
- `how_to_comment` is optional, meaningful on an `adjacent` record: a list of
  `{"channel": ..., "detail": ..., "url": ...}` objects, official channels only (the
  Planning Department's own project page, a hearing notice, the Board of Supervisors'
  Clerk). `channel` is required; at least one of `detail` or `url` is required. Never a
  petition, campaign or fundraising link, for or against (`docs/briefs/
  adjacent-proposals.md`, "Don't") -- the validator rejects a URL on a known
  petition/crowdfunding domain as a defensive check, but the rule itself is enforced by
  not writing one in the first place.
- `positions` is optional, meaningful on an `adjacent` record: a list of
  `{"who": ..., "statement": ..., "sources": [...], "date": ...}` objects, one entry
  per person or named group who has taken a public position, each cited like any other
  claim (`sources` must be known source ids). `who` and `statement` are required; a
  `statement` is quoted or closely paraphrased, never characterised ("says the project
  would...", never "worries that..."). Language throughout an adjacent record's
  `summary`, `notes` and `positions` is descriptive, not editorial: Pier & Point
  records who said what and does not itself take a position.
- Geometry for an `adjacent` record follows the same two paths as any other record: a
  real Assessor parcel joined through `status.csv` where one exists, or an approximate
  feature in `data/manual/*.geojson` per the usual rules, with its own
  `accuracy_caveat` and `digitized_from`.
- Rendering (`docs/briefs/adjacent-proposals.md`, "Rendering"): an adjacent record
  appears on its site's page in a "Nearby" section under the tracked records, and on
  the home map and the site map as a dashed outline with a legend entry of its own. It
  is left out of the progress tracker, "N of M complete" counts and the sharing-card
  counts; it is included in the API, the changelog and the digest, each stating its
  relation. Its own record page shows "Nearby proposal, outside `<site>`" under its
  name, its milestones as its entitlement path, a "How to comment" block from
  `how_to_comment`, and a "Positions on record" list from `positions`.
- Changelog rows that add an adjacent record use `category: coverage`
  (`data/changelog.csv`), the same category used for any new piece of coverage.

## Relationship to the geometry files

Geometry files keep their own `digitized_from`, `accuracy_caveat`,
`regulatory_context`, `images` and `source_doc_urls`. Those stay where they
are (the caveat must travel with the shape). A record file is the place for
everything else about the parcel.

## `data/changelog.csv`

One row per addition or correction made to the record (a real-world event
belongs in a milestone instead). Columns: `date`, `kind` (`added`,
`correction` or `status`), `category` (`status`, `milestone`,
`construction`, `retail`, `open_space`, `correction`, `coverage` or
`coming_up`), `record_id` (optional, links the row to a record page),
`summary`, `text`, `source` and `event_date`.

`summary` is one complete, plain-language sentence, at most 140 characters,
derived strictly from the row's own `text` -- no new facts, no new claims,
and no more certainty than `text` itself supports. It must not start with a
record id or field name followed by a colon, must not join clauses with
" -- ", and must end with terminal punctuation (`.`, `!`, `?`, or a closing
quote/parenthesis after one) -- the tell of a mechanically-built summary
(the record id, the field, `" -- "`, then the source text sliced at a fixed
length, cutting mid-word) rather than a written sentence.
`src/validate_records.py`'s `changelog_summary_problem()` enforces all of
this on every row, and `src/watch/apply.py` runs the same check before a
weekly-watch proposal is ever written, dropping one that fails it. The
changes pages (`/changes/`) show the date, a category chip, a site chip
(derived from `record_id`, or "all sites" when blank), the record link and
the summary; the full `text` sits behind a details disclosure.

`event_date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`) is the date of the
real-world event `text` describes, as distinct from `date` (the day the row
was added to this file, per this file's own convention -- unchanged). The
two differ whenever a change is recorded well after the event it reports (a
permit filed years ago, a court ruling from 2016 added to the file this
week): the changes feed sorts and displays by `event_date` when it's set,
falling back to `date` otherwise, and the source line reads "added
`<date>`" whenever the two differ by more than 7 days -- or always, on a
real-world row with no `event_date` at all, since there the displayed date
is *only* the added date and the note is the one honest signal of that --
so a bulk-added event never reads as having just happened. `src/watch/extract.py` requires
it in every weekly-watch proposal's schema, and a milestone the pipeline
writes (in a record file or `data/milestones.csv`) always uses the event
date as its own date, never the date it was added.

The owner's category rule (docs/briefs/dates-and-closed.md): a real-world
category (`status`, `milestone`, `construction`, `retail`, `open_space`,
`coming_up`) should always carry a real `event_date` -- `src/
validate_records.py` warns, without failing CI, on one that doesn't, since
CLAUDE.md's "a blank is better than a guess" outranks a hard block here:
some rows genuinely have no discoverable event date anywhere (the row's own
text, a linked milestone, its cited source, or -- for a retail row --
`data/retail_confirmed.csv`), and a blank one should carry a matching entry
in its record's own `open_questions` explaining what was checked. A
record-maintenance category (`correction`, `coverage` -- the event is our
own edit, not something that happened out there) sets `event_date` equal to
`date`, or leaves it blank; anything else on one of those two categories is
a hard validator problem, since there's no legitimate reason for it to
differ. A blank real-world `event_date` still needs *some* date to sort and
display by, so it falls back to `date` like every other blank one above --
but `sitegen/pages.py`'s `lead_entry()` treats that fallback as "not
actually a dated event" and skips it, so an unknown-timing row can never
wrongly outrank a genuinely dated one for the one row (Changes and Costs on
a record or site page) that stays visible while its box is collapsed.

## `data/retail_confirmed.csv`

Confirmed ground-floor tenants: one row per tenant per record. Human-confirmed
only -- `src/join_retail.py`'s DataSF business-registration join
(`data/processed/retail_points.geojson`, `out/retail_needs_review.csv`) is a
candidate feed a person triages against leasing pages, developer tenant
lists, press coverage and the tenant's own site before it becomes a row here;
the raw registrations are never rendered on the public site (they include
home-based sole-proprietor registrations and stale entries). `src/
retail_candidates.py` lists registrations at tracked parcels that aren't in
this table yet, for the monthly review (`docs/operations.md`).

Columns:

- `record_id`: a known id from `status.csv` or `approximate_projects.csv` --
  the parcel the tenant's storefront actually sits on, not just the site.
- `slug`: the tenant's name, lowercased and hyphenated, unique across the
  whole table (not just per record). `sitegen/imagepick.py`'s `subject:
  retail:<slug>` picks a tenant's own storefront photo from a record's
  `images` by this same slug (`docs/record-schema.md`'s `subject` field,
  above) -- keep a tenant's slug here and any photo tagged for it in sync by
  hand if either ever changes.
- `name`: the tenant's own name, as the source gives it.
- `category`: one of `food and drink`, `grocery`, `fitness`, `health`,
  `retail goods`, `services`, `arts and culture`, `office lobby or other`.
  Fixed list; no other value.
- `status`: `open`, `announced` (a source names it coming, with no confirmed
  opening yet) or `closed`.
- `opened` / `closed`: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, or blank when no
  source gives a firm date -- a blank is better than a guessed date, and an
  `announced` tenant with no opening date yet is exactly the case this
  covers.
- `source`: a URL. Required on every row -- no source, no tenant, the same
  rule as everywhere else in this repo.
- `unit_or_address`: free text, as specific as the source gives it (a suite
  number, a building name).

`src/validate_records.py` checks: every `record_id` is known, every `slug` is
unique, `opened`/`closed` parse under the same date rule as everywhere else,
`source` is non-blank, `status` and `category` are each in their fixed list.

Rendering: the site page's "What's open, what's coming" section
(`sitegen/build.py`), the site map's "show tenants" toggle (an outline and a
count per parcel with tenants, never a pin -- `sitegen/pages.py`'s
`site_map()`), the record page's own tenant list, each site card's "N open ·
M coming" count line on the home page, and the `/retail/` directory
(`sitegen/build.py`, linked from each site page's tenant section and the
footer's first nav row, never the main navigation -- retail is a facet of a
record, not a separate product). A row that is an opening, announcement or
closure with a date gets a matching `data/changelog.csv` row, `category:
retail`.

A `closed` tenant never counts toward a Retail box's header count, a
category chip's count or the bar's "of N" (`sitegen/build.py`'s
`current_tenant_count()`/`retail_chips()`, `docs/briefs/dates-and-closed.md`)
-- those are always open-plus-announced ("current") figures, on a record or
site page and on `/retail/` alike. A category whose only tenants are closed
gets no chip at all. Closed tenants stay visible only in the list's own
collapsed "Closed (n)" group at the end, whose own count follows whichever
chip is active (the full closed count when none is) and hides entirely once
the active filter leaves no closures -- both handled client-side by the
same generic `.box` chip logic every other box uses (`sitegen/static/
app.js`), keyed off a tenant `<li>`'s own `data-status` attribute, which no
other box's items carry. The home page's site-card "N open · M coming" line
(`sitegen/build.py`'s `tenant_status_counts()`) already excluded `closed`
before this rule existed.

## `data/site_costs.csv`

A `phase`- or `site`-scope cost figure, stored once instead of copied onto
every record it touches. A figure that genuinely belongs to a single parcel
or building stays in that record's own `costs` array (`scope: record`);
this table is only for a figure the source itself states at the level of a
named phase (Mission Rock Phase 1, Pier 70's Historic Core) or a whole site.

Columns:

- `id`: a stable, unique, lowercase-hyphenated id (e.g.
  `mission-rock-phase1-horizontal-2023`). A record's `site_cost_refs`
  points at this id, so changing it breaks that pointer -- treat it as a
  key, not a label.
- `site`: a known `data/sites.csv` slug.
- `phase`: free text naming the phase (e.g. "Mission Rock Phase 1", "Pier
  70 Historic Core"), or blank for a whole-site figure.
- `kind`: the same fixed list as a record cost entry's `kind`, above
  (`development`, `construction`, `infrastructure`, `public_investment`,
  `financing`, `land_or_lease`, `fee_or_subsidy`, `other` with `kind_note`).
- `amount_usd`: a number, nominal as stated -- no inflation adjustment.
- `date`: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, the date the source states.
- `what`: one sentence describing the figure, as specific as the source is
  (which resolution or memo, what it covers).
- `approximate`: `yes` or `no`.
- `source_url`: required. No source, no figure, same rule as everywhere
  else in this repo.
- `source_note`: optional, free text -- a page number, a caveat about how
  the source itself qualifies the figure.

`src/validate_records.py` checks: `id` is unique and lowercase-hyphenated,
`site` is a known slug, `kind` is in the fixed list (`kind_note` required
for `other`), `amount_usd` is a number, `date` parses, `what` and
`source_url` are non-blank, `approximate` is `yes`/`no`, and every
`site_cost_refs` entry on a record file resolves to a row here. Rendering:
none yet -- this table isn't read by `sitegen/` today (`docs/briefs/
costs.md`); it exists so a phase- or site-scope figure has exactly one
home instead of an unreliable number of copies.

## `data/site_documents.csv`

A site's "Key documents": the handful of primary planning documents that
explain the site as a whole -- a Design for Development, an EIR, the
developer or agency's own project page -- shown on that site's own page,
above the map (`docs/briefs/page-sections.md`). Short and hand-curated, not
a data feed: unlike Changes or Retail below, this table is never expected to
grow past a handful of rows per site, so it renders without a peek or a
collapse threshold.

Columns:

- `site_slug`: a known `data/sites.csv` slug.
- `title`: the document's own name, not a description of it.
- `url`: required. A real, checkable link -- this table is not the place to
  restate a citation that already exists elsewhere as plain text
  (`data/sites.csv`'s own `now_source`/`boundary_source` columns) without a
  link behind it; a site with nothing linkable yet gets no row rather than
  one repeating a citation string as if it were a document.
- `date`: optional, `YYYY`, `YYYY-MM` or `YYYY-MM-DD`.

`src/validate_records.py` checks: every `site_slug` is known, `title` and
`url` are both non-blank, `date` parses under the same date rule as
everywhere else. Rendering: `sitegen/pages.py`'s `key_documents_section()`,
which returns nothing for a site with no rows -- a blank is better than a
guess, the same rule the rest of this repo follows for missing data.

## `data/glossary.csv`

Every acronym and term of art the site's text uses, expanded the first time
each one appears on a page (`docs/briefs/glossary.md`).

Columns:

- `term`: the acronym exactly as it appears in the rendered text -- case-
  sensitive, so it only matches that same casing (`sitegen/glossary.py`
  matches on a word boundary, so `SUD` never matches inside `sudden`).
- `expansion`: what the term stands for. Required for a real entry; cited
  to the defining agency or document when its meaning wasn't obvious from
  the text that uses it, never invented.
- `plain`: one sentence in plain words for a neighbor, e.g. "The design
  rulebook a developer and the City agree on for a site: heights, uses,
  streets, parks." Required for a real entry.
- `source`: a URL to the defining agency's or program's own page, where a
  reliably correct one exists. Blank rather than a guessed link when it
  doesn't (the same "a blank is better than a guess" rule as everywhere
  else in this repo).
- `allowlist`: `yes` for a token that looks like an acronym but isn't a
  term worth explaining -- a parcel or block code (`P11`, `HDY3`), a
  firm or developer's own initials (`TMG`, `WRNS`), a quarter or fiscal
  year (`Q3`, `FY2025`), or a short form common enough that spelling it
  out would be noise (`PDF`). An allow-listed row leaves `expansion`,
  `plain` and `source` blank and is never wrapped on the page; it exists
  only so `src/check_glossary.py` doesn't flag the token as unexplained.

Rendering: `sitegen/glossary.py`'s `apply_first_use()`, called once from
`sitegen/build.py`'s `page()`, wraps the first occurrence of each real
(non-allow-listed) term *within each region* of a page's rendered body in
`<abbr title="expansion">`, linked to that term's entry on `/glossary/`
(`sitegen/pages.py`'s `glossary_page()`) -- a region is each `<section>`,
`<aside>` or `<details>` (Where it is, Money, Open questions, At a glance,
a Changes/Sources/Retail box, "About this shape", "Research notes", ...),
the same elements the page is already laid out with, plus one implicit
top-level region for everything outside all three (the page-head). Not
once per whole page: a reader can jump straight into any one region via
the page's own jump-nav or a deep link, or open a collapsed box without
ever passing an earlier mention elsewhere, so each region gets its own
first-use link rather than risking one a reader never sees. A term
repeated many times within one region (a Changes box citing the same
agreement across a dozen milestones, say) still gets wrapped only once
there. Never inside a link, `<code>`, `<script>`, `<style>`, `<title>` or
an inline `<svg>` (map chrome, not prose), and never in a page's `<title>`,
meta tags, alt text, the sharing-card text or the API output, since none
of those go through a page's rendered body. `src/check_glossary.py` (run
in CI after the site builds) fails if any built page still carries an
uppercase token of three to six letters that's neither a real term here
nor allow-listed.
