from pathlib import Path
from backend import optimize_csv

data_path = Path("medishare_ai_synthetic_dataset.csv")

if not data_path.exists():
    raise FileNotFoundError("Could not find the input CSV file.")

transfer_plan, summary = optimize_csv(data_path)

print("\nOptimization summary:")
for key, value in summary.items():
    print(f"{key}: {value}")

print("\nRecommended transfers:")
print(transfer_plan.head(10).to_string(index=False))