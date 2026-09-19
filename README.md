# Pier & Point — the record

This is the public data behind [pierandpoint.org](https://pierandpoint.org):
a free, independent, cited status record of San Francisco's central
waterfront redevelopment — Mission Rock, Mission Bay, Pier 70, and Potrero
Power Station.

It tracks every parcel, park, and building across those sites: current
status, dated milestones, the sources behind each claim, plan figures, and
geometry. Everything here is meant to be read by people directly, or
pulled into other tools via the API.

## What's in this repository

| path | what it is |
|---|---|
| `data/records/*.json` | one dossier per tracked record (parcel, park, building) |
| `data/*.csv` | tabular views: status, approximate projects, milestones, changelog, sites, landmarks, map display |
| `data/manual/images/**` | hosted images referenced by records |
| `data/manual/*.geojson`, `data/processed/*.geojson` | geometry |
| `api/v1/` | the machine-readable API: `records.json`, `llms.txt`, a SQLite export, `snapshot.json`, and related files |
| `docs/record-schema.md` | the schema for the data above |
| `docs/verify.md` | how to verify a publish's signature |
| `attestations/` | one signed attestation per publish |
| `snapshots.csv` | the ledger of every attested publish |

Everything under `data/`, `api/v1/`, and `docs/record-schema.md` is
generated and replaced wholesale by the publishing process on every
update — see below.

## How it's updated

The record is produced by a private build pipeline and pushed into this
repository as a complete replacement of the data directories above. Each
publish commit is followed automatically by a signing step: a GitHub
Actions workflow in this repository ([`.github/workflows/attest.yml`](.github/workflows/attest.yml))
verifies the published files against their declared hashes, then signs
that state with [cosign](https://github.com/sigstore/cosign) using keyless
signing and public transparency logging, and records it in
[`attestations/`](attestations/) and [`snapshots.csv`](snapshots.csv).

That means every version of the record that's ever been published is
independently, verifiably timestamped and cannot be quietly rewritten.

## How to verify it

See [`docs/verify.md`](docs/verify.md) for the exact steps and commands —
written for a journalist or city staffer, not a cryptographer.

## How to correct it

If something in the record is wrong or missing, please
[open an issue](../../issues/new/choose) using one of the templates
provided. Corrections are tracked and, once applied by the next publish,
stay visible in `data/changelog.csv`.

Pull requests against the data directories are not the way to submit a
correction: those directories are overwritten wholesale on every publish,
so a pull request there would simply be lost. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

## Independence

Pier & Point is free, public and the same for everyone. It takes no money
from any developer, landowner or public agency whose sites it covers, and
sells nothing to them.

## License

The record data — the dossiers, tables, geometry, and machine-readable
outputs — is released under
[Creative Commons Attribution 4.0 International](LICENSE) (CC BY 4.0).
Hosted images each carry their own license and credit in their record
entry, and figures reproduced from public-record documents are reproduced
as public records. See [`LICENSE`](LICENSE) for the full terms and the
attribution to use.
