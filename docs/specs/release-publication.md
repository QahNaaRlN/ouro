# First beta asset publication

Status: bounded operational follow-up to the accepted first-release specification.

The managed workspace can create a draft GitHub Release, but its upload-host authentication returns HTTP 401. Publish assets with GitHub Actions' repository-scoped `GITHUB_TOKEN`, without adding a personal access token or changing the accepted application commit.

## Contract

- Run only on `chore/release-publication` in `QahNaaRlN/ouro`; never run pull-request code with a write token.
- Use pinned checkout/setup-node actions, a bounded timeout, and no persisted checkout credentials.
- Build from the exact accepted commit `e20472ca6ef9da1d547c8468b348b62b01d3e2a6`, not the publication branch's application tree.
- Verify the annotated `v0.1.0-beta.1` tag resolves to that commit before uploading anything.
- Build the independent protocol and create the four release assets with the existing audited packaging command. The source manifest must identify the accepted commit and versions.
- Upload only to the existing `v0.1.0-beta.1` prerelease draft, without replacing existing assets. Keep the draft unpublished.
- Expose the ephemeral token only to GitHub API/upload steps; never print or store it.
- After the workflow succeeds, verify all uploaded bytes against their manifest and checksums before publishing the draft. Then verify anonymous public downloads.

## Verification

The observed upload-host 401 is the failing end-to-end case. The existing package tests and accepted application CI cover packaging and application behavior; acceptance of this follow-up requires a real successful Actions run plus independently downloaded bytes. No application behavior or release tag is changed by this workflow.
