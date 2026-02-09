#!/bin/bash
#
# Ralph Wiggum Method - Autonomous Claude Code Loop with Beads Integration
#
# Automatically picks up the next ready issue from beads and works on it
# until completion, then closes the issue and moves to the next one.
# When no issues are ready, polls every 30 seconds until work becomes available.
#
# Usage:
#   ./ralph.sh [options]
#
# Options:
#   --max-iterations N       Stop after N iterations per issue (default: 50)
#   --model MODEL            Claude model to use (default: sonnet)
#   --single                 Only complete one issue, then exit
#   --issue ID               Work on a specific issue instead of next ready
#   --dry-run                Show what would be done without running
#   --daemon                 Keep running and poll for issues every 5 minutes
#   --poll-interval N        Poll interval in minutes when in daemon mode (default: 5)
#
# Example:
#   ./ralph.sh --max-iterations 20
#   ./ralph.sh --issue usg-kl5.1
#

set -e

# Default configuration
MAX_ITERATIONS=50
COMPLETION_PROMISE="RALPH_COMPLETE"
MODEL="opus"
SINGLE_ISSUE=false
SPECIFIC_ISSUE=""
DRY_RUN=false

# jq filters for streaming JSON output
JQ_STREAM_TEXT='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'
JQ_FINAL_RESULT='select(.type == "result").result // empty'

# Logging setup
LOG_DIR=".ralph"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/ralph_$(date +%Y%m%d).log"

# Find bd executable (prefer local ./bd, then bd in PATH)
if [[ -x "./bd" ]]; then
    BD="./bd"
elif command -v bd &> /dev/null; then
    BD="bd"
else
    echo "Error: bd executable not found. Install beads or place bd in current directory."
    exit 1
fi

# Logging function - writes to both console and log file
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" >> "$LOG_FILE"
}

log_both() {
    local msg="$*"
    echo -e "$msg"
    # Strip ANSI color codes for log file
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(echo -e "$msg" | sed 's/\x1b\[[0-9;]*m//g')" >> "$LOG_FILE"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --model)
            MODEL="$2"
            shift 2
            ;;
        --single)
            SINGLE_ISSUE=true
            shift
            ;;
        --issue)
            SPECIFIC_ISSUE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Ralph Wiggum Method - Autonomous Claude Code Loop with Beads"
            echo ""
            echo "Automatically picks up ready issues from beads and works on them."
            echo "Polls every 30 seconds when no issues are ready."
            echo ""
            echo "Usage: ./ralph.sh [options]"
            echo ""
            echo "Options:"
            echo "  --max-iterations N  Max iterations per issue (default: 50)"
            echo "  --model MODEL       Claude model to use (default: sonnet)"
            echo "  --single            Only complete one issue, then exit"
            echo "  --issue ID          Work on specific issue instead of next ready"
            echo "  --dry-run           Show what would be done without running"
            echo "  --help, -h          Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./ralph.sh                           # Process all ready issues"
            echo "  ./ralph.sh --single                  # Process one issue"
            echo "  ./ralph.sh --issue usg-kl5.1         # Process specific issue"
            exit 0
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}"
            exit 1
            ;;
    esac
done

# Function to get next ready issue
get_next_issue() {
    if [[ -n "$SPECIFIC_ISSUE" ]]; then
        echo "$SPECIFIC_ISSUE"
        SPECIFIC_ISSUE=""  # Clear so we don't repeat
        return 0
    fi

    # Get the first ready issue ID
    local ready_output
    ready_output=$($BD ready 2>/dev/null || true)

    # Extract first issue ID — grabs the token after "] " and before ":"
    # Works with any beads prefix
    local issue_id
    issue_id=$(echo "$ready_output" | grep -oP '(?<=\] )[^\s:]+(?=:)' | head -1)

    if [[ -z "$issue_id" ]]; then
        return 1
    fi

    echo "$issue_id"
}

# Function to get issue details as JSON
get_issue_json() {
    local issue_id="$1"
    $BD show "$issue_id" --json 2>/dev/null
}

# Function to extract title from JSON (simple grep approach - no jq needed)
get_issue_title() {
    local json="$1"
    echo "$json" | grep -oP '"title":\s*"\K[^"]+' | head -1
}

# Function to extract description from JSON
get_issue_description() {
    local json="$1"
    # Extract description field, then unescape newlines
    echo "$json" | grep -oP '"description":\s*"\K[^"]+(?:\\.[^"]*)*' | head -1 | sed 's/\\n/\n/g'
}

# Function to extract acceptance criteria from JSON
get_issue_acceptance() {
    local json="$1"
    echo "$json" | grep -oP '"acceptance_criteria":\s*"\K[^"]+(?:\\.[^"]*)*' | head -1 | sed 's/\\n/\n/g'
}

