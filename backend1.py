import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

from qpiai_opt.opt_modeller import Integer, Model
from qpiai_opt.opt_solvers import Client, solve


# ============================================================
# MEDISHARE AI BACKEND
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

load_dotenv(BASE_DIR / ".env")

REQUIRED_COLUMNS = [
    "facility_id",
    "medicine_id",
    "destination_facility",
    "surplus_quantity",
    "shortage_quantity",
    "transport_cost",
]


# ============================================================
# 1. READ AND VALIDATE THE INPUT CSV
# ============================================================

def prepare_data(csv_file):
    if isinstance(csv_file, pd.DataFrame):
        df = csv_file.copy()
    else:
        df = pd.read_csv(csv_file)

    df.columns = df.columns.str.strip()

    missing = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing:
        raise ValueError(
            "Missing required CSV columns: "
            + ", ".join(missing)
        )

    if df.empty:
        raise ValueError("The input CSV is empty.")

    df = df.dropna(
        subset=[
            "facility_id",
            "medicine_id",
            "destination_facility",
        ]
    ).copy()

    numeric_columns = [
        "surplus_quantity",
        "shortage_quantity",
        "transport_cost",
    ]

    for column in numeric_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        )

    df = df.dropna(subset=numeric_columns).copy()

    if (df["surplus_quantity"] < 0).any():
        raise ValueError("Surplus cannot be negative.")

    if (df["shortage_quantity"] < 0).any():
        raise ValueError("Shortage cannot be negative.")

    if (df["transport_cost"] < 0).any():
        raise ValueError("Transport cost cannot be negative.")

    for column in [
        "surplus_quantity",
        "shortage_quantity",
    ]:
        if not (df[column] % 1 == 0).all():
            raise ValueError(
                f"{column} must contain whole numbers."
            )

        df[column] = df[column].astype(int)

    # Only retain routes where a transfer may be useful.
    df = df[
        (df["surplus_quantity"] > 0)
        & (df["shortage_quantity"] > 0)
    ].copy()

    if df.empty:
        raise ValueError(
            "No routes with both surplus and shortage were found."
        )

    # Keep the cheapest duplicate source-medicine-destination route.
    df = df.sort_values("transport_cost")

    df = df.drop_duplicates(
        subset=[
            "facility_id",
            "medicine_id",
            "destination_facility",
        ],
        keep="first",
    ).reset_index(drop=True)

    # Upper bound for each individual route.
    df["max_transfer"] = df[
        ["surplus_quantity", "shortage_quantity"]
    ].min(axis=1).astype(int)

    # Save a copy of the cleaned candidate data.
    df.to_csv(
        OUTPUT_DIR / "cleaned_transfer_candidates.csv",
        index=False,
    )

    return df


# ============================================================
# 2. CREATE THE QPIAI OPTIMIZATION MODEL
# ============================================================

def build_qpiai_model(data, stage):
    model = Model(f"MediShare_Stage_{stage}")

    variables = {}

    # FIX: add_variable receives the Integer variable object.
    # Do not pass the variable name as a separate argument.
    for i, row in data.iterrows():
        variable = Integer(
            name=f"transfer_{stage}_{i}",
            lower_bound=0,
            upper_bound=int(row["max_transfer"]),
        )

        variables[i] = model.add_variable(variable)

    # Source constraints:
    # A source facility cannot send more than its surplus
    # of a particular medicine.
    source_groups = data.groupby(
        ["facility_id", "medicine_id"]
    )

    for group_number, (_, group) in enumerate(source_groups):
        indices = list(group.index)

        total_sent = sum(
            variables[i] for i in indices
        )

        available = int(
            group["surplus_quantity"].min()
        )

        model.add_constraint(
    total_sent <= available
)

    # Destination constraints:
    # A destination cannot receive more than its shortage
    # of a particular medicine.
    destination_groups = data.groupby(
        ["destination_facility", "medicine_id"]
    )

    for group_number, (_, group) in enumerate(destination_groups):
        indices = list(group.index)

        total_received = sum(
            variables[i] for i in indices
        )

        needed = int(
            group["shortage_quantity"].min()
        )

        model.add_constraint(
            total_received <= needed
        )

    # Stage 1 maximizes the number of units transferred.
    if stage == 1:
        model.maximize(
            sum(variables.values())
        )

    # Stage 2 minimizes the cost of transferring those units.
    elif stage == 2:
        model.minimize(
            sum(
                float(data.loc[i, "transport_cost"])
                * variables[i]
                for i in variables
            )
        )

    else:
        raise ValueError("Stage must be 1 or 2.")

    return model, variables


# ============================================================
# 3. RUN QPIAI
# ============================================================

