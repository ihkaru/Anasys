#!/bin/bash
#
# detect_god_files.sh
# Detect "God Files" (files with more than 400 lines of code)
# These are candidates for refactoring.
#
# Usage: ./detect_god_files.sh [threshold] [directory]
# Example: ./detect_god_files.sh 400 .
#

# Default threshold
THRESHOLD=${1:-400}
SEARCH_DIR=${2:-.}

echo "🔍 Detecting God Files (>${THRESHOLD} lines)"
echo "   Directory: $SEARCH_DIR"
echo "   Excluding: node_modules, vendor, dist, .git, csv, txt, lock files"
echo "=============================================="
echo ""

# Find and count lines, excluding unwanted directories and files
find "$SEARCH_DIR" -type f \
    -name "*.ts" -o \
    -name "*.tsx" -o \
    -name "*.js" -o \
    -name "*.jsx" -o \
    -name "*.vue" -o \
    -name "*.py" -o \
    -name "*.go" -o \
    -name "*.java" -o \
    -name "*.css" -o \
    -name "*.scss" -o \
    -name "*.html" \
    | grep -v "node_modules" \
    | grep -v "vendor" \
    | grep -v "dist" \
    | grep -v ".git" \
    | grep -v ".next" \
    | grep -v ".nuxt" \
    | grep -v "coverage" \
    | grep -v ".bun" \
    | grep -v "\.agent" \
    | while read -r file; do
        lines=$(wc -l < "$file" 2>/dev/null)
        if [ "$lines" -gt "$THRESHOLD" ]; then
            echo "$lines $file"
        fi
    done | sort -rn | while read -r lines file; do
        # Colorize output based on severity
        if [ "$lines" -gt 800 ]; then
            echo -e "\033[31m🔴 $lines lines\033[0m  $file"  # Red - Critical
        elif [ "$lines" -gt 600 ]; then
            echo -e "\033[33m🟠 $lines lines\033[0m  $file"  # Orange - Warning
        else
            echo -e "\033[93m🟡 $lines lines\033[0m  $file"  # Yellow - Attention
        fi
    done

echo ""
echo "=============================================="
echo "Legend:"
echo "  🔴 >800 lines - Critical: Split immediately"
echo "  🟠 >600 lines - Warning: Consider splitting"
echo "  🟡 >400 lines - Attention: Monitor growth"
echo ""
