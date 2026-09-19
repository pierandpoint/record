# Verifying the record

Every time the record is published, a GitHub Actions workflow in this
repository signs that publish and writes the signature to
[`attestations/`](../attestations/), with one line added to the
[`snapshots.csv`](../snapshots.csv) ledger. This page explains what those
signatures are, why they matter, and how to check one yourself. It assumes
no cryptography background.

## What's being proven

Two files carry the actual record data over the API:

- `api/v1/records.json` — the full set of dossiers
- `api/v1/llms.txt` — the same record in a form meant for language models

Each publish also writes `api/v1/snapshot.json`, which states the SHA-256
hash (a fingerprint) of those two files at that moment. The attest workflow
recomputes both hashes from the actual files and checks them against what
`snapshot.json` claims. If they don't match, the workflow fails loudly and
nothing gets signed — a mismatch would mean the published files and their
own manifest disagree, which should never happen silently.

If they do match, the workflow writes a small JSON file to `attestations/`
recording the date, the git commit, the git tree hash, both file hashes,
and the number of records, then signs that JSON file with
[cosign](https://github.com/sigstore/cosign) using **keyless signing** —
there is no private key anyone holds or could leak. Instead, cosign proves
the signature was produced by *this* GitHub Actions workflow, on *this*
repository, running on the `main` branch, at a specific, independently
recorded time. The proof is public in
[Rekor](https://docs.sigstore.dev/logging/overview/), Sigstore's public
transparency log, which is why no one — including whoever runs this
repository — can quietly rewrite history after the fact.

## Reading the ledger

`snapshots.csv` is the plain-text index of every attested publish, one row
per attestation:

```
date,commit,tree,records_sha256,llms_sha256,records,bundle
```

| column | meaning |
|---|---|
| `date` | UTC date the attestation was made |
| `commit` | full git commit SHA that was signed |
| `tree` | git tree hash of that commit (fingerprints the whole repo state) |
| `records_sha256` | SHA-256 of `api/v1/records.json` at that commit |
| `llms_sha256` | SHA-256 of `api/v1/llms.txt` at that commit |
| `records` | number of records in `api/v1/records.json` at that commit |
| `bundle` | path to the cosign signature bundle for that attestation |

You can open it in any spreadsheet program or text editor. It only ever
grows — rows are appended, never edited or removed.

## Verifying a signature yourself

You'll need [cosign](https://docs.sigstore.dev/system_config/installation/)
installed. Then, from a checkout of this repository, pick an attestation
(for example the most recent one) and run:

```sh
cosign verify-blob \
  --bundle attestations/2026-09-19-abc1234.sigstore.json \
  --certificate-identity-regexp '^https://github\.com/pierandpoint/record/\.github/workflows/attest\.yml@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  attestations/2026-09-19-abc1234.json
```

(Replace the filename with the attestation you're checking — it's named
`<date>-<short commit sha>`.)

**If cosign prints `Verified OK`**, it has confirmed, independently of this
repository's own claims, that:

- the `.json` file you have is byte-for-byte what was signed,
- the signature was produced by the `attest.yml` workflow in
  `pierandpoint/record`, running on the `main` branch (not a fork, not a
  pull request, not someone's laptop), and
- the signing certificate was freshly issued by GitHub's OIDC identity
  provider at the time of signing, so it could not have been forged or
  reused from an earlier run.

If verification fails, do not trust the file — something about it, or its
signature, does not match what was actually published.

### Reading the timestamp

The signature bundle (the `.sigstore.json` file) contains a Rekor
transparency-log entry with a field called `integratedTime`. That is a
Unix timestamp (seconds since 1970-01-01 UTC) recorded by Sigstore's public
log at the moment the signature was submitted — independent of anything
this repository or its maintainers say. You can extract and convert it
with:

```sh
jq -r '.rekorBundle.Payload.integratedTime' attestations/2026-09-19-abc1234.sigstore.json | xargs -I{} date -u -d @{}
```

(On macOS, replace `date -u -d @{}` with `date -u -r {}`.)

That timestamp is your evidence of *when* a given state of the record
existed — useful if you need to show that a fact was on the record before
some later event, or that the record changed after a particular date.

## Checking a downloaded `records.json` against an attestation

If you've downloaded `api/v1/records.json` some other way — say, from
pierandpoint.org directly — and want to know whether it matches an
attested publish, hash it yourself and compare:

```sh
sha256sum records.json
```

Compare the output to the `records_sha256` column in `snapshots.csv` for
the commit you're interested in (or to the `records_sha256` field inside
the matching `attestations/*.json` file). A match means that exact file
content was part of a signed, timestamped publish; it does not by itself
tell you whether it's the *current* record — check the `date` column for
that.

## Putting it together

To fully verify a claim from the record:

1. Find the commit and date you care about in `snapshots.csv`.
2. Verify the corresponding attestation with `cosign verify-blob` as above.
3. Confirm `records_sha256` in that attestation matches the file you're
   relying on.
4. If timing matters, read `integratedTime` from the bundle.

Every step above only needs files in this repository and a copy of
cosign — no account, no API key, and no trust required in anyone running
this project.
