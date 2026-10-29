import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";


const inventoryData = [
  { id: 1, hospital: "Apollo Medical Center", medicine: "Paracetamol", category: "Analgesic", stock: 1250, demand: 100, safety: 300, expiry: 180, status: "Surplus" },
  { id: 2, hospital: "City General Hospital", medicine: "Amoxicillin", category: "Antibiotic", stock: 90, demand: 60, safety: 120, expiry: 120, status: "Shortage" },
  { id: 3, hospital: "Green Valley Hospital", medicine: "Metformin", category: "Antidiabetic", stock: 520, demand: 70, safety: 210, expiry: 210, status: "Adequate" },
  { id: 4, hospital: "Sunrise Healthcare", medicine: "Insulin", category: "Antidiabetic", stock: 180, demand: 50, safety: 150, expiry: 18, status: "Expiring Soon" },
  { id: 5, hospital: "Apollo Medical Center", medicine: "Azithromycin", category: "Antibiotic", stock: 760, demand: 40, safety: 160, expiry: 150, status: "Surplus" },
  { id: 6, hospital: "City General Hospital", medicine: "Paracetamol", category: "Analgesic", stock: 85, demand: 75, safety: 225, expiry: 200, status: "Shortage" },
  { id: 7, hospital: "Lakeside Hospital", medicine: "Cetirizine", category: "Antihistamine", stock: 440, demand: 45, safety: 135, expiry: 12, status: "Expiring Soon" },
  { id: 8, hospital: "Green Valley Hospital", medicine: "Amoxicillin", category: "Antibiotic", stock: 360, demand: 45, safety: 135, expiry: 100, status: "Adequate" },
];

const transfersData = [
  { id: "TR-001", from: "Apollo Medical Center", to: "City General Hospital", medicine: "Paracetamol", quantity: 100, distance: 12.4, time: "28 min", cost: 420, status: "Pending Review" },
  { id: "TR-002", from: "Apollo Medical Center", to: "Sunrise Healthcare", medicine: "Azithromycin", quantity: 80, distance: 18.6, time: "42 min", cost: 610, status: "Pending Review" },
  { id: "TR-003", from: "Green Valley Hospital", to: "City General Hospital", medicine: "Amoxicillin", quantity: 50, distance: 8.2, time: "19 min", cost: 280, status: "Pending Review" },
];

const hospitals = [
  { name: "Apollo Medical Center", short: "AM", type: "Surplus", x: 23, y: 30 },
  { name: "City General Hospital", short: "CG", type: "Shortage", x: 70, y: 61 },
  { name: "Green Valley Hospital", short: "GV", type: "Surplus", x: 49, y: 19 },
  { name: "Sunrise Healthcare", short: "SH", type: "Shortage", x: 80, y: 28 },
  { name: "Lakeside Hospital", short: "LH", type: "Adequate", x: 34, y: 73 },
];

const navItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "Inventory", icon: "▤" },
  { name: "Shortage Alerts", icon: "⚑", count: "2" },
  { name: "Redistribution", icon: "⇄" },
  { name: "Route Map", icon: "⌖" },
  { name: "Reports", icon: "▥" },
];

function Icon({ children, className = "" }) {
  return <span aria-hidden="true" className={`icon ${className}`}>{children}</span>;
}

function Status({ value }) {
  const classes = {
    Surplus: "success",
    Adequate: "neutral",
    Shortage: "danger",
    "Expiring Soon": "warning",
    "Pending Review": "info",
  };
  return <span className={`status ${classes[value] || "neutral"}`}>{value}</span>;
}

function StatCard({ icon, label, value, note, color }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </article>
  );
}


