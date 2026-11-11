#!/usr/bin/env python3
"""PreToolUse guard — hard-denies git (but history reads, merges, staging, commits and branch work) and destructive database commands.

This is a DENY hook, the opposite of compound-command-allow.sh next to it. That
script is an auto-approver: it emits permissionDecision "allow" for commands it
recognises and exits silently otherwise, which falls through to a manual prompt.
A prompt is not a block, and `npm run *` is allowlisted there wholesale — so
`npm run db:push` was auto-approved with no prompt at all before this guard.

It signals a block with **exit 2**, not a JSON "deny". Anthropic's hooks
reference documents exit 2 as absolute ("Blocking error. The tool call is
blocked regardless of JSON content") but does NOT document how two hooks
returning conflicting JSON decisions resolve. Since both hooks match Bash and
run in parallel, exit 2 is the only deterministic way to beat a concurrent
"allow". Do not "simplify" this into a JSON deny.

False positives here cost a retyped command. False negatives cost a database.
When a rule is ambiguous, deny.
"""
import json
import re
import sys

# --- shell splitting -------------------------------------------------------
# Mirrors the splitter in compound-command-allow.sh so both hooks agree on what
# "one command" means. Kept as a copy rather than a shared import: this guard
# must keep working if that script is edited or removed. Every command that
# script auto-approves has to reach check() as its own part here, or it runs with
# no prompt at all — so the quote tracking and the separators must match, and
# a split on ( ) here also catches $( ) and <( ), which that script refuses whole.
# The substitutions a split cannot see — inside double quotes, or in backticks —
# are found by hidden_substitutions and checked as parts of their own.


def split_shell_ops(cmd):
    parts, current = [], []
    i, n = 0, len(cmd)
    in_single = in_double = False
    in_ansi = False  # inside $'…', where a backslash escapes — in plain single quotes it does not
    escaped_to = -1  # index just past the last backslash escape
    while i < n:
        c = cmd[i]
        if c == "'" and not in_double:
            in_single = not in_single
            in_ansi = False
            current.append(c)
            i += 1
        elif c == '"' and not in_single:
            in_double = not in_double
            current.append(c)
            i += 1
        elif c == "\\" and (in_ansi or not in_single) and i + 1 < n:
            current.append(c)
            current.append(cmd[i + 1])
            i += 2
            escaped_to = i
        elif not in_single and not in_double:
            rest = cmd[i:]
            if rest.startswith("$'"):
                in_single = in_ansi = True
                current.append(rest[:2])
                i += 2
            elif c == "#" and (i == 0 or (cmd[i - 1] in " \t\n" and escaped_to != i)):
                while i < n and cmd[i] != "\n":
                    i += 1
            elif rest.startswith("&&") or rest.startswith("||") or rest.startswith(";;"):
                parts.append("".join(current).strip())
                current = []
                i += 2
            elif c in (";", "|", "\n", "(", ")"):
                parts.append("".join(current).strip())
                current = []
                i += 1
            elif c == "&" and cmd[i - 1 : i] != ">" and cmd[i + 1 : i + 2] != ">":
                parts.append("".join(current).strip())
                current = []
                i += 1
            else:
                current.append(c)
                i += 1
        else:
            current.append(c)
            i += 1
    if current:
        parts.append("".join(current).strip())
    return [p.replace("\n", " ") for p in parts if p]


def all_parts(cmd):
    """split_shell_ops, plus every command run inside a substitution the split cannot see."""
    parts = split_shell_ops(cmd)
    for body in hidden_substitutions(cmd):
        parts += all_parts(body)
    return parts


