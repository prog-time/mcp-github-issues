#!/bin/bash

set -e

ALL_FILE_ARRAY=()
while IFS= read -r line; do
    ALL_FILE_ARRAY+=("$line")
done < <(git diff --cached --name-only --diff-filter=ACM || true)

NEW_FILE_ARRAY=()
while IFS= read -r line; do
    NEW_FILE_ARRAY+=("$line")
done < <(git diff --cached --name-only --diff-filter=A || true)

echo "ALL_FILE_ARRAY по индексам:"
for i in "${!ALL_FILE_ARRAY[@]}"; do
    echo "[$i] = '${ALL_FILE_ARRAY[$i]}'"
done

echo "Checking Prettier..."
bash linting/check_scripts/check_prettier.sh "${ALL_FILE_ARRAY[@]}"
echo "----------"

echo "Checking ESLint..."
bash linting/check_scripts/check_eslint_all.sh
echo "----------"

echo "Checking TSC..."
bash linting/check_scripts/check_tsc_all.sh
echo "----------"

echo "Checking tests exist..."
bash linting/check_scripts/check_tests_exist.sh "${ALL_FILE_ARRAY[@]}"
echo "----------"
