# 0012 · Review queue: issue history, actions per type, layout

Status: proposed (owner reviews after the T6–T9 run) · 2026-10-09 · Task T6

## Context

T6 adds the review queue (PRD 8.5): open issues by severity and type, an action set per issue type, and a "resolved" tab with who, when and what. Two questions had more than one answer: where the "who/when/what" comes from, and which actions each issue type offers.

## Options and decisions

**1. Who / when / what for closed issues**
- *Chosen:* every issue carries its own `history`, the review events written while resolving it, oldest first (API: `IssueOut.history`, built from `review_event` by `issue_id` in one query; static demo: the same events from the browser log). The closing event gives who and when; the other events give what changed.
- *Not chosen:* reading it from each object's history (`GET /instances/{id}`). An issue without objects (`tag_missing_in_scan`) has nowhere to keep its history, and the resolved tab would need one request per issue.

**2. Actions per issue type** (`web/src/domain/issues.ts`, `issueActions`)

| type | actions |
|---|---|
| class_mismatch | accept the suggested class, change class, reject (dismiss) |
| tag_missing_in_scan | close (dismiss) |
| untagged_equipment | assign a tag (candidate list or typed), change class, close |
| tag_split | close (both objects belong to the tag) |
| estimate_unreliable | change class, close (keep as an estimate) |
| zone_borrowed | close (the borrowed zone is right) |

The rule is driven by the data, not only the type: "accept" needs a class suggestion, "assign tag" needs exactly one object, so the UI never offers what the API would refuse. Each "close" button says in words what closing means for that type.

**3. Layout**
- *Chosen:* the panel under the 3D view gets two tabs, "Inventory" and "Review queue (open count)". The queue lists issues on the left (open: grouped by severity then type; resolved: newest first) and the selected issue with its actions on the right. Selecting an issue selects its first object, so the 3D view flies there and the right-hand detail panel shows it.
- *Not chosen:* a separate page (the 3D context would be lost while reviewing).

## Other choices made inside T6

- Severity is shown as text plus a mark (▲ High, ■ Medium, ● Low), never colour alone.
- Sorting: one order, severity then type. In the pipeline each type has one severity, so "sort by severity" and "group by type" give the same list; the group headings show both.

## Consequences

- `IssueOut` changed: the frontend types were regenerated (`make types`); the contract suite checks the history in both modes.
- Assigning a P&ID tag to an object does not close a `tag_missing_in_scan` issue for the same tag; the reviewer closes it separately. Linking the two is a possible follow-up, not done here.
