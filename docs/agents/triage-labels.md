# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles onto the GitHub Project board's `Status` field (the source of truth for workflow state).

"Applying a label" means setting the issue's `Status` on Project 1, e.g. moving it to `Ready`.

| Canonical role (skills) | Board `Status`           | Meaning                                  |
| ----------------------- | ------------------------ | ---------------------------------------- |
| `needs-triage`          | `Backlog`                | Maintainer needs to evaluate this issue  |
| `needs-info`            | `Backlog` (+ `question` label) | Waiting on reporter for more information |
| `ready-for-agent`       | `Ready`                  | Fully specified, ready for an AFK agent  |
| `ready-for-human`       | `Backlog` (HITL)         | Requires a human decision before work    |
| `wontfix`               | close issue + `wontfix` label | Will not be actioned                |

In-flight work uses `In progress` → `In review` → `Done` as it moves across the board.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), set the corresponding board `Status` from this table.
