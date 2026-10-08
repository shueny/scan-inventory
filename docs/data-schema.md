# Data schema

Files written by the offline pipeline into `data/` (not committed). They are the contract between the pipeline, the API seeding (T4) and the static demo (T9).

## data/instances.json

Written by `scripts/build_instances.py`.

```json
{ "summary": { ... }, "instances": [ ... ], "pnid_tags_missing_in_scan": [ ... ] }
```

### instances[]

One record per annotated object.

| field | type | meaning |
|---|---|---|
| `scan_id` | string | scan the object belongs to (`nora`) |
| `instance_id` | int | instance id from `scalar_instance` in the PLY |
| `class_id` | int | class id from `scalar_label` (see `meta/classes.json`) |
| `class_name` | string | class name |
| `is_background` | bool | true for Structural (0) and Floor (7) |
| `point_count` | int | number of points |
| `centroid` | [x, y, z] | mean point position, metres, Z up |
| `bbox_min`, `bbox_max` | [x, y, z] | axis-aligned bounding box, metres |
| `bbox_size` | [x, y, z] | `bbox_max - bbox_min` |
| `principal_axis` | [x, y, z] | unit vector of the longest spread (PCA) |
| `length_est_m` | float | estimate (PCA): `sqrt(12 * largest variance)`. Only right for straight, uniform objects |
| `diameter_est_m` | float | estimate (PCA): `2 * sqrt(sum of the two smaller variances)`. Large for bent or branched pipes |
| `mean_color` | [r, g, b] | mean scan colour, 0-255 |
| `has_tag` | bool | at least one P&ID row points to this object |
| `tag` | string \| null | **primary tag**: the first P&ID row (file order) pointing to this object |
| `all_tags` | string[] | every P&ID tag pointing to this object, file order |
| `element` | string \| null | P&ID element type of the primary tag (trimmed) |
| `nominal_inch` | float \| null | nominal size in inches of the primary tag (`2 1/2"` -> 2.5) |
| `system` | string \| null | P&ID system of the primary tag, e.g. `RWP - 109` |
| `location` | string \| null | zone: `NW`, `NC`, `NE`, `SW`, `SC`, `SE`, `SW - SE` (cross-zone value kept as is) or null for background |
| `location_source` | string | where `location` came from, see below |
| `nearest_tag` | string | only when the zone was borrowed: tag of the object it came from |
| `nearest_tag_distance_m` | float | only when the zone was borrowed: plan-view (x, y) distance to that object |
| `class_conflict` | bool | the object's points carry more than one class id |

`location_source` values:

| value | meaning |
|---|---|
| `pnid` | zone from the object's own P&ID row |
| `tagged_nearest_tag` | the object has a tag, but its P&ID row has no zone; zone borrowed from the nearest object with a P&ID zone |
| `nearest_tag` | the object has no tag; zone borrowed from the nearest object with a P&ID zone |
| `background` | Structural or Floor, no zone |

### summary

`scan_id`, `source_ply`, `total_points`, `instance_count`, `per_class` (name -> count), `per_location` (zone -> count), `tags_without_instance`, `tags_pointing_to_unknown_instance`, `class_conflicts`, `notes`.

### pnid_tags_missing_in_scan[]

P&ID rows with no instance id: `tag`, `element`, `dimension`, `nominal_inch`, `spool_colour`, `location`, `system`, `instance_ids` (empty).

## data/instances.csv

Flat copy of `instances[]` for spreadsheets. `centroid` becomes `cx, cy, cz`, `bbox_size` becomes `size_x, size_y, size_z`, `all_tags` is `;`-joined.

## data/issues.json

Written by `scripts/build_issues.py` from `instances.json` and the P&ID CSV.

```json
{ "scan_id": "nora", "issue_count": 0, "issues": [ ... ] }
```

Issues are sorted by severity (high, medium, low), then type (table order below), then first instance id.

### issues[]

| field | type | meaning |
|---|---|---|
| `issue_id` | string | stable id `<type>:<instance id or tag>`, e.g. `class_mismatch:1`, `tag_split:P-109A` |
| `type` | string | rule that produced it, see below |
| `severity` | string | `high`, `medium`, `low` |
| `instance_ids` | int[] | objects involved (empty for `tag_missing_in_scan`) |
| `tags` | string[] | P&ID tags involved |
| `title` | string | one line for the queue |
| `detail` | string | longer explanation |
| `suggested_action` | string \| null | `change_class` or `assign_tag`; null when the rule has no concrete fix to propose |
| `suggested_class_id` | int \| null | for `change_class`: the class to change to, null if unclear |
| `candidate_tags` | object[] | for untagged transmitters: `{tag, system, distance_m}`, nearest first |

### Rules

| type | rule | severity | suggested_action |
|---|---|---|---|
| `class_mismatch` | the P&ID element type does not allow the annotated class (`scripts/class_mapping.py`). Unmapped element types are skipped with a warning | high | `change_class` |
| `tag_missing_in_scan` | P&ID row with no instance id | medium | null |
| `untagged_equipment` | non-background object, not Pipe (8) or Pipeline flanged joint (23), with no tag | medium | `assign_tag` |
| `tag_split` | one P&ID tag points to more than one instance | low | null |
| `estimate_unreliable` | Pipe with `diameter_est_m` > 0.3 | low | null |
| `zone_borrowed` | `location_source == "tagged_nearest_tag"` | low | null |

`candidate_tags` (untagged Transmitters only): P&ID rows with element `transmitter` and no instance id. Each gets the straight-line (3D) distance from the transmitter to the nearest object whose `system` equals the tag's system. Nearest first; tags whose system has no object in the scan go last with `distance_m: null`. A suggestion only.

`suggested_class_id` for `class_mismatch`: the only allowed class when there is one. For ball valves (allowed 2 or 22) it depends on size: below 1" Small manual valve (22), otherwise Manual lever valve (2). For pumps (13 or 20) it is null.

## Determinism

The same input gives byte-identical output files (PRD section 10). There is no timestamp in the output for this reason; use git history or file times to know when data was built.
