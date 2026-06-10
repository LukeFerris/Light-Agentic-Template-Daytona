---
description: Merge the current card branch back into main, then delete the branch and its worktree
---

Merge a card branch's work back into `main`, resolving any conflicts, then tear down the branch and its worktree. This is the cleanup counterpart to the per-card worktree workflow: each card is built on a `card/<short-id>` branch inside its own worktree, and `/merge-back` lands that work and removes the isolation once it's done.

**Target branch:** if `$ARGUMENTS` names a branch, merge that one. Otherwise merge the branch currently checked out in this session.

Follow these steps in order. Stop and report if any step fails — do not improvise around a failure.

## 1. Identify what you're merging

Run `git worktree list` and `git branch --show-current` to determine:
- **CARD_BRANCH** — the branch to merge (from `$ARGUMENTS`, or the current branch).
- **CARD_WORKTREE** — the worktree directory that has `CARD_BRANCH` checked out.
- **MAIN_WORKTREE** — the worktree directory that has `main` checked out.

Refuse to continue if `CARD_BRANCH` is `main` — there is nothing to merge back. Report and stop.

## 2. Confirm the branch work is committed

In `CARD_WORKTREE`, run `git status --porcelain`. If it reports **any** uncommitted or untracked changes, stop and tell the user to commit (or discard) them first — `/merge-back` only lands committed work. Do not commit on the user's behalf here.

## 3. Move out of the worktree you're about to delete

`cd` into `MAIN_WORKTREE`. Every remaining step runs from there. (You cannot remove a worktree while your shell is sitting inside it, and after removal a cwd inside it no longer exists.)

## 4. Merge the card branch into main

From `MAIN_WORKTREE`:

```bash
git checkout main
git merge --no-ff card/<short-id>   # use the real CARD_BRANCH name
```

Use `--no-ff` so the card's work lands as a single, traceable merge commit. Match the existing merge-commit message style in this repo (see `git log --merges --oneline` — e.g. `Merge card/<short-id>: <what the card delivered>`).

**If the merge reports conflicts:**
1. Inspect each conflicted file (`git status`, then read the conflict markers).
2. Resolve every conflict by hand, preserving the intent of *both* sides — never blindly take one side. When the correct resolution is genuinely ambiguous, stop and ask the user rather than guessing.
3. `git add` each resolved file, then `git commit` to complete the merge (keep the merge-commit message).
4. Never resolve a conflict by passing `--no-verify` or otherwise bypassing hooks.

## 5. Verify main is healthy

Still in `MAIN_WORKTREE`, run the project's checks so you don't leave `main` broken after the merge:

```bash
yarn type-check && yarn lint && yarn test
```

If anything fails, fix it on `main` and commit the fix (it is now your responsibility — `main` must stay green). Only proceed once everything passes.

## 6. Remove the worktree and delete the branch

From `MAIN_WORKTREE`, in this order:

```bash
git worktree remove ../<repo>-<short-id>   # the CARD_WORKTREE path
git branch -d card/<short-id>              # CARD_BRANCH; -d only deletes a fully-merged branch
```

`git worktree remove` must come first — git refuses to delete a branch that is still checked out in a worktree. Use `git branch -d` (lower-case), **not** `-D`: it is a safety check that the branch was truly merged. If `-d` refuses, the merge did not actually land — investigate, do not force with `-D`.

If FlowSwitch is in use, clear the recorded worktree for this card by calling `report_worktree` with an empty `worktree_path`, so a future restart doesn't try to resume in a directory that no longer exists.

## 7. Report

Summarise: which branch was merged into `main`, the merge commit, whether there were conflicts (and how they were resolved), the check results, and confirmation that the branch and worktree were removed.
