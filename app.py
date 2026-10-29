import os
import json
from pathlib import Path
from typing import Optional

import pandas as pd
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from qpiai_opt.opt_modeller import Integer, Model
from qpiai_opt.opt_solvers import Client, solve
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# MEDISHARE AI - COMPLETE BACKEND
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(BASE_DIR / ".env")

app = FastAPI(
    title="MediShare AI API",
    description=(
        "Upload medicine inventory CSV files, validate the data, "
        "and generate optimized medicine transfer recommendations."
    ),
    
    version="1.0.0",
)
latest_cleaned_inventory = pd.DataFrame()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# FILE PATHS
# ============================================================

CLEANED_FILE = OUTPUT_DIR / "cleaned_transfer_candidates.csv"
ISSUES_FILE = OUTPUT_DIR / "data_quality_issues.csv"
REPORT_FILE = OUTPUT_DIR / "data_quality_report.json"
RESULT_FILE = OUTPUT_DIR / "medishare_transfer_plan.csv"
ROUTES_FILE = BASE_DIR / "transport_routes.csv"

STAGE1_FILE = OUTPUT_DIR / "medishare_stage1.lp"
STAGE2_FILE = OUTPUT_DIR / "medishare_stage2.lp"


# ============================================================
# REQUIRED INPUT COLUMNS
# ============================================================

REQUIRED_COLUMNS = [
    "facility_id",
    "medicine_id",
    "destination_facility",
    "surplus_quantity",
    "shortage_quantity",
    "transport_cost",
]

IDENTIFIER_COLUMNS = [
    "facility_id",
    "medicine_id",
    "destination_facility",
]

NUMERIC_COLUMNS = [
    "surplus_quantity",
    "shortage_quantity",
    "transport_cost",
]


# ============================================================
# 1. CSV CLEANING AND VALIDATION
# ============================================================

def prepare_data(csv_file):
    """
    Read and clean an uploaded CSV or pandas DataFrame.

    Returns:
        cleaned_df: Valid transfer candidates.
        issues_df: Rows and issues requiring review.
        report: Data-quality summary.
    """

    if isinstance(csv_file, pd.DataFrame):
        df = csv_file.copy()
    else:
        df = pd.read_csv(csv_file)

    if df.empty:
        raise ValueError("The uploaded CSV is empty.")

    # Normalize column names.
    df.columns = (
        df.columns
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", "_", regex=True)
    )

    # Check the required columns.
    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Missing required CSV columns: "
            + ", ".join(missing_columns)
        )

    original_row_count = len(df)

    # Track the original CSV row number.
    # CSV row 1 is the header, so data begins at row 2.
    df = df.reset_index(drop=True)
    df["_source_row"] = df.index + 2

    issues = []
    invalid_indices = set()

    def add_issue(row_index, severity, message):
        issues.append({
            "csv_row": int(df.loc[row_index, "_source_row"]),
            "severity": severity,
            "issue": message,
        })

    # --------------------------------------------------------
    # Validate required text identifiers.
    # --------------------------------------------------------

    for index, row in df.iterrows():
        for column in IDENTIFIER_COLUMNS:
            value = row[column]

            if pd.isna(value) or str(value).strip() == "":
                add_issue(
                    index,
                    "error",
                    f"Missing required value: {column}",
                )
                invalid_indices.add(index)
            else:
                df.at[index, column] = str(value).strip()

    # --------------------------------------------------------
    # Convert numeric columns.
    # --------------------------------------------------------

    for column in NUMERIC_COLUMNS:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        )

    # --------------------------------------------------------
    # Validate individual rows.
    # --------------------------------------------------------

    for index, row in df.iterrows():

        for column in NUMERIC_COLUMNS:
            value = row[column]

            if pd.isna(value):
                add_issue(
                    index,
                    "error",
                    f"Missing or invalid numeric value: {column}",
                )
                invalid_indices.add(index)
                continue

            if value < 0:
                add_issue(
                    index,
                    "error",
                    f"Negative values are not allowed in {column}",
                )
                invalid_indices.add(index)

        for column in [
            "surplus_quantity",
            "shortage_quantity",
        ]:
            value = row[column]

            if pd.notna(value) and value >= 0:
                if not float(value).is_integer():
                    add_issue(
                        index,
                        "error",
                        f"{column} must contain whole numbers",
                    )
                    invalid_indices.add(index)

    # Exclude rows with errors.
    valid_df = df.drop(
        index=list(invalid_indices)
    ).copy()

    for column in [
        "surplus_quantity",
        "shortage_quantity",
    ]:
        valid_df[column] = valid_df[column].astype(int)

    # --------------------------------------------------------
    # Exclude routes where no transfer is possible.
    # --------------------------------------------------------

    no_transfer = valid_df[
        (valid_df["surplus_quantity"] <= 0)
        | (valid_df["shortage_quantity"] <= 0)
    ]

    for _, row in no_transfer.iterrows():
        issues.append({
            "csv_row": int(row["_source_row"]),
            "severity": "warning",
            "issue": (
                "Route excluded because surplus or shortage is zero."
            ),
        })

    valid_df = valid_df[
        (valid_df["surplus_quantity"] > 0)
        & (valid_df["shortage_quantity"] > 0)
    ].copy()

    # --------------------------------------------------------
    # Remove duplicate routes, keeping the cheapest.
    # --------------------------------------------------------

    duplicate_mask = valid_df.duplicated(
        subset=[
            "facility_id",
            "medicine_id",
            "destination_facility",
        ],
        keep=False,
    )

    duplicate_rows = valid_df[duplicate_mask]

    for _, row in duplicate_rows.iterrows():
        issues.append({
            "csv_row": int(row["_source_row"]),
            "severity": "warning",
            "issue": (
                "Duplicate source-medicine-destination route. "
                "Only the cheapest matching route will be retained."
            ),
        })

    valid_df = (
        valid_df
        .sort_values("transport_cost")
        .drop_duplicates(
            subset=[
                "facility_id",
                "medicine_id",
                "destination_facility",
            ],
            keep="first",
        )
        .copy()
    )

    # Calculate the upper bound for each route.
    valid_df["max_transfer"] = valid_df[
        ["surplus_quantity", "shortage_quantity"]
    ].min(axis=1).astype(int)

    # Remove the internal tracking column.
    valid_df = valid_df.drop(
        columns=["_source_row"],
        errors="ignore",
    )

    valid_df = valid_df.reset_index(drop=True)

    issues_df = pd.DataFrame(
        issues,
        columns=["csv_row", "severity", "issue"],
    )

    # Save cleaning results.
    valid_df.to_csv(CLEANED_FILE, index=False)
    issues_df.to_csv(ISSUES_FILE, index=False)

    error_count = (
        int((issues_df["severity"] == "error").sum())
        if not issues_df.empty
        else 0
    )

    warning_count = (
        int((issues_df["severity"] == "warning").sum())
        if not issues_df.empty
        else 0
    )

    report = {
        "original_rows": int(original_row_count),
        "valid_candidate_routes": int(len(valid_df)),
        "error_count": error_count,
        "warning_count": warning_count,
        "excluded_or_flagged_rows": int(
            len(invalid_indices)
        ),
        "status": (
            "ready_for_review"
            if len(valid_df) > 0
            else "no_valid_routes"
        ),
        "message": (
            "Review the data-quality report before optimization."
        ),
    }

    REPORT_FILE.write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    return valid_df, issues_df, report


