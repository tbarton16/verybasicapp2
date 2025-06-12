#!/usr/bin/env python
"""
Download the entire `sarvamai/gsm8k-indic` dataset and split it into one file
per unique `subset` value.

Each output file is JSONL-formatted (one JSON object per line) and named
`gsm8k_indic_<subset>.jsonl`, written inside the `gsm8k_indic_split/` folder.

Requires:   pip install datasets
"""

from datasets import load_dataset
from pathlib import Path
import json
import re

# --------------------------------------------------------------------------- #
# Configuration — tweak these if you like
DATASET_ID = "sarvamai/gsm8k-indic"
OUT_DIR = Path("gsm8k_indic_split")
ENCODING = "utf-8"
# --------------------------------------------------------------------------- #


def slugify(text: str) -> str:
    """
    Make a string safe to use in a filename: keep letters, numbers, '_', '-', '.'.
    """
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", text)


def main() -> None:
    # Make sure the output directory exists
    OUT_DIR.mkdir(exist_ok=True)

    # Load every split (returns a DatasetDict: {'train': Dataset, 'test': Dataset, ...})
    

    # Lazily open one handle per subset so we don't keep hundreds of files open
    open_handles = {}
    configs = ['bn', 'bn_roman', 'en', 'gu', 'gu_roman', 'hi', 'hi_roman', 'kn', 'kn_roman', 'ml', 'ml_roman', 'mr', 'mr_roman', 'or', 'or_roman', 'pa', 'pa_roman', 'ta', 'ta_roman', 'te', 'te_roman']
    try:
        for config in configs:
            dataset_dict = load_dataset(DATASET_ID, config)
            print(f"🔄  Processing split: {config}  )")
            for row in dataset_dict['test']:
                subset = config
                safe_subset = slugify(subset)

                # Prepare the file handle the first time we see this subset
                if subset not in open_handles:
                    file_path = OUT_DIR / f"gsm8k_indic_{safe_subset}.jsonl"
                    open_handles[subset] = open(file_path, "w", encoding=ENCODING)

                # Write the record as a single JSON line
                json.dump(row, open_handles[subset], ensure_ascii=False)
                open_handles[subset].write("\n")

        print(f"✅ Done! All files are in {OUT_DIR.resolve()}")
    finally:
        # Close every file even if an error occurred
        for handle in open_handles.values():
            handle.close()


if __name__ == "__main__":
    main()