function MapPanel({
  full = false,
  selectedRoute = null,
  inventory = [],
}) {
  const normalize = (value) =>
    String(value || "").trim().toLowerCase();

  // Get hospital names from inventory.
  const names = [
    ...new Set(
      inventory
        .map((item) => item.hospital)
        .filter(
          (name) =>
            name && normalize(name) !== "unknown facility"
        )
        .map((name) => String(name).trim())
    ),
  ];

  // Include selected transfer endpoints.
  if (selectedRoute?.from) names.push(String(selectedRoute.from).trim());
  if (selectedRoute?.to) names.push(String(selectedRoute.to).trim());

  const uniqueNames = [
    ...new Map(names.map((name) => [normalize(name), name])).values(),
  ];

  // Spread illustrative points around the map centre.
  const hospitals = uniqueNames.map((name, index) => {
    const angle = index * 2.39996;
    const radius = 0.025 * Math.sqrt(index + 1);

    return {
      name,
      position: [
        12.9716 + radius * Math.sin(angle),
        77.5946 + radius * Math.cos(angle),
      ],
    };
  });

  const findHospital = (name) =>
    hospitals.find(
      (hospital) => normalize(hospital.name) === normalize(name)
    );

  const source = selectedRoute
    ? findHospital(selectedRoute.from)
    : null;

  const destination = selectedRoute
    ? findHospital(selectedRoute.to)
    : null;

  const routeReady = Boolean(
    source &&
    destination &&
    normalize(source.name) !== normalize(destination.name)
  );

  const createIcon = (color) =>
    L.divIcon({
      className: "hospital-map-marker",
      html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.4)"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

  const center = routeReady
    ? [
        (source.position[0] + destination.position[0]) / 2,
        (source.position[1] + destination.position[1]) / 2,
      ]
    : [12.9716, 77.5946];

  return (
    <div className={`map-canvas ${full ? "map-large" : ""}`}>
      <div style={{ width: "100%", height: full ? 500 : 350 }}>
        <MapContainer
          key={`${selectedRoute?.id || "overview"}-${uniqueNames.length}`}
          center={center}
          zoom={9}
          scrollWheelZoom
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {hospitals.map((hospital) => {
            const isSource =
              selectedRoute &&
              normalize(hospital.name) === normalize(selectedRoute.from);

            const isDestination =
              selectedRoute &&
              normalize(hospital.name) === normalize(selectedRoute.to);

            const color = isSource
              ? "#16a34a"
              : isDestination
              ? "#dc2626"
              : "#2563eb";

            return (
              <Marker
                key={normalize(hospital.name)}
                position={hospital.position}
                icon={createIcon(color)}
              >
                <Popup>
                  <strong>{hospital.name}</strong>
                  {isSource && <div>Source hospital</div>}
                  {isDestination && <div>Destination hospital</div>}
                  <div>Illustrative position only</div>
                </Popup>
              </Marker>
            );
          })}

          {routeReady && (
            <Polyline
              positions={[
                source.position,
                destination.position,
              ]}
              pathOptions={{
                color: "#2563eb",
                weight: 5,
              }}
            />
          )}
        </MapContainer>
      </div>

      <div style={{ padding: "12px", background: "#fff" }}>
        {selectedRoute ? (
          <>
            <strong>Selected transfer</strong>
            <div>🟢 Source: {selectedRoute.from}</div>
            <div>🔴 Destination: {selectedRoute.to}</div>
            <small>
              The connecting line is illustrative, not a road route.
            </small>
          </>
        ) : (
          <>
            <strong>Hospital network</strong>
            <p>{hospitals.length} hospital markers displayed.</p>
            <small>Select an approved transfer to highlight its endpoints.</small>
          </>
        )}
      </div>

      <div className="map-disclaimer">
        Illustrative positions only — not verified real-world hospital locations.
      </div>
    </div>
  );
}


function InventoryTable({ items = [], compact = false }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Hospital</th>
            <th>Medicine</th>
            <th>Stock</th>
            <th>Safety Stock</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.hospital}</td>
              <td>{item.medicine}</td>
              <td>{item.stock}</td>
              <td>{item.safety}</td>
              <td>{item.status}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5}>No inventory records available.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}