# ============================================================
# 2. BUILD THE QPIAI OPTIMIZATION MODEL
# ============================================================

def build_qpiai_model(data, stage):
    model = Model(f"MediShare_Stage_{stage}")

    variables = {}

    # Create one integer transfer variable per route.
    for i, row in data.iterrows():
        variable = Integer(
            name=f"transfer_{stage}_{i}",
            lower_bound=0,
            upper_bound=int(row["max_transfer"]),
        )

        variables[i] = model.add_variable(variable)

    # --------------------------------------------------------
    # Source constraints.
    # Total quantity sent by a facility for a medicine must
    # not exceed that facility's available surplus.
    # --------------------------------------------------------

    source_groups = data.groupby(
        ["facility_id", "medicine_id"]
    )

    for _, group in source_groups:
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

    # --------------------------------------------------------
    # Destination constraints.
    # Total received for a medicine must not exceed shortage.
    # --------------------------------------------------------

    destination_groups = data.groupby(
        ["destination_facility", "medicine_id"]
    )

    for _, group in destination_groups:
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

    # --------------------------------------------------------
    # Stage 1: maximize total transfer quantity.
    # Stage 2: minimize transport cost.
    # --------------------------------------------------------

    if stage == 1:
        model.maximize(
            sum(variables.values())
        )

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
            "Check that your .env file exists and contains "
            "the correct key. Do not share the key."
        )

    client = Client(api_key=api_key)

    result = solve(
        model,
        mode="local",
        client=client,
    )

    if result is None:
        raise RuntimeError(
            "QpiAI returned no optimization result."
        )

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
            "Could not read the solution dictionary returned by QpiAI."
        )

    values = {}

    for index, variable in variables.items():
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
                f"Solution value for {name} was not found."
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
                f"Non-integer transfer value returned for {name}."
            )

        values[index] = int(round(number))

    return values


