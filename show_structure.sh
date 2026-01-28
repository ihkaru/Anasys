#!/bin/bash

# Script to visualize project structure ignoring common noise directories
# Usage: ./show_structure.sh

python3 -c '
import os

# Configuration
IGNORE_DIRS = {
    ".git", "node_modules", ".agent", "dist", "coverage", 
    ".cache", ".turbo", "build", "tmp", "__pycache__"
}
MAX_DEPTH = 3

def print_tree(startpath, prefix="", depth=0):
    if depth > MAX_DEPTH:
        return

    try:
        entries = sorted(os.listdir(startpath))
    except (PermissionError, FileNotFoundError):
        return

    # Filter entries
    filtered_entries = [
        e for e in entries 
        if e not in IGNORE_DIRS and not e.startswith(".")
    ]
    
    # Process entries
    count = len(filtered_entries)
    for index, entry in enumerate(filtered_entries):
        path = os.path.join(startpath, entry)
        is_last = (index == count - 1)
        
        connector = "└── " if is_last else "├── "
        print(f"{prefix}{connector}{entry}")
        
        if os.path.isdir(path):
            new_prefix = prefix + ("    " if is_last else "│   ")
            print_tree(path, new_prefix, depth + 1)

if __name__ == "__main__":
    print(".")
    print_tree(".")
'
