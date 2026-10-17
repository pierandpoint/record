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

## `planned_change` (optional)

For a record whose status is `existing` and whose own source names a change
planned for it:

```json
"planned_change": {"text": "Adaptive reuse of Station A as part of the Power Station project",
                   "sources": ["src-example"]}
```

`text` is one short, reader-facing phrase (at most 160 characters) saying what
is planned, not a date or a status; `sources` are source ids from the record's
own `sources`, and the validator requires at least one. Where it is set, the
status label reads "Existing · change planned" (record page, record lists and
the API's `status_label`), and the record page's "At a glance" box adds a
"Planned change" row with the phrase and its citation. It is ignored for any
other status. Set it only where a source read names the change; a proposal a
source calls only a possibility does not qualify. `status` itself stays
`existing`, so maps, counts and colours are unchanged.

## `details` (optional)

Sourced facts that are not gaps or disputes: a full list the "At a glance" value only summarises, the
wording a source used, a figure with its context. Each item is `{"text": "...", "sources": ["src-id"]}`;
`sources` is required (at least one id from the record's own `sources`) and the text is written for
readers. The record page shows them as a collapsed "More detail" list right under "At a glance", each
with its citation. Do not put them in `open_questions`: that list renders under "Looked for, not found"
and is only for what we searched for and could not source, and for sources that disagree (name every
source).

```json
"details": [{"text": "Features of Crane Cove Park, in full: a pocket beach with Bay access, restored Slipway 4 ...",
             "sources": ["src-port-park"]}]
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
  sourced. One exception: a **scheduled meeting or Clerk-listed hearing date
  that has passed with no outcome found** keeps `expected: true` and its
  `event` slug (so the event stays on "Decisions ahead" as "No outcome found
  yet" instead of vanishing); the day it was scheduled is not an event that
  happened. Add the outcome as a second milestone with the same `event` and
  `expected: false` once a source written after the date gives it.
- `date_kind` on a milestone, optional: `observed` (the date a document,
  map or listing showed the state, not the date the state began: a land-use
  map, a property-management-plan listing, an annual report, a resolution's
  recital, a staff presentation) or `published` (a report's or article's
  publish date standing in for an event date no source gives). Leave it off
  when the date is the event's own (an approval, vote, permit issue,
  completion, construction start or opening). A record page's "since" date
  reads the earliest milestone of the current status run; if that milestone
  has a `date_kind`, no since-date is shown (the record's timeline still
  lists the milestone with its date). `src/validate_records.py` checks the
  value; in `data/milestones.csv` it is an optional column (before `stage` and `event`).
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
  completion with no `basis` fails validation. A fourth value, `legal_deadline`,
  is not a forecast at all (below).
- `legal_deadline` is for a contractual or statutory outer date: a DDA or DA
  outside date, a development-agreement term, a lease end. Tag a milestone this
  way **only** when its own cited source explicitly calls the date an outside
  date, a deadline, a term or a lease end, and put the source's own phrase in
  quotation marks in `basis_note` (required; the validator checks for the
  quotes and for `expected: true`). Anything the source doesn't call that, or a
  proposed deadline in a not-yet-adopted amendment, is not tagged. A legal
  deadline **never drives a status**: the build clears its `status` (sitegen/
  load.py), so the map, the timeline, the home status-by-year chart, the API and
  the feeds read it as a plain dated milestone, and it never counts toward the
  timeline range check (below). It shows as a labelled deadline ("Legal deadline
  (not a schedule): 2042") in the milestone list and in What's next, never as an
  expected completion; the existing `status` in the file is left alone. Retagging
  a milestone gets a `correction` row in `data/changelog.csv`.
- `stage` is optional, on a milestone of a record that is Planned: one of `proposed`, `approved`,
  `start_announced` (below). It says where the project stands, and only the milestone's **own cited source** may say
  it; it is never inferred from wording elsewhere, from a later or earlier milestone, or from the absence of news.
  - `proposed`: a source describes the project as proposed or under review, and no source read records an approval.
  - `approved`: a source records a vote or sign-off that approves it (a commission, a board, a planning director,
    a regents' approval), whether or not funding or a start date exists.
  - `start_announced`: a source states when construction is expected to start. An expected date, not a confirmed
    start (the milestone **must** be `expected: true`; the validator requires it). If the source makes the start
    conditional, put its condition in `stage_condition` (short, in the source's words: `pending financing`), and the
    stage text carries it ("Start announced for ~2027, pending financing"). It expires: once the announced date has
    passed (a year-only date: that year's end) with no construction-start milestone, the record falls back to its
    next furthest stage and `src/check_events.py` lists it (sitegen/events.py, `start_expired()`).
  A record's stage is the furthest one any of its milestones carries (`proposed` < `approved` < `start_announced`);
  equal stages take the later date. It shows after "Planned" on the record page's status line with that
  milestone's own date ("Planned · Approved May 2026") and on the record list's detail line in brackets
  ("Planned (approved May 2026) · Surveyed outline"), and only while the record is Planned. A Planned record whose
  milestones carry no stage shows plain "Planned": that is expected and correct. A stage is never set project-wide:
  a source that approves a whole project does not, by that, name each parcel in it. A dossier may carry
  `stage_note` (top level, a plain sentence for readers, e.g. "No source we have read names this parcel in an
  approval.") that shows under the status line of a Planned record with no stage; write it only where it is true
  of that record's sources. There is no map colour for a stage.
  A milestone that is later contradicted (an approval withdrawn) loses its `stage` in the same change and gets a
  `correction` row.
- `event` is optional, on any milestone about one hearing, vote or legal deadline: a slug of lower-case words,
  digits and single hyphens, at least one hyphen, up to 60 characters, naming the place or process and the year
  (`p70-dda-amendment-2026`). Milestones on different records that share a slug are one event: Coming up's
  "Decisions ahead" and a site page's "Next up" show one row for it, listing every record. Within an event the
  milestone still ahead is `expected: true` (its date is what a source expects, or a legal deadline when
  `basis: legal_deadline`); a milestone with the same slug and `expected: false` is the **outcome**. Never give the
  slug to an earlier, different hearing on the same subject, or it would count as the outcome of this one. A
  milestone with no `event` is never listed as a decision, even if its text mentions a Commission.
  **One event is one body's step.** A source that sends one item to two bodies (the Port Commission, then the Board
  of Supervisors) gets one slug per body, so an outcome at one never closes the other. Rows on the same date sort by
  slug, so number the steps in their real order (`p70-dda-amendment-1-port-2026`, `p70-dda-amendment-2-bos-2026`).
- `window_end` is optional on an `expected: true` milestone whose source gives a window instead of a date ("by the
  end of this year or early next year"): the end of the latest period the source's words allow (a date, not
  before the milestone's `date`). The milestone's `date` is the window's early end; the row stays "ahead" until
  `window_end`'s period ends, so it never reads "date passed" inside the window (this is page mechanics: say it here and in
  the PR, never in a milestone's public text); it shows "Dec 2026 to 2027", or "late 2026 or early 2027" when the text names
  those two seasons, and its full wording. Where the source gives no end, use the end of the year its wording points to, and say so in the text.
- On "Decisions ahead" an event's date reads as what it is. A full-day date that is not a legal deadline is shown as
  **Scheduled** (an agenda or Clerk listing, a Board hearing, a Commission item; once past, "Scheduled for Oct 6, 2026 ·
  No outcome found yet"); a `basis: legal_deadline` is a **Legal deadline**; anything else (a month, a year, a window)
  is **Expected, not confirmed**. A date set by an agreement or an extension (the end of an agreed delay, say) is none of
  these and has no tag of its own: it stays an ordinary expected milestone with no `event`, so it is not listed as a
  decision. A row's source line names the source (publisher or title) without a date, so the same event reads the same
  whichever record's copy of the source is picked.
- Once an event's date has passed (a year-only date at the end of that year, a month-only date at the end of that
  month) with no outcome milestone, it leaves the "ahead" list and reads "No outcome found yet" (never "missed").
  `src/check_events.py` lists these (warn-only in `src/check_all.py`) so the outcome, or a new date, can be added.
  The CSV (`data/milestones.csv`) has `stage` and `event` columns that follow the same rules.
- What's next (record pages, /near/ rows, site pages' "Next up"): the earliest
  `expected` milestone whose date has not passed, with its date, `basis` in plain
  words (`record` "this building", `phase` "this phase", `project` "whole
  project"), "Expected, not confirmed" and its citation. A year-only date counts as
  the end of that year and a month-only date as the end of that month. Real
  expectations win over legal deadlines; a record whose only future milestone is a
  legal deadline shows it labelled as one; none at all reads "No dated next step
  found" (sitegen/nextstep.py).
- Timeline range check: the build counts distinct records with an expected
  `under_construction` or `complete` milestone dated after `WINDOW_END`
  (sitegen/pages.py) whose basis is not `legal_deadline`. Three or more fail the
  build, one or two print a warning and label the bar's end ("2038+ · 1 record
  expected later (2041)").
- `basis_note` is required alongside `basis: phase`, `basis: project` or `basis: legal_deadline`: one
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
    affordable-housing subsidies), `permit_valuation` (docs/briefs/
    watch-rules.md: a DBI building permit's own self-reported valuation,
    kept as a cost only when the permit itself is kept as a milestone --
    excluded from every aggregation exactly like `financing`, since a
    permit's valuation is stated for the permit fee, not vetted as a real
    development-cost figure), or `other` (requires a one-sentence
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

  <a id="our-own-photographs"></a>**Our own photographs.** Photos taken by
  Pier & Point's founder, Pierre Rohel, are published under the Creative
  Commons Attribution 4.0 International license (CC BY 4.0,
  https://creativecommons.org/licenses/by/4.0/), the same license as the
  record data. Reuse them freely, commercially or not, with the credit
  "Pierre Rohel / Pier & Point" and a link to the license. Their entries
  carry `license: cc-by`, that exact `credit`, `source_url` pointing at the
  hosted file in the public record repository, `license_evidence` pointing at
  this paragraph, and a `license_note` giving the date the photo was taken.
  (`owner` stays in the validator's list only so older data still reads; no
  entry uses it, and a new one shouldn't: it names no license.) The hosted
  copy is a smaller, upright derivative with every licence plate and
  recognisable face blurred and all camera metadata removed except the
  credit and the license. The full-resolution original is kept, unpublished,
  for provenance.
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
- `permits` is an optional top-level array (docs/briefs/watch-rules.md):
  a minor building permit that documents real activity on the record but
  isn't itself a milestone -- an OTC alteration, a tenant-improvement
  revision, a deferred submittal, a grading/shoring permit, an MEP or
  fire-system permit, signage, or any other permit outside the record's own
  construction window (the span from its first under_construction/
  site-permit/new-construction-permit date to its first complete date; see
  the brief for the exact rule). A permit that's either status-eligible
  (new construction, a primary-structure demolition, a site permit, a
  first TCO/CFC, or an agency stage change -- these can carry a milestone
  `status` at any time) or that falls inside the window (real construction
  progress, even from a minor permit -- stays a milestone, just never with
  a `status` tag) belongs in `milestones` instead, not here.

  ```json
  {"permit_number": "201908078130", "permit_type": "otc alterations permit",
   "description": "Deferred submittal to PA 2018-0601-0826 for aluminum composite panels",
   "filed_date": "2019-08-14", "issued_date": "2019-08-14", "completed_date": "2019-08-14",
   "valuation": 16000, "sources": ["src-watch-dbi-building-permits-25"]}
  ```

  `permit_number`, `permit_type` and `description` are required.
  `filed_date`/`issued_date`/`completed_date` are each optional and follow
  the usual date rule; `valuation` is an optional number (the permit's own
  stated cost -- writes no entry in `costs`, unlike a status- or
  progress-milestone permit's valuation, which becomes a `permit_valuation`
  cost). `sources` is required, same "no source, no claim" rule as
  everywhere else.

  Rendered as a "Building permits" subsection inside a record page's
  Research notes (`sitegen/build.py`, box-pattern's `collapsible_box()`),
  newest first, at most 10 shown by default with the rest behind the same
  bar Costs uses (docs/briefs/watch-rules.md, "Destination"). Never
  rendered in the Changes feed or as its lead row -- a `permits` entry is
  not a milestone.

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
     "url": "https://sfplanning.org/hearings-events"}
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
  relation. Its own record page shows "Nearby project, outside `<site>`" under its
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
`summary`, `text`, `source`, `event_date` and `public_text`.

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
(derived from `record_id`, or "all sites" when blank), the record link, the
public text and the source.

`text` is the internal log: the full account of the change as it was made,
including how it was found and which tools were involved. It stays in this
file, is never rendered on the site, and is dropped from the copy
`src/publish.py` writes to the public repository. `public_text` is what a
reader sees: the same facts and the same doubts, at the same strength, in
plain prose, with no process narration (no pass or batch names, script,
file or field names, briefs, or who noticed what). Every public surface (the
changes pages, a record's or site's Changes box, `api/v1/changes.json`, the
RSS feeds, the SQLite export and the digest) shows `public_text` when it is
set and `summary` otherwise, so `public_text` is left empty only when the
`summary` already says everything a reader needs.

`source` is the citation printed under the entry, and it must be one a
reader can open: a public document, dataset or URL (`Publisher, date
(URL)`, several joined by `; `). It is never a path into this repository
(`docs/...`, `data/...`, `src/...`, `sitegen/...`) or a `.md`/`.py` file. A
row that records Pier & Point's own decision (coverage, schema, scope)
takes exactly `Pier & Point editorial decision` instead, and a correction
that removed a claim no document supports takes `Pier & Point editorial
review` (or cites the source that failed to support it, followed by "(does
not state this)"). Either label stands alone in the field; the site renders
it in its own style, never as a citation or a link.
`src/validate_records.py`'s `changelog_source_problem()` enforces both.

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

## `data/changelog_batches.csv` and `data/changelog_batch_rows.csv`

Audit batches (`docs/briefs/changelog-batches.md`, `sitegen/batches.py`). A batch is a run of wording or coverage
rows of `data/changelog.csv` that the Changes pages and the corrections feed show as one summary row linking to
`/changes/batches/<batch_id>/`, where every row is listed in full. `changelog.csv` itself is never edited.
`changelog_batches.csv` columns: `batch_id`, `date`, `category` (`correction` or `coverage` only), `kind`, `source`
(optional exact match), `pattern` (a regex over each member's `summary`), `rule` (public, says why the rows are
wording-only), `summary` (public; `{n}` becomes the member count). `changelog_batch_rows.csv` columns: `batch_id`,
`row_key` (a hash of the row's own fields, `batches.row_key()`). A row that changes a status, date, name, number,
location or opening is never listed. `src/check_changelog_batches.py` fails when a listed row is missing, sits in
two batches, or does not satisfy its batch's date, category, kind, source and pattern.

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