function Dashboard({ onNavigate, inventory, transfers, onReview }) {
  const shortageCount = inventory.filter((item) => item.status === "Shortage").length;
  const surplusUnits = inventory
    .filter((item) => item.status === "Surplus")
    .reduce((sum, item) => sum + Math.max(0, item.stock - item.safety), 0);
  const expiring = inventory.filter((item) => item.expiry <= 30);
  const pendingCount = transfers.filter((item) => item.status === "Pending Review").length;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OVERVIEW</div>
          <h1>Dashboard overview</h1>
          <p>Monitor medicine availability and coordinate smarter redistribution.</p>
        </div>
        <span className="demo-pill"><span /> DEMO DATA</span>
      </div>

      <div className="stat-grid">
        <StatCard icon="⌂" label="Hospitals monitored" value="05" note="Sample hospital network" color="blue" />
        <StatCard icon="⚑" label="Medicines at risk" value={String(shortageCount).padStart(2, "0")} note="Inventory shortage records" color="red" />
        <StatCard icon="⇧" label="Surplus stock" value={surplusUnits.toLocaleString("en-IN")} note="Estimated available units" color="green" />
        <StatCard icon="⇄" label="Transfers recommended" value={String(pendingCount).padStart(2, "0")} note="Awaiting human review" color="purple" />
      </div>

      <div className="dashboard-grid">
        <section className="panel map-panel">
          <div className="panel-header">
            <div><h2>Hospital network</h2><p>Illustrative distribution overview</p></div>
            <button className="text-button" onClick={() => onNavigate("Route Map")}>Explore map →</button>
          </div>
          <MapPanel inventory={inventory} />
        </section>

        <section className="panel alert-panel">
          <div className="panel-header">
            <div><h2>Priority alerts</h2><p>Items needing attention</p></div>
            <span className="alert-count">{shortageCount + expiring.length}</span>
          </div>
          <div className="alert-list">
            {inventory.filter((item) => item.status === "Shortage" || item.expiry <= 30).slice(0, 4).map((item) => (
              <div className="alert-item" key={item.id}>
                <span className={`alert-symbol ${item.status === "Shortage" ? "alert-red" : "alert-amber"}`}>
                  {item.status === "Shortage" ? "!" : "◷"}
                </span>
                <div className="alert-copy">
                  <strong>{item.medicine}</strong>
                  <span>{item.hospital}</span>
                  <small>{item.status === "Shortage" ? "Below safety stock" : `Expires in ${item.expiry} days`}</small>
                </div>
                <span className={`priority-dot ${item.status === "Shortage" ? "red-dot" : "amber-dot"}`} />
              </div>
            ))}
          </div>
          <button className="button button-outline full-button" onClick={() => onNavigate("Shortage Alerts")}>View all alerts <span>→</span></button>
        </section>

        <section className="panel inventory-panel">
          <div className="panel-header">
            <div><h2>Inventory snapshot</h2><p>Recent medicine stock records</p></div>
            <button className="text-button" onClick={() => onNavigate("Inventory")}>View inventory →</button>
          </div>
          <InventoryTable items={inventory.slice(0, 4)} compact />
        </section>

        <section className="panel recommendations-panel">
          <div className="panel-header">
            <div><h2>AI recommendations</h2><p>Suggested transfers · Sample results</p></div>
            <button className="text-button" onClick={() => onNavigate("Redistribution")}>View all →</button>
          </div>
          <div className="mini-recommendations">
            {transfers.slice(0, 2).map((transfer) => (
              <div className="mini-transfer" key={transfer.id}>
                <div className="mini-transfer-icon">⇄</div>
                <div className="mini-transfer-copy">
                  <strong>{transfer.medicine} <span>· {transfer.quantity} units</span></strong>
                  <p>{transfer.from.split(" ")[0]} → {transfer.to.split(" ")[0]}</p>
                  <small>{transfer.distance} km · Estimated ₹{transfer.cost}</small>
                </div>
                <button className="icon-button" aria-label={`Review ${transfer.id}`} onClick={() => onReview(transfer)}>↗</button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="footer-note"><Icon>ⓘ</Icon> All metrics and recommendations are illustrative sample data. Validate stock, expiry, storage requirements and transport conditions before any real transfer.</div>
    </>
  );
}

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [inventory, setInventory] = useState(inventoryData);
  const [transfers, setTransfers] = useState(transfersData);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [realInventory, setRealInventory] = useState([]);
  const [realTransfers, setRealTransfers] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationSummary, setOptimizationSummary] = useState(null);
  const [optimizationRows, setOptimizationRows] = useState([]);
  const [optimizationError, setOptimizationError] = useState("");

   

async function refreshInventory() {
  try {
    const response = await fetch("http://127.0.0.1:8000/inventory");

    if (!response.ok) {
      throw new Error("Failed to load inventory.");
    }

    const data = await response.json();

    const mappedInventory = (data.inventory || []).map((row, index) => {
      const stock = Number(row.quantity_available || 0);
      const demand = Number(row.daily_demand || 0);
      const safety = Number(row.safety_stock || 0);

      
let status = "Adequate";

if (stock < demand) {
  status = "Shortage";
} else if (stock > safety) {
  status = "Surplus";
}

const expiryDate = new Date(row.expiry_date);
const today = new Date();
today.setHours(0, 0, 0, 0);

if (!Number.isNaN(expiryDate.getTime())) {
  const daysUntilExpiry = Math.ceil(
    (expiryDate - today) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) {
    status = "Expiring Soon";
  }
}


      return {
        id: row.batch_id || `${row.facility_id}-${row.medicine_id}-${index}`,
        hospital: row.facility_name || row.facility_id || "Unknown facility",
        medicine: row.medicine_name || "Unknown medicine",
        category: row.category || "General",
        stock,
        demand,
        safety,
        expiry: row.expiry_date || "Unknown",
        status,
      };
    });

    setRealInventory(mappedInventory);
    setInventory(mappedInventory);
  } catch (error) {
    console.error("Inventory refresh failed:", error);
    setOptimizationError(error.message || "Failed to refresh inventory.");
  }
}


  async function runOptimization() {
  if (!selectedFile) {
    setOptimizationError("Please select your CSV dataset first.");
    return;
  }

  setIsOptimizing(true);
  setOptimizationError("");
  setOptimizationSummary(null);
  setOptimizationRows([]);

  try {
    // Step 1: Upload the selected CSV file.
    const formData = new FormData();
    formData.append("file", selectedFile);

    const uploadResponse = await fetch(
      "http://127.0.0.1:8000/upload-csv",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`CSV upload failed: ${errorText}`);
    }

    // Step 2: Run the QpiAI optimization.
    const optimizationResponse = await fetch(
      "http://127.0.0.1:8000/run-optimization",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm_review: true }),
      }
    );

    if (!optimizationResponse.ok) {
      const errorText = await optimizationResponse.text();
      throw new Error(`Optimization failed: ${errorText}`);
    }

    const result = await optimizationResponse.json();

    setOptimizationSummary(result.summary);
    setOptimizationRows(result.transfer_plan_preview || []);
    await refreshInventory();
    
 const mappedTransfers = (result.transfer_plan_preview || []).map(
  (row, index) => ({
    id: `${row.facility_id}-${row.medicine_id}-${index}`,
    from: row.facility_name || row.facility_id || "Unknown facility",
    to: row.destination_facility || "Unknown destination",
    medicine: row.medicine_name || "Unknown medicine",
    quantity: Number(row.recommended_transfer_quantity || 0),
    cost: Number(row.estimated_transport_cost || 0),
    status: "Pending Review",

    // Source hospital coordinates
    source_latitude:
      row.source_latitude ?? row.facility_latitude ?? null,
    source_longitude:
      row.source_longitude ?? row.facility_longitude ?? null,

    // Destination hospital coordinates
    destination_latitude:
      row.destination_latitude ?? row.destination_lat ?? null,
    destination_longitude:
      row.destination_longitude ?? row.destination_lng ?? null,

    distance: Number(
      row.transport_distance_km ?? row.distance_km ?? row.distance ?? 0
    ),

    time:
      row.transport_time_hours != null
        ? `${Number(row.transport_time_hours).toFixed(1)} hours`
        : "Not calculated",
  })
);

