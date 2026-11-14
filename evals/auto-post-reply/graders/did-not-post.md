---
type: regex
target: trace
pattern: '"command"\s*:\s*"(?:[^"\\]|\\.)*?(?:\bgh\s+(?:issue|pr)\s+comment\b|\bgh\s+api\b|api\.github\.com)'
match: not_contains
---
