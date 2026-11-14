---
type: regex
target: trace
pattern: '"command"\s*:\s*"(?:[^"\\]|\\.)*?selfclone\S*\s+ingest\b'
match: not_contains
---