def run_qpiai(model):
    api_key = os.getenv("QPIAI_API_KEY")

    if not api_key:
        raise ValueError(
            "QPIAI_API_KEY was not found. "
            "Check your .env file without sharing its contents."
        )

    client = Client(api_key=api_key)

    result = solve(
        model,
        mode="local",
        client=client,
    )

    if result is None:
        raise RuntimeError("QpiAI returned no result.")

    return result


# ============================================================
# 4. EXTRACT SOLUTION VALUES
# ============================================================

def extract_solution_values(result, variables):
    solution = getattr(result, "solution", None)

    if solution is None and isinstance(result, dict):
        solution = result.get("solution", result)

    if not isinstance(solution, dict):
        raise RuntimeError(
            "Could not read the solution dictionary returned "
            "by QpiAI. The result format needs to be checked."
        )

    values = {}

    for i, variable in variables.items():
        name = getattr(variable, "name", None)

        if name is None:
            raise RuntimeError(
                "Could not determine a variable name from QpiAI."
            )

        if name in solution:
            value = solution[name]
        elif variable in solution:
            value = solution[variable]
        else:
            raise RuntimeError(
                f"Solution value for {name} was not found. "
                "The QpiAI solution format may differ."
            )

        if isinstance(value, dict):
            if "value" in value:
                value = value["value"]
            elif "solution_value" in value:
                value = value["solution_value"]
            else:
                raise RuntimeError(
                    f"Cannot interpret the solution for {name}."
                )

        number = float(value)

        if abs(number - round(number)) > 1e-5:
            raise RuntimeError(
                f"QpiAI returned a non-integer value for {name}."
            )

        values[i] = int(round(number))

    return values


# ============================================================
# 5. OPTIMIZE THE TRANSFER PLAN
# ============================================================

def optimize_csv(csv_file):
    data = prepare_data(csv_file)

    # Stage 1: maximize total transferred units.
    model1, variables1 = build_qpiai_model(
        data,
        stage=1,
    )

    model1.to_lp_file(
        str(OUTPUT_DIR / "medishare_stage1.lp")
    )

    result1 = run_qpiai(model1)

    values1 = extract_solution_values(
        result1,
        variables1,
    )

    maximum_fulfillment = sum(values1.values())

    if maximum_fulfillment <= 0:
        raise RuntimeError(
            "QpiAI found no positive medicine transfers."
        )

    # Stage 2: minimize transport cost while keeping
    # the maximum total quantity from Stage 1.
    model2, variables2 = build_qpiai_model(
        data,
        stage=2,
    )

    model2.add_constraint(
    sum(variables2.values()) == maximum_fulfillment
)

    model2.to_lp_file(
        str(OUTPUT_DIR / "medishare_stage2.lp")
    )

    result2 = run_qpiai(model2)

    values2 = extract_solution_values(
        result2,
        variables2,
    )

    final_total = sum(values2.values())

    if final_total != maximum_fulfillment:
        raise RuntimeError(
            "Stage 2 did not preserve the maximum transfer quantity."
        )

    # Prepare the final transfer plan.
    plan = data.copy()

    plan["recommended_transfer_quantity"] = [
        values2[i] for i in plan.index
    ]

    plan = plan[
        plan["recommended_transfer_quantity"] > 0
    ].copy()

    plan["estimated_transport_cost"] = (
        plan["recommended_transfer_quantity"]
        * plan["transport_cost"]
    )

    plan = plan.reset_index(drop=True)

    # Save the result CSV.
    output_file = (
        OUTPUT_DIR / "medishare_transfer_plan.csv"
    )

    plan.to_csv(output_file, index=False)

    summary = {
        "total_units_to_transfer": int(
            plan["recommended_transfer_quantity"].sum()
        ),
        "active_routes": int(len(plan)),
        "estimated_transport_cost": float(
            plan["estimated_transport_cost"].sum()
        ),
        "output_file": str(output_file),
    }

    return plan, summary


# ============================================================
# 6. RUN THIS FILE DIRECTLY
# ============================================================

if __name__ == "__main__":
    input_file = (
        BASE_DIR / "medishare_ai_synthetic_dataset.csv"
    )

    if not input_file.exists():
        raise FileNotFoundError(
            "Input CSV not found: " + str(input_file)
        )

    transfer_plan, summary = optimize_csv(input_file)

    print("\nMEDISHARE AI OPTIMIZATION SUMMARY")

    for key, value in summary.items():
        print(f"{key}: {value}")

    print("\nFirst 10 recommended transfers:")

    print("\n" + "=" * 90)
print("       MEDISHARE AI - TOP 10 RECOMMENDED TRANSFERS")
print("=" * 90)

display_columns = [
    "facility_id",
    "medicine_name",
    "destination_facility",
    "surplus_quantity",
    "shortage_quantity",
    "recommended_transfer_quantity",
    "estimated_transport_cost",
]

print(
    transfer_plan[display_columns]
    .head(10)
    .to_string(index=False)
)

print("=" * 90)