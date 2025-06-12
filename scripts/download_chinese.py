#!/usr/bin/env python
"""
Download the first 500 examples from the Hugging Face dataset
`sarvamai/gsm8k-indic` and save them to `gsm8k_indic_first500.jsonl`.

Usage:
    python download_gsm8k_indic.py
"""

from datasets import load_dataset
import json

OUTFILE = "gsm8k_arabic.jsonl"
SPLIT = "main_test"          # change to "test" or "validation" if you prefer
N_EXAMPLES = 500         # number of records to export


def main() -> None:
    # 1. Load the dataset split from Hugging Face Hub
    ds = load_dataset("Omartificial-Intelligence-Space/Arabic-gsm8k", split=SPLIT)

    # 2. Select the first N_EXAMPLES rows
    #subset = ds.select(range(N_EXAMPLES))

    # 3. Write them to disk in JSONL format
    with open(OUTFILE, "w", encoding="utf-8") as f:
        for row in ds:
            json.dump(row, f, ensure_ascii=False)
            f.write("\n")

    print(f"✅ Saved {len(ds)} examples to {OUTFILE}")


if __name__ == "__main__":
    main()
