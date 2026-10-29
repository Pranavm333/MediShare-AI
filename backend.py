
from pathlib import Path
import os

import pandas as pd
from dotenv import load_dotenv

# Find the folder containing this Python file
BASE_DIR = Path(__file__).resolve().parent

# Load the QpiAI API key from .env
load_dotenv(BASE_DIR / ".env")

# Dataset and optimization output paths
DATASET_PATH = BASE_DIR / "medishare_ai_synthetic_dataset.csv"
TRANSFER_PLAN_PATH = BASE_DIR / "medishare_transfer_plan.csv"


def load_medicine_data():
    """Load the medicine inventory dataset."""
    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATASET_PATH.name}"
        )

    return pd.read_csv(DATASET_PATH)


def load_transfer_plan():
    """Load the previously generated transfer recommendations."""
    if not TRANSFER_PLAN_PATH.exists():
        raise FileNotFoundError(
            f"Transfer plan not found: {TRANSFER_PLAN_PATH.name}"
        )

    return pd.read_csv(TRANSFER_PLAN_PATH)


if __name__ == "__main__":
    print("MediShare AI backend started!")

    medicines = load_medicine_data()
    plan = load_transfer_plan()

    print(f"Medicine dataset rows: {len(medicines)}")
    print(f"Transfer recommendations: {len(plan)}")
    print(
        "Total units recommended:",
        int(plan["recommended_transfer"].sum())
    )