# ============================================================
# 5. OPTIMIZE CLEANED DATA
# ============================================================

def optimize_data(data):
    if data.empty:
        raise ValueError(
            "There are no valid transfer candidates to optimize."
        )

    # Stage 1: maximize total transferred units.
    model1, variables1 = build_qpiai_model(
        data,
        stage=1,
    )

    model1.to_lp_file(str(STAGE1_FILE))

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

    # Stage 2: minimize cost while preserving the maximum
    # total transfer quantity found in Stage 1.
    model2, variables2 = build_qpiai_model(
        data,
        stage=2,
    )

    model2.add_constraint(
        sum(variables2.values()) == maximum_fulfillment
    )

    model2.to_lp_file(str(STAGE2_FILE))

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

    # Build the transfer plan.
        # Build the transfer plan.
    plan = data.copy()

    plan["recommended_transfer_quantity"] = [
        values2[i] for i in plan.index
    ]

    # Extract the destination facility ID from values such as
    # "FAC040 - Gardenview Clinic".
    plan["destination_facility_id"] = (
        plan["destination_facility"]
        .astype(str)
        .str.extract(r"^([A-Za-z0-9_-]+)", expand=False)
    )

  
    # Load route travel times.
    if not ROUTES_FILE.exists():
        raise FileNotFoundError(
            f"Route data file not found: {ROUTES_FILE}"
        )

    routes = pd.read_csv(ROUTES_FILE)

    routes.columns = (
        routes.columns.astype(str)
        .str.strip()
        .str.lower()
    )

    routes["source_facility_id"] = (
        routes["source_facility_id"].astype(str).str.strip()
    )
    routes["destination_facility_id"] = (
        routes["destination_facility_id"].astype(str).str.strip()
    )

    plan["facility_id"] = (
        plan["facility_id"].astype(str).str.strip()
    )

    routes = routes[
        [
            "source_facility_id",
            "destination_facility_id",
            "transport_time_hours",
        ]
    ].drop_duplicates(
        subset=[
            "source_facility_id",
            "destination_facility_id",
        ]
    )

    plan = plan.merge(
        routes,
        left_on=["facility_id", "destination_facility_id"],
        right_on=[
            "source_facility_id",
            "destination_facility_id",
        ],
        how="left",
    )

        # Preserve original route times and estimate missing ones.
    plan["transport_time_estimated"] = (
        plan["transport_time_hours"].isna()
    )

    # Use reverse-direction time only when no direct route time exists.
    reverse_routes = routes.rename(
        columns={
            "source_facility_id": "destination_facility_id",
            "destination_facility_id": "facility_id",
            "transport_time_hours": "reverse_time_hours",
        }
    )

    plan = plan.merge(
        reverse_routes[
            [
                "facility_id",
                "destination_facility_id",
                "reverse_time_hours",
            ]
        ],
        on=["facility_id", "destination_facility_id"],
        how="left",
    )

    plan["transport_time_hours"] = (
        plan["transport_time_hours"].fillna(
            plan["reverse_time_hours"]
        )
    )

    # Estimate any remaining missing times using an assumed
    # average speed of 30 km/h. These are NOT real driving times.
    plan["transport_time_hours"] = plan[
        "transport_time_hours"
    ].fillna(
        plan["transport_distance_km"] / 30
    )

    plan = plan.drop(
        columns=["reverse_time_hours"],
        errors="ignore",
    )

    plan = plan.drop(
        columns=["source_facility_id"],
        errors="ignore",
    )

    plan = plan[
        plan["recommended_transfer_quantity"] > 0
    ].copy()

    print("\n--- ROUTE TIME DEBUG ---")
    print("Columns:", plan.columns.tolist())

    columns_to_check = [
        "facility_id",
        "destination_facility",
        "destination_facility_id",
        "transport_time_hours",
    ]

    print(
        plan[columns_to_check]
        .head(10)
        .to_string(index=False)
    )
    print("--- END DEBUG ---\n")

    plan["estimated_transport_cost"] = (
        plan["recommended_transfer_quantity"]
        * plan["transport_cost"]
    )

    plan = plan.reset_index(drop=True)

    plan.to_csv(RESULT_FILE, index=False)

    summary = {
        "total_units_to_transfer": int(
            plan["recommended_transfer_quantity"].sum()
        ),
        "active_routes": int(len(plan)),
        "estimated_transport_cost": float(
            plan["estimated_transport_cost"].sum()
        ),
        "output_file": str(RESULT_FILE),
    }

    return plan, summary


# ============================================================
# 6. API REQUEST MODEL
# ============================================================

class OptimizationRequest(BaseModel):
    confirm_review: bool = False


# ============================================================
# 7. HEALTH CHECK
# ============================================================

