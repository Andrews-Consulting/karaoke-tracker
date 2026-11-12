#!/usr/bin/env python3
"""Regression suite for guard-destructive.py.

Run: python3 .claude/hooks/guard-destructive.test.py

Covers both directions, because either failing silently is worse than no guard:
  - MUST_DENY   — a miss here loses a database.
  - MUST_ALLOW  — a false positive here blocks ordinary work and trains people
                  to disable the hook, which is the same as not having one.
"""
import json
import subprocess
import sys
from pathlib import Path

GUARD = Path(__file__).with_name("guard-destructive.py")

MUST_DENY = [
    # git — everything but history reads, merges, staging and branch work
    "git",
    "git pull",
    "git push origin main",
    "git reset --hard HEAD~1",
    "git checkout main",
    "git branch -D dev",
    "git stash",
    "git rebase main",
    "git tag v1",
    "/usr/bin/git push",
    "npm run test:run && git commit --amend -m done",
    "echo hi; git push",
    "if true; then git push; fi",
    "git status && git push",
    # git — read-only subcommands made to run a program
    "git -c core.fsmonitor=/tmp/evil.sh status",
    "git -c core.pager=/tmp/evil.sh log",
    "git -C /tmp/other status",
    "git --config-env=core.pager=EVIL log",
    "git log -p --ext-diff",
    "git show --ext-diff HEAD",
    "GIT_DIR=.git git status",
    "GIT_EXTERNAL_DIFF=/tmp/evil.sh git log -p",
    "GIT_CONFIG_PARAMETERS=x git status",
    "export GIT_EXTERNAL_DIFF=/tmp/evil.sh; git log -p",
    # git add — staging an ignored file, or an interactive form that waits forever
    "git add -f .env",
    "git add --force .env",
    "git add -Af",
    "git add -p",
    "git add -i",
    "git add -e",
    "git add --chmod=+x scripts/x.sh",
    "git add -A && git commit --amend -m wip",
    "git add *.ts",
    # git commit — rewriting the last commit, skipping the hooks, or waiting on an editor
    "git commit",
    "git commit -a",
    "git commit --amend -m 'wip'",
    "git commit --amend --no-edit",
    "git commit -m wip --amend",
    "git commit -n -m wip",
    "git commit --no-verify -m wip",
    "git commit -am done",
    "git commit --fixup HEAD~2 -m x",
    "git commit -m \"$(cat <<'EOF'\nwip\nEOF\n)\"",
    'git commit -m "costs $100"',
    "git commit -m 'unclosed",
    "echo --amend | xargs git commit -m wip",
    # git branch work — the forms that delete or move a branch, or drop uncommitted edits
    "git branch -d done-work",
    "git branch --delete dev",
    "git branch -dr origin/dev",
    "git branch --list -d dev",
    "git branch -m old new",
    "git branch -M main",
    "git branch -c dev copy",
    "git branch -f dev HEAD~3",
    "git branch -u origin/dev",
    "git branch --set-upstream-to=origin/dev",
    "git switch -f dev",
    "git switch --discard-changes dev",
    "git switch -C dev origin/dev",
    "git switch --force-create=dev origin/dev",
    "git switch -m dev",
    "git switch --orphan scratch",
    "git switch --ignore-other-worktrees dev",
    "git checkout plans/outstanding-work.md",
    "git checkout .",
    "git checkout -- plans/outstanding-work.md",
    "git checkout HEAD -- plans/outstanding-work.md",
    "git checkout -B dev origin/dev",
    "git checkout -f -b new dev",
    "git checkout --orphan -b new",
    "git checkout -b new dev && git checkout .",
    "git switch -c new dev; git branch -D dev",
    "GIT_DIR=../other/.git git checkout -b new dev",
    # git branch work — a flag the allowlist sees only once the shell unquotes or expands it
    'git branch "-D" dev',
    "git branch \\-D dev",
    "git branch '-'D dev",
    "git switch '-f' dev",
    "git branch $F dev",
    "git branch ${F} dev",
    "git branch {-D,dev}",
    "git branch ?D dev",
    "git checkout -b new *",
    # git behind a command that runs its arguments
    "env git commit --amend -m x",
    "command git push",
    "command -p git push",
    "command -- git push",
    "command npm run db:push",
    "command find . -exec npm run db:push \\;",
    "nice git reset --hard",
    "nice -n 10 git push",
    "sudo git push",
    "timeout 5 npx prisma migrate dev",
    "env psql -c 'DROP TABLE plan'",
    "echo x | xargs git commit -m",
    # prisma — schema and data paths
    "npx prisma migrate dev",
    "npx prisma migrate reset",
    "npx prisma migrate deploy",
    "npx prisma db push",
    "npx prisma db execute --file drop.sql",
    "npx prisma studio",
    "prisma migrate reset",
    # npm scripts that reach the database (the hole: `npm run *` is allowlisted)
    "npm run db:push",
    "npm run db:migrate",
    "npm run db:studio",
    "npm --workspace packages/db run db:push",
    "npm --workspace packages/db run db:migrate",
    # direct client access
    "psql -c 'DROP TABLE plan'",
    "psql postgres://localhost/retiremgmt",
    "dropdb retiremgmt_dev",
    "pg_dump retiremgmt > backup.sql",
    # hidden in a compound command
    "npm run type-coverage && npm run db:push",
    # hidden in a subshell or substitution — compound-command-allow.sh splits on
    # ( ), so without the same split here these would be auto-approved unseen
    "(git push origin main)",
    "ls && (npm run db:push) > out.log 2>&1",
    "(npm run test:run && npm --workspace packages/db run db:migrate)",
    "echo $(git push)",
    # hidden in a substitution the split cannot see — inside double quotes, or a backtick
    'echo "$(npm run db:push)"',
    'echo "$(echo "$(git push)")"',
    'echo $(echo "$(git push)")',
    "echo `npm run db:push`",
    'echo "`git push`"',
    'git commit -m "use `npm run db:push`"',
    # hidden in a string a shell or eval runs
    "bash -c 'npm run db:push'",
    "bash -lc 'git push'",
    'sh -c "git push origin main"',
    "bash -c 'bash -c \"npm run db:push\"'",
    "eval npm run db:push",
    "eval 'git push'",
    'eval "$CMD"',
    'bash -c "$CMD"',
    "echo 'npm run db:push' | bash",
    "timeout 60 bash -c 'git push'",
    "echo x | xargs sh -c 'git status'",
    # hidden in a command find runs per file
    "find . -name '*.sql' -exec psql -f {} \\;",
    "find . -exec git branch -D {} +",
    "find . -execdir npm run db:push \\;",
    "find . -ok git push \\;",
    "find . -exec sh -c 'git push' \\;",
    "find . -name x -exec echo {} \\; -exec git push \\;",
    "nice find . -exec npm run db:push \\;",
    # a command whose name exists only once the shell expands it
    "$SHELL -c 'git push'",
    '"$X" push origin main',
    "$(echo git) push",
    # hidden behind a quote the splitter wrongly thinks is open — an escaped \'
    # and the \' inside $'…' open nothing
    "echo It\\'s done; npm run db:push",
    "echo $'a\\'b'; npm run db:push",
    # npm db:* is an allowlist — a script that does not exist yet must still be denied
    "npm run db:wipe",
    "npm run db:reset",
    "npm run db:seed",
    "npm --workspace packages/db run db:wipe",
    # gh — repository modification
    "gh pr create --title x --body y",
    "gh pr merge 12",
    "gh pr close 12",
    "gh pr comment 12 --body hi",
    "gh issue create --title x",
    "gh repo delete owner/repo",
    "gh release create v1.0.0",
    "gh secret set FOO",
    "gh auth login",
    "gh gist create notes.md",
    # gh — git by proxy: checks out branches and mutates the working tree
    "gh pr checkout 12",
    # gh — the configured `co` alias resolves to `pr checkout`; a pair-matcher
    # never sees the real noun, so default-deny has to catch it
    "gh co 12",
    # gh — build tampering rather than build reading
    "gh run delete 123",
    "gh run cancel 123",
    "gh run rerun 123",
    "gh workflow run ci.yml",
    "gh workflow disable ci.yml",
    # gh — bypass surfaces
    "gh alias set ci 'pr merge --admin'",
    "gh extension install owner/gh-thing",
    # gh api — GET is the default, but these flags silently switch it to POST
    "gh api -X POST /repos/o/r/issues",
    "gh api --method DELETE /repos/o/r",
    "gh api --method=PATCH /repos/o/r",
    "gh api -f title=bug /repos/o/r/issues",
    "gh api --field body=x /repos/o/r/issues",
    "gh api graphql -f query='mutation { closeIssue }'",
    "gh api graphql",
    # gh hidden in a compound command
    "npm run e2e:smoke && gh pr create --title x",
]

