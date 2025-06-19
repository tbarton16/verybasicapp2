from datasets import load_dataset

ds = load_dataset("NaghmehAI/PerMedCQA", split="train")
print(ds[0])