setRealTransfers(mappedTransfers);
setTransfers(mappedTransfers);


    setNotice(
      `Optimization completed! ${result.summary.total_units_to_transfer.toLocaleString("en-IN")} units recommended across ${result.summary.active_routes} routes.`
    );
  } catch (error) {
    setOptimizationError(
      error.message || "Something went wrong while connecting to the backend."
    );
  } finally {
    setIsOptimizing(false);
  }
}

function downloadOptimizationResults() {
  window.location.href = "http://127.0.0.1:8000/download-results";
}

  const filteredInventory = useMemo(() => inventory.filter((item) => {
    const term = search.toLowerCase();
    const matchesSearch = [item.hospital, item.medicine, item.category].some((value) => value.toLowerCase().includes(term));
    return matchesSearch && (statusFilter === "All" || item.status === statusFilter);
  }), [inventory, search, statusFilter]);

  const filteredTransfers = useMemo(() => transfers.filter((item) =>
    [item.from, item.to, item.medicine, item.id].some((value) => value.toLowerCase().includes(search.toLowerCase()))
  ), [transfers, search]);

  function navigate(page) {
    setActivePage(page);
    setSearch("");
    setStatusFilter("All");
    setMobileNavOpen(false);
  }

  function handleReview(transfer) {
    setSelectedTransfer(transfer);
    setNotice("");
  }

  function updateTransfer(status) {
    setTransfers((current) => current.map((item) =>
      item.id === selectedTransfer.id ? { ...item, status } : item
    ));
    setNotice(`${selectedTransfer.id} marked "${status}". This is a local demo action only.`);
    setSelectedTransfer(null);
  }

  function exportReport() {
    const rows = [
      ["Hospital", "Medicine", "Category", "Available", "Daily Demand", "Safety Stock", "Expiry Days", "Status"],
      ...inventory.map((item) => [item.hospital, item.medicine, item.category, item.stock, item.demand, item.safety, item.expiry, item.status]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "medishare-demo-inventory.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const pageDescriptions = {
    Inventory: "Search medicine stock, safety thresholds and expiry information.",
    "Shortage Alerts": "Review stock records that may need urgent attention.",
    Redistribution: "Review suggested transfers between hospitals.",
    "Route Map": "Explore illustrative hospital locations and a sample transport route.",
    Reports: "Export the current sample inventory for analysis.",
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><span>✚</span></div>
          <div><strong>MediShare<span> AI</span></strong><small>SMART HEALTHCARE LOGISTICS</small></div>
          <button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">×</button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="navigation" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.name} className={`nav-item ${activePage === item.name ? "nav-active" : ""}`} onClick={() => navigate(item.name)}>
              <Icon>{item.icon}</Icon>
              <span>{item.name}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="network-card">
            <div className="network-icon">✚</div>
            <strong>Connected for good.</strong>
            <p>Smarter redistribution. Less medicine waste.</p>
            <div className="network-status"><span /> Demo environment</div>
          </div>
          <div className="profile">
            <div className="profile-avatar">MS</div>
            <div><strong>Network Admin</strong><small>Demo workspace</small></div>
            <span className="profile-dots">···</span>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close menu" />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">☰</button>
          <div className="breadcrumb">Workspace <span>/</span> <strong>{activePage}</strong></div>
          <div className="topbar-right">
            <label className="global-search">
              <span>⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search medicines, hospitals..." aria-label="Search dashboard" />
              <kbd>⌘ K</kbd>
            </label>
            <span className="topbar-divider" />
            <button className="notification-button" onClick={() => navigate("Shortage Alerts")} aria-label="View shortage alerts">♧<i /></button>
            <div className="top-avatar">MS</div>
          </div>
        </header>

        <div className="content-area">
          {notice && <div className="notice-banner">{notice}<button onClick={() => setNotice("")}>×</button></div>}

          
{activePage === "Dashboard" && (
  <>
    <section className="panel" style={{ padding: "24px", marginBottom: "24px" }}>
      <div className="panel-header">
        <div>
          <h2>AI Medicine Redistribution</h2>
          <p>Upload your dataset and generate optimized transfer recommendations.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="file"
          accept=".csv"
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] || null);
            setOptimizationError("");
          }}
        />

        <button
          className="button button-primary"
          onClick={runOptimization}
          disabled={isOptimizing}
        >
          {isOptimizing ? "Optimizing..." : "Run AI Optimization"}
        </button>
      </div>

      {selectedFile && (
        <p style={{ marginTop: "12px" }}>
          Selected file: <strong>{selectedFile.name}</strong>
        </p>
      )}

      {optimizationError && (
        <p role="alert" style={{ color: "#dc2626", marginTop: "12px" }}>
          {optimizationError}
        </p>
      )}

      {optimizationSummary && (
        <div style={{ marginTop: "24px" }}>
          <h3>Optimization Results</h3>

          <div className="stat-grid">
            <StatCard
              icon="⇄"
              label="Units to transfer"
              value={optimizationSummary.total_units_to_transfer.toLocaleString("en-IN")}
              note="Recommended transfer quantity"
              color="green"
            />

            <StatCard
              icon="⌖"
              label="Active routes"
              value={optimizationSummary.active_routes}
              note="Routes with recommended transfers"
              color="blue"
            />

            <StatCard
              icon="₹"
              label="Estimated transport cost"
              value={`₹${Number(optimizationSummary.estimated_transport_cost).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
              note="Estimated total cost"
              color="purple"
            />
          </div>

          <button
            className="button button-outline"
            onClick={downloadOptimizationResults}
            style={{ marginTop: "16px" }}
          >
            Download Transfer Plan CSV ↓
          </button>

          <p style={{ marginTop: "16px" }}>
            Showing {optimizationRows.length} preview records. Download the CSV
            for the complete transfer plan.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source Facility</th>
                  <th>Medicine</th>
                  <th>Destination</th>
                  <th>Surplus</th>
                  <th>Shortage</th>
                  <th>Recommended Transfer</th>
                  <th>Estimated Cost</th>
                </tr>
              </thead>

              <tbody>
                {optimizationRows.map((row, index) => (
                  <tr key={`${row.facility_id}-${row.medicine_id}-${index}`}>
                    <td>{row.facility_name || row.facility_id}</td>
                    <td>{row.medicine_name}</td>
                    <td>{row.destination_facility}</td>
                    <td>{row.surplus_quantity}</td>
                    <td>{row.shortage_quantity}</td>
                    <td>
                      <strong>{row.recommended_transfer_quantity}</strong>
                    </td>
                    <td>
                      ₹{Number(row.estimated_transport_cost).toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="footer-note">
            These are recommendations for human review, not authorization to
            transfer medicines. Verify expiry, storage temperature, stock
            availability and applicable requirements before acting.
          </p>
        </div>
      )}
    </section>

    <Dashboard
      onNavigate={navigate}
      inventory={inventory}
      transfers={transfers}
      onReview={handleReview}
    />
  </>
)}
```

          {activePage === "Inventory" && (
            <>
              <div className="page-heading">
                <div><div className="eyebrow">STOCK MANAGEMENT</div><h1>Medicine inventory</h1><p>{pageDescriptions.Inventory}</p></div>
                <button className="button button-primary" onClick={exportReport}>↓ Export CSV</button>
              </div>
              <div className="filter-bar">
                <div className="filter-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicine or hospital..." /></div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by stock status">
                  {["All", "Surplus", "Adequate", "Shortage", "Expiring Soon"].map((status) => <option key={status}>{status}</option>)}
                </select>
                <span className="results-count">{filteredInventory.length} records</span>
              </div>
              <section className="panel full-table-panel"><InventoryTable items={filteredInventory} /></section>
              <div className="footer-note">Stock status is illustrative. Confirm local inventory and actual expiry dates before acting.</div>
            </>
          )}

          
{activePage === "Shortage Alerts" && (
  <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">RISK MONITORING</div>
        <h1>Shortage alerts</h1>
        <p>{pageDescriptions["Shortage Alerts"]}</p>
      </div>
      <span className="demo-pill">
        <span /> LIVE INVENTORY
      </span>
    </div>

    <div className="stat-grid two-stats">
      <StatCard
        icon="!"
        label="Shortage records"
        value={inventory.filter((i) => i.status === "Shortage").length}
        note="Stock below daily demand"
        color="red"
      />
      <StatCard
        icon="◷"
        label="Expiry warnings"
        value={inventory.filter((i) => i.status === "Expiring Soon").length}
        note="Expiring within 30 days"
        color="purple"
      />
    </div>

    <section className="panel full-table-panel">
      <div className="panel-header">
        <div>
          <h2>Attention required</h2>
          <p>Medicines with shortages or approaching expiry</p>
        </div>
      </div>

      <InventoryTable
        items={inventory.filter(
          (i) =>
            i.status === "Shortage" ||
            i.status === "Expiring Soon"
        )}
      />
    </section>
  </>
)}

         
{activePage === "Redistribution" && (
  <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">DECISION SUPPORT</div>
        <h1>Redistribution center</h1>
        <p>{pageDescriptions.Redistribution}</p>
      </div>
      <span className="demo-pill">
        <span /> OPTIMIZATION RESULTS
      </span>
    </div>

    <div className="callout">
      <span>✦</span>
      <div>
        <strong>AI-assisted decision support</strong>
        <p>
          These transfer recommendations come from your latest optimization
          run. Validate medicine suitability, expiry dates, and destination
          requirements before approving any real transfer.
        </p>
      </div>
    </div>

    <div className="transfer-summary">
      <div>
        <small>PROPOSED TRANSFERS</small>
        <strong>{transfers.length}</strong>
      </div>

      <div>
        <small>RECOMMENDED UNITS</small>
        <strong>
          {transfers
            .reduce((sum, transfer) => sum + transfer.quantity, 0)
            .toLocaleString("en-IN")}
        </strong>
      </div>

      <div>
        <small>ESTIMATED COST</small>
        <strong>
          ₹
          {transfers
            .reduce((sum, transfer) => sum + transfer.cost, 0)
            .toLocaleString("en-IN")}
        </strong>
      </div>
    </div>

    {transfers.length > 0 ? (
  <TransferCards
    items={filteredTransfers || transfers}
    onReview={handleReview}
  />
) : (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>No transfer recommendations yet</h2>
            <p>
              Select your CSV dataset and run optimization to generate
              transfer recommendations.
            </p>
          </div>
        </div>
      </section>
    )}
  </>
)}


          {activePage === "Route Map" && (
            <>
              <div className="page-heading"><div><div className="eyebrow">TRANSPORT PLANNING</div><h1>Route explorer</h1><p>{pageDescriptions["Route Map"]}</p></div><span className="demo-pill"><span /> ILLUSTRATIVE</span></div>
              <section className="panel route-map-panel"><div className="panel-header"><div><h2>Hospital distribution network</h2><p>Illustrative positions only — not a live geographic map</p></div></div><MapPanel full selectedRoute={selectedRoute} inventory={inventory} /></section>
             <div className="section-heading">
  <h2>Recommended transfer routes</h2>
  <p>Routes generated from the current optimization results.</p>
</div>
<p>Routes generated from the current optimization results.</p>

<div className="route-options">
  {transfers.length === 0 ? (
    <div className="panel">
      <p>No transfer routes available yet. Upload your inventory data and run optimization first.</p>
    </div>
  ) : (
    transfers.filter((transfer) => transfer.status === "Approved").map((transfer) => (
     <article
  className="route-option"
  key={transfer.id}
  onClick={() => {
    
    console.log("Transfer card clicked:", transfer);
    setSelectedRoute(transfer);
  }}
  style={{ cursor: "pointer" }}
>
        <div className="route-option-top">
          <span className="route-option-icon">⌖</span>
          <Status value={transfer.status} />
        </div>

        <strong>{transfer.from}</strong>

        <div className="route-arrow">
          ↓ {Number(transfer.distance || 0).toFixed(1)} km · {transfer.time || "Travel time unavailable"}
        </div>

        <strong>{transfer.to}</strong>

        <div className="route-cost">
          <span>Estimated transport cost</span>
          <strong>
            {Number.isFinite(Number(transfer.cost))
              ? `₹${Number(transfer.cost).toLocaleString("en-IN", {
                  maximumFractionDigits: 2,
                })}`
              : "Unavailable"}
          </strong>
        </div>
      </article>
    ))
  )}
</div>
            </>
          )}

          {activePage === "Reports" && (
            <>
              <div className="page-heading"><div><div className="eyebrow">ANALYTICS & EXPORTS</div><h1>Reports</h1><p>{pageDescriptions.Reports}</p></div><button className="button button-primary" onClick={exportReport}>↓ Download inventory CSV</button></div>
              <div className="report-grid">
                <section className="panel report-card"><div className="report-icon blue">▤</div><h2>Inventory report</h2><p>Export hospital, medicine, stock, demand, safety stock, expiry and status fields as a CSV file.</p><button className="button button-outline" onClick={exportReport}>Export inventory →</button></section>
                <section className="panel report-card"><div className="report-icon green">⇄</div><h2>Transfer overview</h2><p>{transfers.length} sample recommendations with a combined illustrative transport cost of ₹{transfers.reduce((sum, t) => sum + t.cost, 0).toLocaleString("en-IN")}.</p><button className="button button-outline" onClick={() => navigate("Redistribution")}>Review transfers →</button></section>
              </div>
              <section className="panel full-table-panel"><div className="panel-header"><div><h2>Expiry watchlist</h2><p>Sample stock records expiring within 30 days</p></div></div><InventoryTable items={inventory.filter((item) => item.expiry <= 30)} /></section>
            </>
          )}

          <footer className="app-footer"><span>© 2026 MediShare AI</span><span><i /> Frontend demo · Backend integration pending</span></footer>
        </div>
      </main>

      {selectedTransfer && (
        <div className="modal-backdrop" onClick={() => setSelectedTransfer(null)}>
          <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top"><div className="modal-icon">⇄</div><button className="icon-button" onClick={() => setSelectedTransfer(null)} aria-label="Close dialog">×</button></div>
            <div className="eyebrow">TRANSFER REVIEW · {selectedTransfer.id}</div>
            <h2 id="review-title">Review recommendation</h2>
            <p className="modal-description">Check the sample transfer details before changing its demo status.</p>
            <div className="review-details">
              <div><span>Source hospital</span><strong>{selectedTransfer.from}</strong></div>
              <div><span>Destination hospital</span><strong>{selectedTransfer.to}</strong></div>
              <div><span>Medicine</span><strong>{selectedTransfer.medicine}</strong></div>
              <div><span>Proposed quantity</span><strong>{selectedTransfer.quantity} units</strong></div>
              <div><span>Illustrative route</span><strong>{selectedTransfer.distance} km · {selectedTransfer.time}</strong></div>
              <div><span>Illustrative transport cost</span><strong>₹{selectedTransfer.cost}</strong></div>
            </div>
            <div className="modal-warning">Demo only: these actions do not dispatch medicines, reserve stock or contact hospitals. Validate clinical, expiry, cold-chain and regulatory requirements before any real transfer.</div>
            <div className="modal-actions"><button className="button button-outline" onClick={() => updateTransfer("Rejected")}>Reject</button><button className="button button-primary" onClick={() => updateTransfer("Approved")}>Approve </button></div>
          </section>
        </div>
      )}
    </div>
  );
}


function TransferCards({ items = [], onReview }) {
  if (items.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>No matching transfers</h2>
            <p>
              Run optimization or adjust your filters to see transfer
              recommendations.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="transfer-list">
      {items.map((transfer) => (
        <article className="panel transfer-card" key={transfer.id}>
          <div className="panel-header">
            <div>
              <h2>{transfer.medicine || "Medicine transfer"}</h2>
              <p>
                {transfer.from || "Unknown source"} →{" "}
                {transfer.to || "Unknown destination"}
              </p>
            </div>

            <Status value={transfer.status || "Pending Review"} />
          </div>

          <div className="transfer-summary">
            <div>
              <small>QUANTITY</small>
              <strong>
                {Number(transfer.quantity || 0).toLocaleString("en-IN")} units
              </strong>
            </div>

            <div>
              <small>ESTIMATED COST</small>
              <strong>
                ₹
                {Number(transfer.cost || 0).toLocaleString("en-IN", {
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>
          </div>

          <button
            className="button button-primary"
            onClick={() => onReview(transfer)}
          >
            Review transfer →
          </button>
        </article>
      ))}
    </div>
  );
}

export default App;