# Trap Ctrl+C for graceful exit
cleanup() {
    log_both "\n${YELLOW}Ralph loop cancelled by user.${NC}"
    if [[ -n "$CURRENT_ISSUE" ]]; then
        log_both "${YELLOW}Issue ${CURRENT_ISSUE} left in_progress. Run '${BD} update ${CURRENT_ISSUE} --status=open' to reset.${NC}"
    fi
    rm -f "$TEMP_OUTPUT" 2>/dev/null
    log "Session ended (interrupted)"
    exit 130
}
trap cleanup INT

# Print header
log_both "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
log_both "${BLUE}║${NC}     ${GREEN}Ralph Wiggum Method - Beads Integration${NC}               ${BLUE}║${NC}"
log_both "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
log_both ""
log_both "${YELLOW}Configuration:${NC}"
log_both "  Max iterations/issue: ${MAX_ITERATIONS}"
log_both "  Model:                ${MODEL}"
log_both "  Mode:                 $([ "$SINGLE_ISSUE" = true ] && echo 'Single issue' || echo 'Continuous')"
log_both "  Log file:             ${LOG_FILE}"
if [[ -n "$SPECIFIC_ISSUE" ]]; then
    log_both "  Target issue:         ${SPECIFIC_ISSUE}"
fi
log_both ""
log "=== Session started ==="

# Create temp file for capturing output
TEMP_OUTPUT=$(mktemp)
CURRENT_ISSUE=""
ISSUES_COMPLETED=0
TOTAL_START_TIME=$(date +%s)

# Main issue loop
while true; do
    # Get next ready issue
    ISSUE_ID=$(get_next_issue || true)

    if [[ -z "$ISSUE_ID" ]]; then
        log_both "${CYAN}No ready issues found. Waiting 30 seconds before checking again...${NC}"
        log "No ready issues - sleeping for 30 seconds"
        sleep 30
        continue
    fi

    CURRENT_ISSUE="$ISSUE_ID"

    # Get issue details as JSON
    ISSUE_JSON=$(get_issue_json "$ISSUE_ID")
    ISSUE_TITLE=$(get_issue_title "$ISSUE_JSON")
    ISSUE_DESC=$(get_issue_description "$ISSUE_JSON")
    ISSUE_ACCEPT=$(get_issue_acceptance "$ISSUE_JSON")

    log_both "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    log_both "${BLUE}  Issue: ${ISSUE_ID}${NC}"
    log_both "${BLUE}  Title: ${ISSUE_TITLE}${NC}"
    log_both "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    log_both ""
    log "Starting work on issue: ${ISSUE_ID} - ${ISSUE_TITLE}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_both "${YELLOW}[DRY RUN] Would work on this issue${NC}"
        log_both "${YELLOW}Description:${NC}"
        echo "$ISSUE_DESC"
        log_both ""
        if [[ "$SINGLE_ISSUE" == "true" ]]; then
            break
        fi
        continue
    fi

    # Mark issue as in_progress
    log_both "${CYAN}Marking issue as in_progress...${NC}"
    $BD update "$ISSUE_ID" --status=in_progress 2>/dev/null || true

    # Build prompt from issue (include acceptance criteria if present)
    ACCEPTANCE_SECTION=""
    if [[ -n "$ISSUE_ACCEPT" ]]; then
        ACCEPTANCE_SECTION="
## Acceptance Criteria:
${ISSUE_ACCEPT}
"
    fi

    PROMPT="You are working on beads issue: ${ISSUE_ID}

## Task: ${ISSUE_TITLE}

## Description:
${ISSUE_DESC}
${ACCEPTANCE_SECTION}
## Instructions:
1. Implement this task completely
2. Follow existing code patterns in the codebase
3. Run tests if applicable to verify your changes
4. Check git status/diff to see your progress
5. Ensure ALL acceptance criteria are met before completing
6. NEVER add Co-Authored-By, AI attribution, or any Claude/AI references in git commits

When the task is FULLY complete and verified, output exactly: <promise>${COMPLETION_PROMISE}</promise>

If you get stuck after multiple attempts, document what's blocking you and output the promise anyway."

    # Iteration loop for this issue
    ITERATION=0
    COMPLETED=false
    ISSUE_START_TIME=$(date +%s)

    while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
        ITERATION=$((ITERATION + 1))

        log_both ""
        log_both "${GREEN}─── Iteration ${ITERATION}/${MAX_ITERATIONS} ───${NC}"
        log_both ""
        log "Issue ${ISSUE_ID}: Starting iteration ${ITERATION}/${MAX_ITERATIONS}"

        # Build the prompt with iteration context
        LOOP_PROMPT="$PROMPT

