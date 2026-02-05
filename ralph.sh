#!/bin/bash
#
# Ralph Wiggum Method - Autonomous Claude Code Loop with Beads Integration
#
# Automatically picks up the next ready issue from beads and works on it
# until completion, then closes the issue and moves to the next one.
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
#
# Example:
#   ./ralph.sh --max-iterations 20
#   ./ralph.sh --issue ScriptureCipher-o6i
#

set -e

# Default configuration
MAX_ITERATIONS=50
COMPLETION_PROMISE="RALPH_COMPLETE"
MODEL="opus"
SINGLE_ISSUE=false
SPECIFIC_ISSUE=""
DRY_RUN=false

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
            echo "  ./ralph.sh --issue ScriptureCipher-o6i  # Process specific issue"
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
    ready_output=$(bd ready 2>/dev/null || true)

    # Extract first issue ID (format: "1. [● P2] [task] ScriptureCipher-xxx: Title")
    local issue_id
    issue_id=$(echo "$ready_output" | grep -oE 'ScriptureCipher-[a-z0-9]+' | head -1)

    if [[ -z "$issue_id" ]]; then
        return 1
    fi

    echo "$issue_id"
}

# Function to get issue details
get_issue_details() {
    local issue_id="$1"
    bd show "$issue_id" 2>/dev/null
}

# Function to extract title from issue details
get_issue_title() {
    local details="$1"
    echo "$details" | grep -E "^Title:" | sed 's/^Title: *//'
}

# Function to extract description from issue details
get_issue_description() {
    local details="$1"
    # Extract everything after "Description:" until the next section
    echo "$details" | sed -n '/^Description:/,/^[A-Z][a-z]*:/p' | tail -n +2 | head -n -1
}

# Trap Ctrl+C for graceful exit
cleanup() {
    echo -e "\n${YELLOW}Ralph loop cancelled by user.${NC}"
    if [[ -n "$CURRENT_ISSUE" ]]; then
        echo -e "${YELLOW}Issue ${CURRENT_ISSUE} left in_progress. Run 'bd update ${CURRENT_ISSUE} --status=open' to reset.${NC}"
    fi
    rm -f "$TEMP_OUTPUT" 2>/dev/null
    exit 130
}
trap cleanup INT

# Print header
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}     ${GREEN}Ralph Wiggum Method - Beads Integration${NC}               ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Max iterations/issue: ${MAX_ITERATIONS}"
echo -e "  Model:                ${MODEL}"
echo -e "  Mode:                 $([ "$SINGLE_ISSUE" = true ] && echo 'Single issue' || echo 'Continuous')"
if [[ -n "$SPECIFIC_ISSUE" ]]; then
    echo -e "  Target issue:         ${SPECIFIC_ISSUE}"
fi
echo ""

# Create temp file for capturing output
TEMP_OUTPUT=$(mktemp)
CURRENT_ISSUE=""
ISSUES_COMPLETED=0
TOTAL_START_TIME=$(date +%s)

# Main issue loop
while true; do
    # Get next ready issue
    ISSUE_ID=$(get_next_issue)

    if [[ -z "$ISSUE_ID" ]]; then
        echo -e "${CYAN}No ready issues found. All done!${NC}"
        break
    fi

    CURRENT_ISSUE="$ISSUE_ID"

    # Get issue details
    ISSUE_DETAILS=$(get_issue_details "$ISSUE_ID")
    ISSUE_TITLE=$(get_issue_title "$ISSUE_DETAILS")
    ISSUE_DESC=$(get_issue_description "$ISSUE_DETAILS")

    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Issue: ${ISSUE_ID}${NC}"
    echo -e "${BLUE}  Title: ${ISSUE_TITLE}${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would work on this issue${NC}"
        echo -e "${YELLOW}Description:${NC}"
        echo "$ISSUE_DESC"
        echo ""
        if [[ "$SINGLE_ISSUE" == "true" ]]; then
            break
        fi
        continue
    fi

    # Mark issue as in_progress
    echo -e "${CYAN}Marking issue as in_progress...${NC}"
    bd update "$ISSUE_ID" --status=in_progress 2>/dev/null || true

    # Build prompt from issue
    PROMPT="You are working on beads issue: ${ISSUE_ID}

## Task: ${ISSUE_TITLE}

## Description:
${ISSUE_DESC}

## Instructions:
1. Implement this task completely
2. Follow existing code patterns in the codebase
3. Run tests if applicable to verify your changes
4. Check git status/diff to see your progress

When the task is FULLY complete and verified, output exactly: <promise>${COMPLETION_PROMISE}</promise>

If you get stuck after multiple attempts, document what's blocking you and output the promise anyway."

    # Iteration loop for this issue
    ITERATION=0
    COMPLETED=false
    ISSUE_START_TIME=$(date +%s)

    while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
        ITERATION=$((ITERATION + 1))

        echo ""
        echo -e "${GREEN}─── Iteration ${ITERATION}/${MAX_ITERATIONS} ───${NC}"
        echo ""

        # Build the prompt with iteration context
        LOOP_PROMPT="$PROMPT

---
[Ralph Wiggum Loop - Iteration ${ITERATION}/${MAX_ITERATIONS}]
Check git status/diff to see your previous work in this session."

        # Run Claude Code and capture output
        if claude --model "$MODEL" --print --dangerously-skip-permissions -p "$LOOP_PROMPT" 2>&1 | tee "$TEMP_OUTPUT"; then
            # Check for completion promise in output
            if grep -q "$COMPLETION_PROMISE" "$TEMP_OUTPUT"; then
                COMPLETED=true
                echo ""
                echo -e "${GREEN}✓ Completion promise detected!${NC}"
                break
            fi
        else
            echo -e "${YELLOW}Warning: Claude exited with non-zero status. Continuing...${NC}"
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
        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  Issue ${ISSUE_ID} completed in ${ISSUE_MIN}m ${ISSUE_SEC}s${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"

        # Close the issue
        echo -e "${CYAN}Closing issue...${NC}"
        bd close "$ISSUE_ID" 2>/dev/null || true

        # Commit and push changes
        echo -e "${CYAN}Committing and pushing changes...${NC}"
        if git diff --quiet && git diff --cached --quiet; then
            echo -e "${YELLOW}No changes to commit${NC}"
        else
            git add -A
            git commit -m "Complete ${ISSUE_ID}: ${ISSUE_TITLE}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" || true
            git push || echo -e "${YELLOW}Warning: git push failed${NC}"
        fi

        ISSUES_COMPLETED=$((ISSUES_COMPLETED + 1))
        CURRENT_ISSUE=""
    else
        echo ""
        echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║  Max iterations reached for ${ISSUE_ID}${NC}"
        echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
        echo -e "${YELLOW}Issue left as in_progress. Review and continue manually.${NC}"
        CURRENT_ISSUE=""
    fi

    # Check if we should continue
    if [[ "$SINGLE_ISSUE" == "true" ]]; then
        break
    fi

    echo ""
    echo -e "${CYAN}Looking for next ready issue...${NC}"
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
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    Ralph Session Complete                      ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Issues completed: ${ISSUES_COMPLETED}"
echo -e "  Total time:       ${TOTAL_MIN}m ${TOTAL_SEC}s"
echo ""

if [[ $ISSUES_COMPLETED -gt 0 ]]; then
    echo -e "${GREEN}All changes have been committed and pushed.${NC}"
fi
