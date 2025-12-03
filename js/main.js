// ======================
// MAP SETUP
// ======================
const map = L.map("map", {
  zoomSnap: 0,
  scrollWheelZoom: false
}).setView([39.99, -75.12], 11);

L.tileLayer(
  "https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}@2x?access_token=pk.eyJ1Ijoibm9kaSIsImEiOiJjbWZlYzdldXMwNWhxMnNvYzNvOWM1c3l1In0.M5eQdMz9QGmElmCb4_mvGg",
  {
    maxZoom: 18,
    zoomOffset: -1,
    tileSize: 512,
    attribution: "&copy; Mapbox & OSM"
  }
).addTo(map);

let tractGeojson = null;
let burdenData = null;
let searchMarker = null;
let currentTractGEOID = null;

// ======================
// REGRESSION COEFFICIENTS (from R model)
// ======================
const COEF = {
  intercept: 11.9792,

  housing: {
    "OWNER 1 DETACHED": -13.9688,
    "OWNER 10-19 UNIT": -10.0243,
    "OWNER 2 UNIT": -2.5044,
    "OWNER 20-49 UNIT": -8.2707,
    "OWNER 3-4 UNIT": -1.5441,
    "OWNER 5-9 UNIT": -8.2854,
    "OWNER 50+ UNIT": -9.8844,
    "OWNER BOAT_RV_VAN": -11.5456,
    "OWNER MOBILE_TRAILER": -1.4856,

    "RENTER 1 ATTACHED": -0.1838,
    "RENTER 1 DETACHED": -13.9966,
    "RENTER 10-19 UNIT": -14.8626,
    "RENTER 2 UNIT": -10.4705,
    "RENTER 20-49 UNIT": -14.1620,
    "RENTER 3-4 UNIT": -13.9941,
    "RENTER 5-9 UNIT": -13.6238,
    "RENTER 50+ UNIT": -14.1765,
    "RENTER BOAT_RV_VAN": 13.2704,
    "RENTER MOBILE_TRAILER": -6.3555
  },

  bucket: {
    "$150k+": -0.3788,
    "$20k–$30k": 20.3513,
    "$30k–$40k": 12.8207,
    "$40k–$50k": 9.3714,
    "$50k–$60k": 6.4077,
    "$60k–$75k": 4.1346,
    "$75k–$100k": 1.3476,
    "Under $20k": 14.7426
  }
};



// ======================
// NORMALIZATION HELPERS
// ======================
function normalize(str) {
  if (!str) return "";
  return str.toString().trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeIncome(x) {
  if (!x) return "";
  return x
    .toString()
    .toUpperCase()
    .trim()
    .replace(/–/g, "-")     // force hyphen
    .replace(/\s+/g, "");   // remove ALL spaces
}

function normalizeGEOID(g) {
  if (!g) return "";
  return g.toString().trim().slice(0, 11);   // keep only the first 11 digits
}


// ======================
// REGRESSION PREDICTOR
// ======================
function predictBurden(housingType, incomeBucket) {
  let y = COEF.intercept;

  if (COEF.housing[housingType]) {
    y += COEF.housing[housingType];
  }

  if (COEF.bucket[incomeBucket]) {
    y += COEF.bucket[incomeBucket];
  }

  return Math.max(0, y);  // no negative values
}




// ======================
// LOAD DATA
// ======================
async function loadData() {
  tractGeojson = await fetch("data/tracts.geojson").then(r => r.json());
  burdenData = Papa.parse(await fetch("data/burden_lookup_clean.csv").then(r => r.text()), {
    header: true,
    dynamicTyping: false
  }).data;

  L.geoJSON(tractGeojson, {
    style: { color: "#1E90FF", weight: 1, fillOpacity: 0.4 }
  }).addTo(map);

  console.log("Loaded data.");
}
loadData();


// ======================
// GEOCODING
// ======================
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.length) return null;

  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}


// ======================
// FIND TRACT USING TURF
// ======================
function findTract(lat, lon) {
  const pt = turf.point([lon, lat]);

  for (const f of tractGeojson.features) {
    if (turf.booleanPointInPolygon(pt, f)) return f;
  }
  return null;
}


// ======================
// SEARCH BUTTON
// ======================
document.getElementById("searchBtn").addEventListener("click", async () => {
  const address = document.getElementById("addressInput").value;
  if (!address) {
    alert("Enter an address.");
    return;
  }

  const loc = await geocode(address);
  if (!loc) {
    alert("Could not find that address.");
    return;
  }

  map.setView([loc.lat, loc.lon], 13);

  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([loc.lat, loc.lon]).addTo(map);

  const tract = findTract(loc.lat, loc.lon);
  if (!tract) {
    alert("Could not determine census tract.");
    return;
  }

  currentTractGEOID = tract.properties.GEOID.toString();

  document.getElementById("results").innerHTML = `
    <h3>Results</h3>
    <p><strong>Tract GEOID:</strong> ${currentTractGEOID}</p>
  `;

  document.getElementById("verdictText").innerHTML =
    "Select housing + income to calculate burden.";
});


// ======================
// CALCULATE BURDEN (REGRESSION MODEL VERSION)
// ======================
document.getElementById("calcBtn").addEventListener("click", () => {
  if (!currentTractGEOID) {
    alert("Search for an address first.");
    return;
  }

  const housing = document.getElementById("housingSelect").value;
  const incomeBucket = document.getElementById("incomeSelect").value;

  if (!housing || !incomeBucket) {
    alert("Select housing and income.");
    return;
  }

  const predicted = predictBurden(housing, incomeBucket);

  document.getElementById("verdictText").innerHTML = `
    Predicted energy burden: <strong>${predicted.toFixed(1)}%</strong>
  `;
});