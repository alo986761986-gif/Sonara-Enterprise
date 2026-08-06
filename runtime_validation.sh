#!/usr/bin/env bash
set -e

echo "================================================================================"
echo "      SONARA V12 ENTERPRISE - RUNTIME VALIDATION SCRIPT (PHASE 6)"
echo "================================================================================"

# Execute Python Runtime Validation Engine
if command -v python3 &> /dev/null; then
    python3 runtime_validation.py
elif command -v python &> /dev/null; then
    python runtime_validation.py
else
    echo "[-] ERROR: Neither python3 nor python executable found in PATH."
    exit 1
fi

echo ""
echo "================================================================================"
echo "✔ RUNTIME VALIDATION EXECUTED SUCCESSFULLY"
echo "✔ RUNTIME_STATUS.md UPDATED"
echo "✔ RUNTIME_VALIDATION_REPORT.md GENERATED"
echo "================================================================================"