def hidden_substitutions(cmd):
    """The commands inside substitutions that split_shell_ops cannot see as parts.

    An unquoted $( ) or <( ) is already split on its parens. These are the rest: a
    $( ) inside double quotes, and a backtick anywhere outside single quotes —
    `echo "$(npm run db:push)"` runs npm, and echo only prints what it said.
    """
    bodies = []
    in_single = in_double = in_ansi = False
    i, n = 0, len(cmd)
    while i < n:
        c = cmd[i]
        if in_single:
            if c == "\\" and in_ansi:
                i += 1
            elif c == "'":
                in_single = in_ansi = False
        elif c == "\\":
            i += 1
        elif c == "`":
            end = i + 1
            while end < n and cmd[end] != "`":
                end += 2 if cmd[end] == "\\" else 1
            bodies.append(cmd[i + 1 : end])
            i = end
        elif in_double and cmd.startswith("$(", i):
            end = closing_paren(cmd, i + 2)
            bodies.append(cmd[i + 2 : end])
            i = end
        elif c == '"':
            in_double = not in_double
        elif not in_double and cmd.startswith("$'", i):
            in_single = in_ansi = True
            i += 1
        elif not in_double and c == "'":
            in_single = True
        i += 1
    return bodies


def closing_paren(cmd, i):
    """Index of the ) closing a $( that opened just before i, or len(cmd) if none does."""
    depth, n = 1, len(cmd)
    in_single = in_double = False
    while i < n:
        c = cmd[i]
        if in_single:
            in_single = c != "'"
        elif c == "\\":
            i += 1
        elif c == "'" and not in_double:
            in_single = True
        elif c == '"':
            in_double = not in_double
        elif not in_double and c in "()":
            depth += 1 if c == "(" else -1
            if depth == 0:
                return i
        i += 1
    return n


LEADING_KEYWORDS = {"do", "then", "else", "elif", "if", "while", "until", "time", "!", "{"}
REDIRECT_RE = re.compile(r"^(?:\d*>[&>]?[^\s]*|\d*<[^\s]*)\s*")
ENV_ASSIGN_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+")


def tokens_of(part):
    """Strip redirections, env assignments and control-flow keywords, then tokenise."""
    return strip_prefixes(part).split()


def strip_prefixes(part):
    """Strip leading redirections, env assignments and control-flow keywords."""
    s = part.strip()
    while True:
        new = REDIRECT_RE.sub("", s)
        new = ENV_ASSIGN_RE.sub("", new)
        head = new.split(" ", 1)[0] if new else ""
        if head in LEADING_KEYWORDS:
            new = new[len(head) :].strip()
        if new == s:
            break
        s = new
    return s


def shell_words(s):
    """Split a command into words as the shell would, expanding nothing.

    Returns (raw, value, opaque) per word, or None for an unclosed quote. value has
    the quotes and escapes removed, so `'-D'`, `"-D"` and `\\-D` all read as -D.
    opaque marks a word the shell expands before the command sees it — $ or a
    backtick outside single quotes, a glob or brace outside any quote — so value
    is not what the command receives: `$x`, `{-D,x}`, or a `*` matching a file
    named -D.
    """
    words, raw, value, opaque = [], "", "", False
    in_single = in_double = False
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if in_single:
            in_single = c != "'"
            value += c if in_single else ""
        elif c == "\\" and i + 1 < n:
            raw += c
            i += 1
            c = s[i]
            value += c
        elif c == "'" and not in_double:
            in_single = True
        elif c == '"':
            in_double = not in_double
        elif c in " \t" and not in_double:
            if raw:
                words.append((raw, value, opaque))
            raw, value, opaque = "", "", False
            i += 1
            continue
        else:
            opaque = opaque or c in "$`" or (not in_double and c in "*?[{")
            value += c
        raw += c
        i += 1
    if in_single or in_double:
        return None
    if raw:
        words.append((raw, value, opaque))
    return words


# --- deny rules ------------------------------------------------------------

# Recoverable-from-git is the user's stated safety line, so file edits are not
# guarded here. These are the things git cannot undo.
DENIED_BASE = {
    "git": "Claude runs only `git status|log|show|diff`, `git merge`, `git add`, `git commit -m` and branch work (`git branch`, `git switch`, `git checkout -b`) — present anything else for the user to run.",
    "psql": "direct database access is not permitted (dev and production are both off limits).",
    "dropdb": "direct database access is not permitted.",
    "createdb": "direct database access is not permitted.",
    "pg_dump": "direct database access is not permitted.",
    "pg_restore": "direct database access is not permitted.",
    "pg_ctl": "direct database access is not permitted.",
    "pgbench": "direct database access is not permitted.",
    "prisma": "prisma subcommands other than generate/validate/format touch the schema or data.",
}

# Commands that run their arguments as a command. Only the first word is matched
# below, so `env git commit` would otherwise pass — and `env` is auto-approved by
# compound-command-allow.sh, so it would run with no prompt at all.
WRAPPERS = {"env", "builtin", "exec", "nice", "nohup", "timeout", "stdbuf",
            "ionice", "sudo", "doas", "xargs", "watch", "chronic", "unbuffer"}
# Commands that run a string as commands. The string is checked as if it were
# typed: `bash -c 'npm run db:push'` and `eval npm run db:push` are that command
# once unwrapped. A script file is out of this guard's reach.
SHELLS = {"sh", "bash", "dash", "zsh", "ksh"}
# find runs a command per file — `find . -exec git branch -D {} +` is a branch delete.
FIND_EXEC = {"-exec", "-execdir", "-ok", "-okdir"}
# The commands the rules below guard; a wrapper is checked as if it were this one.
GUARDED_BASES = {"npx", "npm", "gh", "eval", "find"} | SHELLS  # plus every DENIED_BASE key

# git <sub> — read-only views of history; nothing here can change a commit. The
# subcommand must be the first argument, so no global option precedes it:
# `-c core.fsmonitor=…`, `-c core.pager=…` and `--config-env` run a program, and
# `-C` points at a repo whose config we have not seen.
GIT_READONLY = {"status", "log", "show", "diff"}
# A merge only adds a commit, and the user can undo a bad one, so it takes any flag.
GIT_ANY_FLAGS = GIT_READONLY | {"merge"}
# Staging, committing and branch work, so an agent can do its work in its own
# worktree. The line is what git cannot undo — rewriting history or discarding
# uncommitted changes — so each subcommand is allowlisted by flag, and only the
# forms that refuse rather than overwrite pass:
#   add       stages. Not -f (stages an ignored file — a .env — for the next
#             commit to carry), or -p/-i/-e, which wait for input that never comes.
#   commit    adds a commit, which the user can undo — only with -m, since without
#             it git opens an editor and waits. Not --amend (rewrites the last
#             commit), -n/--no-verify (skips the pre-commit hook), or
#             --fixup/--squash (set up a rewrite).
#   branch    lists or creates. Not -d/-D (delete), -m/-M/-c/-C (rename or copy,
#             the capitals over an existing branch), -f (move one), -u (upstream).
#   switch    changes or creates. Not -f/--discard-changes (drop local edits), -C
#             (reset an existing branch), -m (merge local edits into the switch),
#             --orphan, or --ignore-other-worktrees (take a branch another
#             worktree has checked out).
#   checkout  only as `-b <new> [<start>]`. Without -b, `git checkout <word>`
#             overwrites uncommitted edits when <word> is a file rather than a
#             branch, and no syntax tells the two apart. With -b git refuses paths.
# Under branch, switch and checkout a positional is never a path — it is a
# pattern, a commit, a branch name or a start point; under add and commit it is a
# path or a message. A `--flag=value` is checked by its name. Every word is split
# by shell_words, so a quoted message is one word and a quoted flag is still a flag.
GIT_ALLOWED_FLAGS = {
    "add": {"-A", "--all", "-u", "--update", "-N", "--intent-to-add", "-n", "--dry-run",
            "-v", "--verbose", "--"},
    "commit": {"-m", "--message", "-a", "--all", "-q", "--quiet", "--"},
    "branch": {"--list", "-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose",
               "--show-current", "--merged", "--no-merged", "--contains",
               "--no-contains", "--points-at", "--sort"},
    # `-` is the previous branch
    "switch": {"-c", "--create", "-d", "--detach", "-t", "--track", "--no-track",
               "--guess", "--no-guess", "-q", "--quiet", "-"},
    "checkout": {"-b", "-t", "--track", "--no-track", "-q", "--quiet"},
}
# The subcommands that are safe in one form only, and why.
GIT_REQUIRED_FLAGS = {
    "checkout": ({"-b"}, "`git checkout` runs only as `-b <new> [<start>]` — without -b it overwrites "
                         "uncommitted edits when its argument is a file. Change branch with `git switch <branch>`."),
    "commit": ({"-m", "--message"}, "`git commit` runs only with `-m '<message>'`, one -m per paragraph — "
                                    "without it git opens an editor and waits."),
}
# A redirection — `2>&1`, `>out.log`, or an operator alone with its target in the
# next word. Never an argument, so never a flag.
REDIRECT_WORD_RE = re.compile(r"^(?:\d*|&)(?:>>?|<)&?")
# --ext-diff runs an external program from inside log/show.
GIT_DENIED_FLAGS = {"--ext-diff"}
# GIT_EXTERNAL_DIFF, GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT/KEY/VALUE and friends
# inject config or programs. Searched across the whole command, because an
# `export` in an earlier part reaches the git in a later one.
GIT_ENV_RE = re.compile(r"(^|[\s;&|])GIT_[A-Za-z0-9_]*=")

# npx prisma <sub> — everything except these reaches the database or the schema.
PRISMA_READONLY = {"generate", "validate", "format", "version", "--version", "-v"}

# npm run db:* — allowlist, not denylist. A denylist of known-bad script names
# fails open the day someone adds `db:wipe`, and `npm run *` is auto-approved by
# compound-command-allow.sh, so it would land with no prompt at all.
NPM_DB_ALLOWED = {"db:generate"}

# `gh` is permitted for retrieving logs and diagnosing builds, and nothing else.
# Allowlisted by (noun, verb) pair because verbs differ in danger under the same
# noun: `gh run view` reads, `gh run delete` destroys. Anything not listed —
# including subcommands gh adds in future — is denied.
GH_READONLY = {
    "run": {"list", "view", "watch", "download"},
    "workflow": {"list", "view"},
    "pr": {"list", "view", "diff", "checks", "status"},
    "issue": {"list", "view"},
    "release": {"list", "view"},
    "repo": {"view"},
    "cache": {"list"},
    "secret": {"list"},  # names only; `set`/`delete` are not listed
    "auth": {"status"},
    "alias": {"list"},  # so the alias surface stays auditable
}
# Subcommands that take no verb.
GH_NOUN_ONLY = {"status", "version"}
# `gh api` defaults to GET, but these flags silently switch it to POST. They also
# make `gh api graphql` impossible, which is intended: a GraphQL mutation is
# indistinguishable from a read at the flag level.
GH_API_WRITE_FLAGS = {"-f", "-F", "--field", "--raw-field", "--input"}
GH_API_SAFE_METHODS = {"GET", "HEAD"}


