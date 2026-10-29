# 🏥 MediShare AI

### Intelligent Medicine Redistribution Through Optimization

**MediShare AI** is a healthcare resource optimization project designed to help identify medicine surpluses and shortages across healthcare facilities and recommend efficient transfers.

By combining inventory data processing, mathematical optimization, and an interactive dashboard, MediShare AI aims to improve medicine utilization, reduce avoidable wastage, and support cost-efficient healthcare logistics.

---

## 📌 Table of Contents

- [Problem Statement](#-problem-statement)
- [Our Solution](#-our-solution)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Backend API](#-backend-api)
- [Optimization Approach](#-optimization-approach)
- [Map Visualization](#-map-visualization)
- [Testing](#-testing)
- [Security and Limitations](#-security-and-limitations)
- [Future Enhancements](#-future-enhancements)
- [Disclaimer](#-disclaimer)

---

## 🚨 Problem Statement

Healthcare facilities can experience medicine shortages while other facilities may have excess inventory.

Without effective coordination, this imbalance can lead to:

- Medicine wastage and underutilized inventory.
- Delays in identifying facilities that need supplies.
- Inefficient redistribution between healthcare facilities.
- Unnecessary transportation costs.
- Difficulty coordinating inventory transfers.

An effective redistribution strategy should consider available supply, destination demand, and transportation costs together.

## 💡 Our Solution

MediShare AI provides a data-driven approach to medicine redistribution.

The system processes inventory information, validates uploaded CSV files, and uses mathematical optimization to recommend potential transfers between healthcare facilities.

The optimization approach prioritizes the quantity of medicine that can be transferred before minimizing the transportation cost of the resulting plan.

The dashboard helps users explore inventory information, visualize potential transfers, and review recommendations.

## ✨ Key Features

### 📦 Inventory Analysis
- Process medicine inventory and demand data.
- Display inventory information through a dashboard.
- Identify potential redistribution opportunities using available data.

### 🔄 Medicine Redistribution
- Generate potential transfers from source facilities to destination facilities.
- Calculate recommended transfer quantities.
- Display proposed transfers for review.
- Present transfer quantities and estimated transportation costs.

### 🧮 Two-Stage Optimization
The backend implements a two-stage optimization approach:

1. **Maximize fulfillment:** Maximize the total feasible quantity of medicine transferred while respecting supply and demand constraints.
2. **Minimize transportation cost:** Find a lower-cost transfer plan while preserving the maximum fulfillment achieved in the first stage.

### 📊 CSV Upload and Validation
- Upload inventory data in CSV format.
- Validate uploaded records.
- Prepare cleaned transfer candidates.
- Generate data quality reports.
- Download cleaned data and validation issues.

### 🗺️ Interactive Map
- Display hospital markers using Leaflet.
- Highlight the source and destination of a selected transfer.
- Visualize connections between selected facilities.

*Note: Marker positions and connecting lines may be illustrative rather than verified real-world locations or road routes.*

### 📥 Downloadable Results
The backend supports downloading processed data, data quality issues, and optimization results.

---

## 🔄 How It Works

```text
Inventory and Demand Data
           |
           v
      CSV Upload
           |
           v
    Data Validation
           |
           v
 Clean Transfer Candidates
           |
           v
 Stage 1: Maximize Fulfillment
           |
           v
 Stage 2: Minimize Transport Cost
           |
           v
  Recommended Transfer Plan
           |
           v
 Dashboard and Transfer Review
           |
           v
    Download Results
```

The workflow converts inventory data into a structured transfer plan that can be reviewed before any real-world action is taken.

---

## 🛠️ Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, JavaScript |
| Development Server | Vite |
| Backend | Python, FastAPI |
| Data Processing | Pandas |
| Optimization | QpiAI optimization interface |
| Maps | Leaflet, React Leaflet |
| Charts | Recharts |
| Icons | Lucide React |
| Data Formats | CSV, JSON |
| Configuration | Python dotenv |

---

## 📁 Project Structure

```text
MediShare-AI/
├── public/                          # Public frontend assets
├── src/                             # React application source
├── data/                            # Supporting data files
├── mapdata/                         # Map-related data
├── outputs/                         # Generated outputs
│
├── app.py                           # FastAPI application
├── backend.py                       # CSV optimization workflow
├── backend1.py                      # Additional backend implementation
├── test_backend.py                  # Backend test script
│
├── inventory_demand.csv             # Inventory and demand data
├── medishare_ai_synthetic_dataset.csv
├── transport_routes.csv             # Transportation route data
│
├── medishare_optimization.lp        # Optimization model artifact
├── medishare_stage1.lp              # Stage 1 model artifact
├── medishare_transfer_plan.csv      # Transfer plan data
│
├── edit.ipynb                       # Jupyter notebook
├── package.json                     # Frontend dependencies and scripts
├── package-lock.json                # Locked frontend dependencies
├── vite.config.js                   # Vite configuration
├── eslint.config.js                 # ESLint configuration
├── index.html                       # HTML entry point
├── .gitignore                       # Git ignore rules
└── README.md                         # Project documentation
```

Some generated files may differ depending on the current state of the project and the results of previous optimization runs.

---

## 🚀 Getting Started

### Prerequisites

Install the following:

- [Git](https://git-scm.com/)
- [Node.js and npm](https://nodejs.org/)
- Python compatible with the installed backend dependencies
- A valid QpiAI API key for optimization features that require the external service

### 1. Clone the Repository

```bash
git clone https://github.com/Pranavm333/MediShare-AI.git
cd MediShare-AI
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Start the Frontend

```bash
npm run dev
```

Open the local URL printed in the terminal. Vite commonly uses:

```text
http://localhost:5173
```

### 4. Set Up the Python Backend

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it on Windows:

```powershell
.venv\Scripts\Activate.ps1
```

On macOS or Linux:

```bash
source .venv/bin/activate
```

Install the backend dependencies required by the project. If the repository has a `requirements.txt`, use:

```bash
pip install -r requirements.txt
```

If it does not, install the dependencies listed in the backend imports and the official QpiAI package instructions.

### 5. Configure the API Key

Create a local `.env` file in the location expected by the backend.

Add your API key using the environment variable name expected by your code.

For example:

```env
QPIAI_API_KEY=your_api_key_here
```

Replace the placeholder with your actual key locally. Never commit the real `.env` file to GitHub.

### 6. Run the Backend

If `app.py` exposes a FastAPI application named `app`, start it using:

```bash
uvicorn app:app --reload --port 8000
```

The backend will usually be available at:

```text
http://127.0.0.1:8000
```

Interactive API documentation, when enabled, is available at:

```text
http://127.0.0.1:8000/docs
```

Keep the frontend and backend running in separate terminals. Ensure the frontend's API URL and the backend's CORS configuration match your local setup.

---

## 🔐 Environment Variables

API credentials must remain private.

Example `.env.example`:

```env
QPIAI_API_KEY=your_api_key_here
```

Ensure `.gitignore` contains:

```gitignore
.env
.env.*
!.env.example

node_modules/
dist/
.venv/
venv/
__pycache__/
```

The `.env.example` file contains a placeholder only. It must never contain your real API key.

**Important:** Never expose secret API credentials through frontend code or public repositories.

---

## 🔌 Backend API

The FastAPI backend provides endpoints for health checks, inventory data, CSV processing, optimization, and downloading results.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Backend status or endpoint overview |
| GET | `/health` | Health check |
| GET | `/inventory` | Retrieve processed inventory |
| POST | `/upload-csv` | Upload and validate CSV data |
| GET | `/data-quality-report` | Retrieve the data quality report |
| POST | `/run-optimization` | Run the optimization workflow |
| GET | `/download-cleaned` | Download cleaned transfer candidates |
| GET | `/download-issues` | Download validation issues |
| GET | `/download-results` | Download optimization results |

The exact request formats and response structures are defined by the backend implementation. Run the backend and visit `/docs` to inspect the available API documentation.

---

## 🧠 Optimization Approach

The optimization process focuses on two objectives.

### Stage 1: Maximize Medicine Fulfillment

Determine the greatest feasible total transfer quantity based on available supply, destination demand, and transfer constraints.

### Stage 2: Minimize Transportation Cost

Minimize the transportation cost while maintaining the maximum fulfillment achieved in Stage 1.

The resulting transfer plan can help users compare potential redistribution decisions.

The quality of the result depends on the accuracy of the inventory, demand, and transportation data supplied to the system.

---

## 🗺️ Map Visualization

MediShare AI uses Leaflet and React Leaflet for interactive map visualization.

The current interface can display facility markers and highlight the endpoints of a selected transfer.

Real-world navigation requires additional verified geographic coordinates and a routing service.

Illustrative marker locations and straight-line connections should not be interpreted as verified road routes, travel times, or real-world hospital positions.

---

## 🧪 Testing

The repository includes a backend test script:

```bash
python test_backend.py
```

Run it from the project root after installing the required dependencies and ensuring the expected input dataset is available.

The script exercises the CSV-based optimization workflow. It should not be interpreted as a complete automated test suite for the frontend and every API endpoint.

Frontend checks can be run using:

```bash
npm run lint
npm run build
```

---

## 🔒 Security and Limitations

MediShare AI is a prototype for medicine inventory analysis and redistribution planning.

- API keys must be stored securely and excluded from version control.
- Sample datasets should not be assumed to represent live hospital inventory.
- Recommendations depend on the accuracy of the supplied data.
- Map positions and routes may be illustrative.
- Optimization results require appropriate human review.
- Real-world transfers must comply with medicine storage, expiry, handling, and regulatory requirements.
- Production deployment requires additional security, validation, monitoring, and operational testing.

---

## 🔮 Future Enhancements

Potential improvements include:

- Verified real-world hospital coordinates.
- Road routing and travel-time estimation.
- Live inventory integration.
- Medicine demand forecasting.
- Expiry-aware redistribution.
- Medicine safety and compatibility checks.
- User authentication and role-based access.
- Transfer approval workflows and audit logs.
- Automated frontend and backend testing.
- Secure production deployment.

These are possible future extensions, not claims that every feature is already implemented.

---

## 🤝 Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement and test your changes.
4. Commit your changes with a descriptive message.
5. Push the branch and open a pull request.

Please do not include API keys, confidential data, or unnecessary generated files in commits.

---

## 📄 License

Please add a `LICENSE` file if you intend to distribute the project under a specific open-source license.

Until a license is specified, do not assume that others have permission to reuse or redistribute the project.

---

## ⚕️ Disclaimer

MediShare AI is a prototype intended to support inventory analysis and redistribution planning. It does not provide medical advice or independently authorize medicine transfers.

Real-world deployment requires validation by qualified personnel and appropriate safeguards for medicine safety, transportation, data privacy, and regulatory compliance.

---

## 🔗 Repository

**GitHub:** https://github.com/Pranavm333/MediShare-AI

**Built with:** React · Vite · Python · FastAPI · Pandas · QpiAI · Leaflet

*Building smarter ways to coordinate healthcare resources.*
