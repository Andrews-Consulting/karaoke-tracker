LOG=${CLAUDE_HOOK_LOG:-/tmp/claude-hook-debug.log}
log() { echo "[hook] $*" >> "$LOG"; }

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)
[ -z "$COMMAND" ] && exit 0

# Split into parts on ; | && || newline, background & and the ( ) of a subshell,
# then check each part's base command against the allowlist below. A `)` leaves its
# trailing redirections as a part of their own — `(a && b) > log 2>&1` gives a, b and
# `> log 2>&1` — which the loop passes. Comments are stripped by the splitter
# (quote-aware — a bare sed 's/#.*//' would mangle 'echo "### heading"' and any
# pattern containing #).
#
# The splitter also exits 3 on command or process substitution — $( ` <( >( —
# anywhere outside single quotes: it runs a command the per-part checks below would
# never see. Single quotes are the only place it is literal, so a backtick in an awk
# program is allowed and echo "$(rm …)" is not. That makes the quote tracking
# load-bearing: an escaped \' outside quotes, and the \' inside $'…', open or close
# nothing, and a wrongly-opened quote would hide everything after it.
PARTS=$(python3 -c '
import sys

def split_shell_ops(cmd):
    parts = []
    current = []
    i = 0
    n = len(cmd)
    in_single = False
    in_ansi = False  # inside an ANSI-C ($ + single) quote, where a backslash escapes — in plain single quotes it does not
    in_double = False
    escaped_to = -1  # index just past the last backslash escape
    while i < n:
        c = cmd[i]
        if not in_single and (c == "\x60" or cmd.startswith(("$(", "<(", ">("), i)):
            sys.exit(3)
        if c == "\x27" and not in_double:
            in_single = not in_single
            in_ansi = False
            current.append(c); i += 1
        elif c == "\x22" and not in_single:
            in_double = not in_double
            current.append(c); i += 1
        elif c == "\x5c" and (in_ansi or not in_single) and i + 1 < n:
            # backslash escape — keep both chars
            current.append(c); current.append(cmd[i+1]); i += 2
            escaped_to = i
        elif not in_single and not in_double:
            rest = cmd[i:]
            if rest.startswith("$\x27"):
                in_single = in_ansi = True
                current.append(rest[:2]); i += 2
            elif c == "#" and (i == 0 or (cmd[i-1] in " \t\n" and escaped_to != i)):
                # comment: only at the start of a word, outside quotes — an escaped
                # space is part of the word before it
                while i < n and cmd[i] != "\n":
                    i += 1
            elif rest.startswith("&&") or rest.startswith("||") or rest.startswith(";;"):
                parts.append("".join(current).strip()); current = []; i += 2
            elif c in (";", "|", "\n", "(", ")"):
                parts.append("".join(current).strip()); current = []; i += 1
            elif c == "&" and cmd[i-1:i] != ">" and cmd[i+1:i+2] != ">":
                # backgrounding & is a separator; >& and &> are redirections
                parts.append("".join(current).strip()); current = []; i += 1
            else:
                current.append(c); i += 1
        else:
            current.append(c); i += 1
    if current:
        parts.append("".join(current).strip())
    return [p for p in parts if p]

for p in split_shell_ops(sys.stdin.read().strip()):
    # a newline can only survive inside quotes; flatten so one part is one line
    print(p.replace("\n", " "))
' <<< "$COMMAND") || { log "UNSAFE: substitution outside single quotes, or the splitter failed"; exit 0; }

ALL_SAFE=true
while IFS= read -r part; do
    part=$(echo "$part" | sed 's/^\s*//;s/\s*$//')
    [ -z "$part" ] && continue
    # Nothing but redirections — what a subshell's `)` leaves behind — runs nothing.
    # Its file writes are the ones `echo x > f` already gets; a command anywhere in
    # the part fails the match and is checked below as an unknown base.
    REDIR='([0-9]*|&)(>>?|<)&?[[:space:]]*[^[:space:]&<>]+'
    echo "$part" | grep -qE "^$REDIR([[:space:]]+$REDIR)*\$" && continue
    # Strip leading redirections (e.g. 2>&1 or >/dev/null) before extracting the command name
    STRIPPED=$(echo "$part" | sed 's/^[0-9]*>[&>][^ ]*[[:space:]]*//; s/^[0-9]*<[^ ]*[[:space:]]*//')
    # Strip leading control-flow keywords so the command they introduce is the one
    # checked. Safe because every command in a loop/conditional body lands in its
    # own part: `for d in *; do rm -rf $d; done` is still denied, on the rm.
    while :; do
        KW=$(echo "$STRIPPED" | awk '{print $1}')
        case "$KW" in
            do|then|else|elif|if|while|until|time|!|'{')
                STRIPPED=$(echo "$STRIPPED" | sed 's/^[^[:space:]]*[[:space:]]*//')
                [ -z "$STRIPPED" ] && break
                ;;
            command)
                # `command X` runs X itself, bypassing a shell function of the same name —
                # Claude Code's shell defines grep as one, so `command grep` is the real grep.
                # X is what gets checked; `command -v X` only looks X up and runs nothing.
                STRIPPED=$(echo "$STRIPPED" | sed 's/^[^[:space:]]*[[:space:]]*//')
                case "$(echo "$STRIPPED" | awk '{print $1}')" in -v|-V) STRIPPED= ;; esac
                [ -z "$STRIPPED" ] && break
                ;;
            *) break ;;
        esac
    done
    [ -z "$STRIPPED" ] && continue
    BASE=$(echo "$STRIPPED" | awk '{print $1}')
    case "$BASE" in
        # bare block terminators — nothing executes
        done|fi|esac|'}') ;;
        # loop header: the `in` list is data, not commands. Reject anything with a
        # redirection or separator smuggled in.
        for)
            echo "$STRIPPED" | grep -qE '^for[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]+in[[:space:]]+[^;&|<>]*$' \
                || { log "UNSAFE: for header '$STRIPPED'"; ALL_SAFE=false; break; }
            ;;
        cd|pushd|popd|pwd) ;;
        cat|head|tail|less|wc|ls|stat|du|file|tree|realpath) ;;
        # find: block -exec/-execdir which run arbitrary subcommands
        find)
            echo "$part" | grep -qE '\-exec(dir)?' && { log "UNSAFE: find -exec"; ALL_SAFE=false; break; }
            ;;
        # gh: only `gh run|pr list|view` — the reads an agent needs to fetch CI logs and
        # PR state without a prompt. The noun must be the first argument, so a global
        # flag before it (`gh --repo o/r run list`) prompts. guard-destructive.py permits
        # a wider read-only set (diff, checks, issue, api GET…); those still prompt, and
        # it blocks every write whatever this script says.
        gh)
            SUBCMD=$(echo "$STRIPPED" | awk '{print $2}')
            GHARG=$(echo "$STRIPPED" | awk '{print $3}')
            case "$SUBCMD $GHARG" in
                "run list"|"run view"|"pr list"|"pr view") ;;
                *) log "UNSAFE: gh $SUBCMD $GHARG"; ALL_SAFE=false; break ;;
            esac
            ;;
        # which/grep/rg/awk/sort/uniq/cut/tr/tee/jq/yq/diff/cmp/comm are read-only; allow them.
        # xargs is excluded — it executes whatever follows and is too broad to allowlist safely.
        which|grep|rg|awk|sort|uniq|cut|tr|tee|jq|yq|diff|cmp|comm|docker) ;;
        sed) ;;
        #     # Block in-place edits (short and long form, combined flags).
        #     # Strip quoted strings first so -i inside sed patterns (e.g. 's/path-index/x/') doesn't false-positive.
        #     UNQUOTED=$(python3 -c "import sys,re; s=sys.stdin.read(); s=re.sub(r\"'[^']*'\", '', s); s=re.sub(r'\"[^\"]*\"', '', s); print(s)" <<< "$part")
        #     echo "$UNQUOTED" | grep -qE '(^|\s)--in-place(\s|$)' && { log "UNSAFE: sed --in-place"; ALL_SAFE=false; break; }
        #     echo "$UNQUOTED" | grep -qE '(^|\s)-[a-zA-Z]*i[a-zA-Z]*(\s|$)' && { log "UNSAFE: sed -i"; ALL_SAFE=false; break; }
        #     ;;
        echo|printf|true|false|test|'['|'[['|read|export|set|env|date) ;;
        git)
            # Whatever guard-destructive.py lets through. It owns the git rules — which
            # subcommands, which flags and why each missing one is missing — and splits words
            # the way the shell does, which a quoted commit message needs; a copy here would
            # drift. A guard that is missing or fails lands here as a prompt, never an approval.
            GUARD_INPUT=$(python3 -c 'import json, sys; print(json.dumps({"tool_input": {"command": sys.argv[1]}}))' "$part") \
                && printf '%s\n' "$GUARD_INPUT" | python3 "$(dirname "${BASH_SOURCE[0]}")/guard-destructive.py" 2>/dev/null \
                || { log "UNSAFE: guard-destructive.py denies '$part'"; ALL_SAFE=false; break; }
            ;;
        npm)
            SUBCMD=$(echo "$part" | grep -oE '\b(test|run|ls|list|info|view|outdated|audit|lint)\b' | head -1)
            case "$SUBCMD" in
                test|run|ls|list|info|view|outdated|audit|lint) ;;
                *) log "UNSAFE: npm $SUBCMD"; ALL_SAFE=false; break ;;
            esac
            ;;
        npx)
            SUBCMD=$(echo "$STRIPPED" | awk '{print $2}')
            case "$SUBCMD" in
                playwright) ;;
                vitest) ;;
                tsc) ;;
                eslint) ;;
                type-coverage) ;;
                prisma)
                    PRISMAARG=$(echo "$STRIPPED" | awk '{print $3}')
                    # Only allow 'generate' — migrate/push/reset touch the database
                    [ "$PRISMAARG" != "generate" ] && { log "UNSAFE: npx prisma $PRISMAARG"; ALL_SAFE=false; break; }
                    ;;
                *) log "UNSAFE: npx $SUBCMD"; ALL_SAFE=false; break ;;
            esac
            ;;
        node)
            SUBCMD=$(echo "$STRIPPED" | awk '{print $2}')
            case "$SUBCMD" in
                *..*) log "UNSAFE: node path traversal"; ALL_SAFE=false; break ;;
                scripts/*|./scripts/*) ;;
                *) log "UNSAFE: node $SUBCMD"; ALL_SAFE=false; break ;;
            esac
            ;;
        python|python3)
            SCRIPT=$(echo "$STRIPPED" | awk '{print $2}')
            # an absolute path inside the project matches the same relative entry
            SCRIPT=${SCRIPT#"$CLAUDE_PROJECT_DIR"/}
            case "$SCRIPT" in
                .claude/hooks/guard-destructive.test.py|\
                .claude/hooks/compound-command-allow.test.py) ;;
                *) echo "$part" | grep -qE 'python3?\s+(-c|-m\s+(json|py_compile|pytest))' || { log "UNSAFE: python"; ALL_SAFE=false; break; } ;;
            esac
            ;;
        bash)
            # Syntax check only, and exactly `bash -n <file>`: -n is ignored by
            # interactive shells (`bash -n -i`), and a flag after the file is passed
            # to the script (`bash x.sh -n` runs it), so nothing else is accepted
            NARGS=$(echo "$STRIPPED" | awk '{print NF}')
            FLAG=$(echo "$STRIPPED" | awk '{print $2}')
            FILE=$(echo "$STRIPPED" | awk '{print $3}')
            if [ "$NARGS" != 3 ] || [ "$FLAG" != "-n" ] || [ "${FILE#-}" != "$FILE" ]; then
                log "UNSAFE: bash $FLAG"; ALL_SAFE=false; break
            fi
            ;;
        mkdir|touch) ;;
        curl)
            # Block mutating requests: explicit method flag or body-sending flags
            echo "$part" | grep -qE '(\s-X\s+(POST|PUT|PATCH|DELETE)|\s(--data|-d|--data-raw|--data-binary|--upload-file|-T|--request)\s)' && { log "UNSAFE: curl mutating"; ALL_SAFE=false; break; }
            ;;
        source)
            # Only allow sourcing the nvm setup script
            echo "$part" | grep -qE 'source\s+~/.nvm/nvm.sh' || { log "UNSAFE: source arbitrary file"; ALL_SAFE=false; break; }
            ;;
        *) log "UNSAFE: unknown base '$BASE'"; ALL_SAFE=false; break ;;
    esac
done <<< "$PARTS"
if [ "$ALL_SAFE" = true ]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"All components of compound command are safe"}}'
fi
exit 0