def check(part, command):
    """Return a denial reason for this single command, or None.

    `command` is the whole compound command, for rules an earlier part can defeat.
    """
    toks = tokens_of(part)
    if not toks:
        return None
    base = toks[0].split("/")[-1]  # /usr/bin/git -> git

    if base.lstrip("\"'").startswith(("$", "`")):
        # `$SHELL -c …`, `"$X" push`, `$(echo git) push` — the name exists only once expanded
        return "a command named by an expansion cannot be read by this guard — name it plainly."

    if base == "command":
        # `command X` runs X itself, bypassing a shell function of the same name —
        # Claude Code's shell defines grep as one, so `command grep` is the real grep.
        # X is the next word, so it is what gets checked; a scan for the first guarded
        # word, as for the wrappers below, reads `command grep -rn git docs/` as git.
        rest = toks[1:]
        while rest and rest[0] in ("-p", "--"):
            rest = rest[1:]
        if rest and rest[0] in ("-v", "-V"):
            return None  # a lookup: prints where a command is, runs nothing
        return check(" ".join(rest), command)

    if base in WRAPPERS:
        # Skip the wrapper's own options and arguments (`nice -n 10`, `timeout 5`)
        # by checking from the first guarded command onward.
        for i, t in enumerate(toks[1:], start=1):
            if t.split("/")[-1] in GUARDED_BASES or t.split("/")[-1] in DENIED_BASE:
                if base == "xargs":
                    # `echo --amend | xargs git commit -m x` — the flags arrive on stdin
                    return "`xargs` appends arguments from its input, which this guard never sees."
                return check(" ".join(toks[i:]), command)
        return None

    if base in SHELLS or base == "eval":
        return check_command_string(base, shell_words(strip_prefixes(part)), command)

    if base == "find":
        return check_find_exec(shell_words(strip_prefixes(part)), command)

    if base == "git":
        sub = toks[1] if len(toks) > 1 else ""
        if sub in GIT_ALLOWED_FLAGS:
            words = shell_words(strip_prefixes(part))
            reason = check_git_flags(sub, words[2:] if words is not None else None)
            if reason:
                return reason
        elif sub not in GIT_ANY_FLAGS:
            return DENIED_BASE["git"]
        if GIT_DENIED_FLAGS.intersection(toks):
            return "`--ext-diff` makes git run an external program."
        if GIT_ENV_RE.search(command):
            return "a GIT_* variable can make git run a program or read another repository."
        return None

    if base in DENIED_BASE:
        if base == "prisma":
            sub = toks[1] if len(toks) > 1 else ""
            if sub in PRISMA_READONLY:
                return None
        return DENIED_BASE[base]

    if base == "npx":
        rest = [t for t in toks[1:] if not t.startswith("-")]
        if rest and rest[0] == "prisma":
            sub = rest[1] if len(rest) > 1 else ""
            if sub not in PRISMA_READONLY:
                return f"`npx prisma {sub}` touches the database or schema; only generate/validate/format are permitted."
        if rest and rest[0] in DENIED_BASE and rest[0] != "prisma":
            return DENIED_BASE[rest[0]]

    if base == "npm":
        # `npm run X` and `npm --workspace pkg run X` — take the token after run.
        if "run" in toks:
            idx = toks.index("run")
            script = toks[idx + 1] if idx + 1 < len(toks) else ""
            if script.startswith("db:") and script not in NPM_DB_ALLOWED:
                return f"`npm run {script}` reaches the database — the user runs migrations."

    if base == "gh":
        return check_gh(toks)

    return None


def check_git_flags(sub, args):
    """git add|branch|commit|switch|checkout — every flag on that subcommand's allowlist.

    `args` is shell_words() after `git <sub>`, or None for an unclosed quote.
    """
    if args is None:
        return f"`git {sub}` has an unclosed quote."
    flags, skip = [], False
    for raw, value, opaque in args:
        if skip:
            skip = False
            continue
        redirect = REDIRECT_WORD_RE.match(raw)
        if redirect:
            skip = redirect.group() == raw  # the operator alone; its target is next
            continue
        if opaque:
            return (f"`{raw}` reaches `git {sub}` only after the shell expands it, so it cannot be "
                    f"checked — spell it plainly or in single quotes.")
        if value.startswith("-"):
            flags.append(value.split("=", 1)[0])
    for f in flags:
        if f not in GIT_ALLOWED_FLAGS[sub]:
            return (f"`git {sub} {f}` is not on this guard's allowlist for `git {sub}` — spell combined "
                    f"short flags separately, or present it for the user to run.")
    required, reason = GIT_REQUIRED_FLAGS.get(sub, (None, None))
    if required and not required.intersection(flags):
        return reason
    return None