@app.get("/")
def home():
    return {
        "application": "MediShare AI",
        "status": "running",
        "message": "Backend is ready.",
        "endpoints": [
            "/health",
            "/upload-csv",
            "/data-quality-report",
            "/run-optimization",
            "/download-cleaned",
            "/download-issues",
            "/download-results",
        ],
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "application": "MediShare AI",
    }

@app.get("/inventory")
def get_inventory():
    if latest_cleaned_inventory.empty:
        raise HTTPException(
            status_code=404,
            detail="No inventory uploaded yet. Please upload a CSV first.",
        )

    records = latest_cleaned_inventory.to_dict(orient="records")

    return {
        "total_records": len(records),
        "inventory": records,
    }



# ============================================================
# 8. UPLOAD AND CLEAN CSV
# ============================================================

@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    global latest_cleaned_inventory
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a CSV file.",
        )

    try:
        content = await file.read()

        if not content:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        # Read the uploaded CSV into memory.
        from io import BytesIO

        uploaded_df = pd.read_csv(BytesIO(content))

        cleaned_df, issues_df, report = prepare_data(
            uploaded_df
        )
        latest_cleaned_inventory = cleaned_df.copy()

        return {
            "message": "CSV uploaded and checked successfully.",
            "filename": file.filename,
            "report": report,
            "cleaned_preview": cleaned_df.head(10).to_dict(
                orient="records"
            ),
            "issues_preview": issues_df.head(20).to_dict(
                orient="records"
            ),
            "next_step": (
                "Review the data-quality report and then call "
                "/run-optimization with confirm_review set to true."
            ),
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


# ============================================================
# 9. GET DATA QUALITY REPORT
# ============================================================

@app.get("/data-quality-report")
def get_data_quality_report():
    if not REPORT_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="Upload a CSV file first.",
        )

    return json.loads(
        REPORT_FILE.read_text(encoding="utf-8")
    )


# ============================================================
# 10. RUN OPTIMIZATION
# ============================================================

@app.post("/run-optimization")
def run_optimization(request: OptimizationRequest):
    if not CLEANED_FILE.exists() or not REPORT_FILE.exists():
        raise HTTPException(
            status_code=400,
            detail="Upload a CSV file before running optimization.",
        )

    if not request.confirm_review:
        raise HTTPException(
            status_code=400,
            detail=(
                "Review the data-quality report first. "
                "Then send confirm_review=true to proceed."
            ),
        )

    try:
        report = json.loads(
            REPORT_FILE.read_text(encoding="utf-8")
        )

        if report["valid_candidate_routes"] <= 0:
            raise HTTPException(
                status_code=400,
                detail="No valid routes are available for optimization.",
            )

        data = pd.read_csv(CLEANED_FILE)

        plan, summary = optimize_data(data)

        # Convert missing values to None so the response is valid JSON.
        safe_summary = {
            key: (
                None
                if isinstance(value, float)
                and not __import__("math").isfinite(value)
                else value
            )
            for key, value in summary.items()
        }

        preview_df = plan.head(20).astype(object)
        preview_df = preview_df.where(pd.notna(preview_df), None)
        preview = preview_df.to_dict(orient="records")

        return {
            "message": "Optimization completed successfully.",
            "summary": safe_summary,
            "transfer_plan_preview": preview,
            "download_endpoint": "/download-results",
            "review_note": (
                "These are recommendations for review, not automatic "
                "authorization to move medicines."
            ),
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Optimization failed: {exc}",
        )



# ============================================================
# 11. DOWNLOAD CLEANED CANDIDATES
# ============================================================

@app.get("/download-cleaned")
def download_cleaned():
    if not CLEANED_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="No cleaned CSV exists. Upload a CSV first.",
        )

    return FileResponse(
        path=str(CLEANED_FILE),
        media_type="text/csv",
        filename="cleaned_transfer_candidates.csv",
    )


# ============================================================
# 12. DOWNLOAD DATA QUALITY ISSUES
# ============================================================

@app.get("/download-issues")
def download_issues():
    if not ISSUES_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="No issue report exists. Upload a CSV first.",
        )

    return FileResponse(
        path=str(ISSUES_FILE),
        media_type="text/csv",
        filename="data_quality_issues.csv",
    )


# ============================================================
# 13. DOWNLOAD OPTIMIZED TRANSFER PLAN
# ============================================================

@app.get("/download-results")
def download_results():
    if not RESULT_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="Run the optimization before downloading results.",
        )

    return FileResponse(
        path=str(RESULT_FILE),
        media_type="text/csv",
        filename="medishare_transfer_plan.csv",
    )


# ============================================================
# 14. RUN AS A SCRIPT
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )