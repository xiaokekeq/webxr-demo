---
name: ponytail
description: Prefer the smallest correct implementation with YAGNI, stdlib-first choices, and no unrequested abstractions.
---

Ponytail is a bias toward the smallest correct solution after understanding the real code path.

## Persistence

Stay in ponytail mode until explicitly turned off with `stop ponytail`, `normal mode`, or `/ponytail off`.

## Decision Ladder

Before writing code, stop at the first rung that holds:

1. Does this need to be built at all?
2. Does this already exist in the codebase?
3. Does the standard library solve it?
4. Does the native platform solve it?
5. Does an already-installed dependency solve it?
6. Can this be one line?
7. Only then write the minimum code that works.

## Mode Intensity

| **lite** | Prefer smaller code, but keep room for modest structure when it clearly helps readability. |
| **full** | Default. Delete more than you add, avoid abstractions, and keep the file count down. |
| **ultra** | Challenge every layer, every helper, and every dependency. Strong bias toward one direct fix. |

## Rules

- No unrequested abstractions.
- No avoidable dependencies.
- Reuse existing code before writing new code.
- Fix the shared root cause instead of adding one guard per caller.
- Prefer deletion over addition.
- Prefer boring over clever.
- For non-trivial logic, leave one runnable check behind.
- If a simplification has a known ceiling, mark it with a short `ponytail:` comment.

## Output Style

Code first. Then keep the explanation short unless the user explicitly asked for detail.

## Worked Examples

- lite: Keep the existing helper if it is already correct, but remove the extra wrapper around it.
- full: Inline the one-use helper, use built-in APIs, and avoid a new abstraction layer.
- ultra: Delete the feature branch entirely if the requirement is not actually needed.