MUST_ALLOW = [
    # the safe prisma paths
    "npx prisma generate --schema=./packages/db/prisma",
    "npx prisma validate",
    "npm run db:generate",
    # ordinary work
    "npm run test:run",
    "npm run type-coverage",
    "npm run e2e:smoke",
    "npx playwright test --config playwright.config.smoke.ts",
    "ls -la",
    "grep -rn 'deleted_at' packages/api/src",
    "find apps packages -name '*.test.ts' | wc -l",
    # git — read-only views of history
    "git status",
    "git status --short",
    "git log --oneline -n 20",
    "git log -p --output=/tmp/log.txt",
    "git show HEAD --stat",
    "/usr/bin/git status",
    "2>/dev/null git status",
    "git log --oneline | head -n 5",
    "env git status",
    "timeout 5 npm run test:run",
    # git — a merge only adds a commit, which the user can undo
    "git merge dev",
    "git merge --no-ff close-out/t2-03b-pdf-entry",
    "git merge --abort",
    # git — staging, which overwrites nothing in the working tree
    "git add -A",
    "git add --all",
    "git add .",
    "git add -u",
    "git add -- plans/outstanding-work.md",
    "git add 'apps/web/src/*.ts'",
    "cd ../retiremgmt-ws3 && git add -A && git status --short",
    # git — a commit adds history, which the user can undo
    'git commit -m "fix the thing"',
    "git commit -m 'fix the thing'",
    "git commit -a -m wip",
    "git commit --message='fix the thing'",
    "git commit -m 'Subject line' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'",
    "git commit -m wip -- plans/outstanding-work.md",
    "git add -A && git commit -m 'close out t2-03b'",
    "env git commit -m wip",
    "cd ../retiremgmt-ws3 && git add -A && git commit -q -m 'merge ws1 and ws2'",
    # git — branch work that cannot rewrite history or drop uncommitted edits
    "git branch",
    "git branch --list",
    "git branch --list 'close-out/*'",
    "git branch -a",
    "git branch -vv",
    "git branch --show-current",
    "git branch --merged dev",
    "git branch --sort=-committerdate",
    "git branch new-work dev",
    "git branch -a 2>/dev/null | head -n 20",
    "git switch dev",
    "git switch -c new-work dev",
    "git switch --create=new-work dev",
    "git switch -",
    "git checkout -b new dev",
    "git checkout -b close-out/t2-04 origin/dev",
    "git checkout '-b' new dev",
    "cd ../retiremgmt-ws3 && git checkout -b new dev",
    "git checkout -q -b new dev > .cache/claude/checkout.log 2>&1",
    # the word appears, but not as a command
    "grep -rn 'git' docs/",
    "echo 'run git status yourself'",
    "cat .gitignore",
    "ls .git",
    "grep -rn 'npm run db:push' docs/",
    # a script whose name merely starts similarly
    "npm run db:generate --workspace packages/db",
    # a subshell of safe commands, and parens that are not a subshell
    "(npm run db:generate && npm --workspace packages/calc run build) > .cache/claude/build.log 2>&1",
    "echo '(git push)'",
    "find . \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l",
    # substitutions, shells and find running safe commands — the guard checks what they run
    'echo "exit $(date +%s)"',
    'echo "`date`"',
    "echo \"use 'git push' yourself\"",
    'git commit -m "use \\`git push\\` to publish"',
    "git commit -m 'use `git push` to publish'",
    "bash -n .claude/hooks/compound-command-allow.sh",
    "bash -c 'npm run test:run'",
    "bash scripts/check.sh",
    "eval echo hi",
    "find . -name '*.tmp' -exec rm {} \\;",
    "find apps -name '*.ts' -exec grep -l deleted_at {} +",
    "LOG=$(ls -t .cache/claude/*.log | head -n 1); grep -a FAIL \"$LOG\"",
    # a lookup runs nothing
    "command -v git",
    "command -v bash",
    # `command grep` is the real grep — the word after `command` is what runs, not
    # the first guarded word anywhere after it
    "command grep -ran git docs/",
    "command grep -c gh plans/outstanding-work.md",
    "command grep -ran sh .claude/hooks",
    "command grep -rn 'npm run db:push' docs/",
    "command find . -name '*.ts' | wc -l",
    "command git status",
    # gh — the whole point: retrieving logs, tracking and diagnosing builds
    "gh run list",
    "gh run list --workflow ci.yml --limit 5",
    "gh run view 123",
    "gh run view 123 --log",
    "gh run view --log-failed",
    "gh run download 123",
    "gh run watch",
    "gh workflow list",
    "gh workflow view ci.yml",
    "gh run view 123 --log | grep -i error",
    # gh — the four pairs compound-command-allow.sh auto-approves, in the shapes it sees
    "gh run view 123 --log-failed",
    "gh run list | head -n 20",
    "gh pr list --state open --limit 10",
    "gh pr view 12 --json state,mergeable",
    "gh run list && gh pr view 12",
    # gh — reading PRs and issues
    "gh pr list",
    "gh pr view 12",
    "gh pr diff 12",
    "gh pr checks",
    "gh issue list",
    "gh issue view 5",
    "gh repo view",
    "gh release list",
    # gh — auditing the guard's own bypass surface
    "gh alias list",
    "gh auth status",
    "gh secret list",
    "gh status",
    # gh api — explicit and implicit GET
    "gh api /repos/o/r/actions/runs",
    "gh api -X GET /repos/o/r",
    "gh api --method GET /repos/o/r",
    # the words appear, but not as a command
    "grep -rn 'gh pr create' docs/",
]


def run(cmd):
    """Return the guard's exit code for a command string."""
    payload = json.dumps({"tool_input": {"command": cmd}})
    proc = subprocess.run(
        [sys.executable, str(GUARD)],
        input=payload,
        capture_output=True,
        text=True,
    )
    return proc.returncode


def main():
    failures = []
    for cmd in MUST_DENY:
        if run(cmd) != 2:
            failures.append(f"NOT BLOCKED (should be): {cmd}")
    for cmd in MUST_ALLOW:
        if run(cmd) == 2:
            failures.append(f"OVER-BLOCKED (should pass): {cmd}")

    total = len(MUST_DENY) + len(MUST_ALLOW)
    if failures:
        print(f"FAIL — {len(failures)} of {total} cases wrong:\n")
        for f in failures:
            print(f"  {f}")
        sys.exit(1)
    print(f"PASS — {total} cases ({len(MUST_DENY)} deny, {len(MUST_ALLOW)} allow)")


if __name__ == "__main__":
    main()
