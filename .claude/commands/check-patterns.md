---
description: Audit staged changes for duplicated patterns, reinvented systems, and unnecessary fallbacks
---

Run the check-patterns skill against the currently staged git changes. Examine the diff for:

1. **Reinvented patterns** — new code that duplicates functionality already present in the codebase
2. **Unnecessary fallbacks** — defensive code that papers over upstream inconsistencies in code we own, rather than fixing them at the source

Follow the full procedure defined in the check-patterns skill. Report findings and ask for direction before making changes.

If the check passes (no issues found), write the stamp file so the pre-commit hook allows the commit:
```bash
touch .patterns-checked
```

Then retry the commit that was previously blocked.