def check_command_string(base, words, command):
    """sh -c '…', bash -lc '…' and eval … — the string they run, checked as if typed.

    `words` is shell_words() of the whole command, or None for an unclosed quote.
    """
    if words is None:
        return f"`{base}` has an unclosed quote."
    args = words[1:]
    if base == "eval":
        strings = [" ".join(value for _, value, _ in args)]
    else:
        strings = [value for _, value, _ in args if not value.startswith("-")]
        short_flags = [value[1:] for _, value, _ in args if value.startswith("-") and not value.startswith("--")]
        if not any("c" in f for f in short_flags):
            if strings:
                return None  # runs a script file, which is out of this guard's reach
            return f"`{base}` reads its commands from stdin, which this guard never sees."
    if any(opaque for _, _, opaque in args):
        return f"`{base}` runs a command the shell builds first, which this guard cannot read."
    for s in strings:  # a shell's -c string is one of them; the rest are $0 and its arguments
        for p in all_parts(s):
            reason = check(p, command)
            if reason:
                return reason
    return None


def check_find_exec(words, command):
    """find -exec|-execdir|-ok|-okdir — each command it runs, checked as if typed."""
    if words is None:
        return "`find` has an unclosed quote."
    run = None
    for raw, value, _ in words[1:]:
        if run is None:
            if value in FIND_EXEC:
                run = []
        elif value in (";", "+"):
            reason = check(" ".join(run), command)
            if reason:
                return reason
            run = None
        else:
            run.append(raw)
    return check(" ".join(run), command) if run else None


def check_gh(toks):
    """gh is allowlisted by (noun, verb) pair; everything else is denied."""
    rest = [t for t in toks[1:] if not t.startswith("-")]
    noun = rest[0] if rest else ""

    if not noun:
        return "bare `gh` does nothing useful; use an explicit read-only subcommand."

    if noun in GH_NOUN_ONLY:
        return None

    if noun == "api":
        flags = [t for t in toks if t.startswith("-")]
        for f in flags:
            key = f.split("=", 1)[0]
            if key in GH_API_WRITE_FLAGS:
                return f"`gh api {key}` switches the request to POST — only GET is permitted."
            if key in ("-X", "--method"):
                # value may be attached (--method=POST) or the next token
                val = f.split("=", 1)[1] if "=" in f else ""
                if not val:
                    i = toks.index(f)
                    val = toks[i + 1] if i + 1 < len(toks) else ""
                if val.upper() not in GH_API_SAFE_METHODS:
                    return f"`gh api --method {val}` mutates the repository."
        if len(rest) > 1 and rest[1] == "graphql":
            return "`gh api graphql` can carry a mutation that looks identical to a read."
        return None

    if noun not in GH_READONLY:
        return (
            f"`gh {noun}` is not on the read-only allowlist. gh is permitted only for "
            f"retrieving logs and diagnosing builds, never for modifying the repository. "
            f"(An alias such as `gh co` resolves to a different subcommand and is denied "
            f"for the same reason.)"
        )

    verb = rest[1] if len(rest) > 1 else ""
    if verb not in GH_READONLY[noun]:
        allowed = "|".join(sorted(GH_READONLY[noun]))
        return f"`gh {noun} {verb}` modifies state; only `gh {noun} {allowed}` are permitted."

    return None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # unparseable input is not our call to make
    command = data.get("tool_input", {}).get("command", "")
    if not command:
        sys.exit(0)

    for part in all_parts(command):
        reason = check(part, command)
        if reason:
            sys.stderr.write(
                f"Blocked by .claude/hooks/guard-destructive.py: {reason}\n"
                f"Offending command: {part}\n"
            )
            sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
