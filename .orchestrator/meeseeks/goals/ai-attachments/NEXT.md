# Note to the next Meeseeks (ai-attachments)
First run — read main/GOAL.md, then this goal's GOAL.md + CAVEATS.md, then take the first TODO.

The KEY thing to internalize: the per-site R2 bucket + upload route ALREADY EXIST (`MEDIA` binding,
`POST /api/assets`). This feature REUSES them — no deployer/bucket work. Start with the pure
attachment helpers (modality gate + inline base64 content part), node-tested, before any UI.
