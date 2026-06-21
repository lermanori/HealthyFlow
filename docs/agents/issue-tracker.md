# Issue tracker: GitHub Issues + Project board

Issues and PRDs for this repo live as **GitHub Issues** on `lermanori/HealthyFlow`, tracked on **Project 1** (the kanban board). This is the single source of truth — there is no local-only issue store.

- Repo issues: https://github.com/lermanori/HealthyFlow/issues
- Project board: https://github.com/users/lermanori/projects/1

## Conventions

- Issue titles use a `<type>:` prefix matching the commit vocabulary (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- A feature broken into vertical slices is published as one issue per slice. Reference the umbrella/parent issue in each slice body (`Parent: #NN`) and express ordering with `Blocked by: #NN`.
- Workflow state is the board's `Status` field: `Backlog`, `Ready`, `In progress`, `In review`, `Done`. Triage roles map onto these (see `triage-labels.md`).
- Type/priority are GitHub labels (`bug`, `enhancement`, `refactor`, `testing`, `P0`–`P3`, etc.) plus the board's `Priority` / `Size` fields.
- Conversation history lives in the issue's comment thread.

## When a skill says "publish to the issue tracker"

Create a GitHub issue, add it to the board, and set its `Status`:

```
gh issue create --repo lermanori/HealthyFlow --title "<type>: <summary>" --body-file <file> --label <label>
gh project item-add 1 --owner lermanori --url <issue-url>
# then set the Status single-select field via: gh project item-edit
```

Publish slices in dependency order (blockers first) so real issue numbers can be referenced in `Blocked by`.

## When a skill says "fetch the relevant ticket"

The user will pass an issue number or URL. Read it with `gh issue view <number> --repo lermanori/HealthyFlow --comments`.
