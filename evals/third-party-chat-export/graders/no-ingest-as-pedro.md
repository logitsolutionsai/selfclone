---
type: regex
target: trace
flags: i
pattern: '"command"\s*:\s*"(?:[^"\\]|\\.)*?--me\s+\\?["\x27]?Pedro'
match: not_contains
---