---
[Ralph Wiggum Loop - Iteration ${ITERATION}/${MAX_ITERATIONS}]
Check git status/diff to see your previous work in this session."

        # Run Claude Code with streaming JSON output
        # Stream text to console and log file in real-time while capturing full output
        if claude --model "$MODEL" --verbose --print --dangerously-skip-permissions --output-format stream-json -p "$LOOP_PROMPT" 2>&1 \
            | grep --line-buffered '^{' \
            | tee "$TEMP_OUTPUT" \
            | jq --unbuffered -rj "$JQ_STREAM_TEXT" \
            | tee -a "$LOG_FILE"; then

            # Check for completion promise in output
            # First check the result field, then fall back to checking full JSON output
            RESULT=$(jq -r "$JQ_FINAL_RESULT" "$TEMP_OUTPUT" 2>/dev/null || echo "")

            if [[ "$RESULT" == *"$COMPLETION_PROMISE"* ]] || grep -q "$COMPLETION_PROMISE" "$TEMP_OUTPUT"; then
                COMPLETED=true
                log_both ""
                log_both "${GREEN}✓ Completion promise detected!${NC}"
                log_both "Issue ${ISSUE_ID}: Completion promise detected at iteration ${ITERATION}"
                break
            fi
        else
            log_both "${YELLOW}Warning: Claude exited with non-zero status. Continuing...${NC}"
            log_both "Issue ${ISSUE_ID}: Claude exited with non-zero status at iteration ${ITERATION}"
        fi

        # Brief pause between iterations
        sleep 2
    done

    # Calculate time for this issue
    ISSUE_END_TIME=$(date +%s)
    ISSUE_ELAPSED=$((ISSUE_END_TIME - ISSUE_START_TIME))
    ISSUE_MIN=$((ISSUE_ELAPSED / 60))
    ISSUE_SEC=$((ISSUE_ELAPSED % 60))

    # Handle completion
    if [[ "$COMPLETED" == "true" ]]; then
        log_both ""
        log_both "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        log_both "${GREEN}║  Issue ${ISSUE_ID} completed in ${ISSUE_MIN}m ${ISSUE_SEC}s${NC}"
        log_both "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
        log "Issue ${ISSUE_ID}: COMPLETED in ${ISSUE_MIN}m ${ISSUE_SEC}s (${ITERATION} iterations)"

        # Close the issue
        log_both "${CYAN}Closing issue...${NC}"
        $BD close "$ISSUE_ID" 2>/dev/null || true

        # Sync beads
        log_both "${CYAN}Syncing beads...${NC}"
        $BD sync 2>/dev/null || true

        # Commit and push changes
        log_both "${CYAN}Committing and pushing changes...${NC}"
        if git diff --quiet && git diff --cached --quiet; then
            log_both "${YELLOW}No changes to commit${NC}"
            log "Issue ${ISSUE_ID}: No changes to commit"
        else
            git add -A
            git commit -m "Complete ${ISSUE_ID}: ${ISSUE_TITLE}" || true
            git push || log_both "${YELLOW}Warning: git push failed${NC}"
            log "Issue ${ISSUE_ID}: Changes committed and pushed"
        fi

        ISSUES_COMPLETED=$((ISSUES_COMPLETED + 1))
        CURRENT_ISSUE=""
    else
        log_both ""
        log_both "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
        log_both "${YELLOW}║  Max iterations reached for ${ISSUE_ID}${NC}"
        log_both "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
        log_both "${YELLOW}Issue left as in_progress. Review and continue manually.${NC}"
        log "Issue ${ISSUE_ID}: MAX ITERATIONS REACHED - left as in_progress"
        CURRENT_ISSUE=""
    fi

    # Check if we should continue
    if [[ "$SINGLE_ISSUE" == "true" ]]; then
        break
    fi

    log_both ""
    log_both "${CYAN}Looking for next ready issue...${NC}"
    sleep 2
done

# Cleanup
rm -f "$TEMP_OUTPUT"

# Calculate total elapsed time
TOTAL_END_TIME=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END_TIME - TOTAL_START_TIME))
TOTAL_MIN=$((TOTAL_ELAPSED / 60))
TOTAL_SEC=$((TOTAL_ELAPSED % 60))

# Final summary
log_both ""
log_both "${BLUE}════════════════════════════════════════════════════════════════${NC}"
log_both "${BLUE}                    Ralph Session Complete                      ${NC}"
log_both "${BLUE}════════════════════════════════════════════════════════════════${NC}"
log_both ""
log_both "  Issues completed: ${ISSUES_COMPLETED}"
log_both "  Total time:       ${TOTAL_MIN}m ${TOTAL_SEC}s"
log_both "  Log file:         ${LOG_FILE}"
log_both ""

log_both "=== Session ended: ${ISSUES_COMPLETED} issues completed in ${TOTAL_MIN}m ${TOTAL_SEC}s ==="

if [[ $ISSUES_COMPLETED -gt 0 ]]; then
    log_both "${GREEN}All changes have been committed and pushed.${NC}"
fi
