# OceanRoute: Smart Shipping for Marine Life
### SMathHacks 2026 | Data Science Track | Under the Sea
Live Demo: https://oceanroute.vercel.app/
Backup Demo: https://oceanroute.onrender.com/
---

## What It Does

OceanRoute visualizes how commercial shipping routes overlap with
whale migration paths and calculates a real-time disturbance score.
Users can drag shipping waypoints on an interactive map and instantly
see how route changes affect whale safety.

---

## How to Run 

### 1. Make sure Python is installed
```
python --version
```

### 2. Install Flask
```
pip install flask
```

### 3. Run app
```
python app.py
```

### 4. Open your browser
```
http://localhost:5000
```

---

## Project Structure

```
/oceanroute
├── app.py                    ← Flask backend + disturbance model
├── requirements.txt
├── /templates
│   └── index.html            ← Main UI
├── /static
│   ├── /css
│   │   └── style.css
│   └── /js
│       └── map.js            ← Leaflet map + Chart.js
└── /data
    ├── whale_routes.json     ← Whale migration coordinates
    └── ship_routes.json      ← Default shipping route coordinates
```

---

## The Disturbance Model

```
disturbance_score = density_factor × noise_factor × overlap_factor

where:
  density_factor = ship_density / 50
  noise_factor   = (noise_level - 50) / 150
  overlap_factor = 1 / (min_distance_km + 1)
```

Closer shipping routes and louder engines produce higher disturbance.
Distance is calculated using the Haversine formula (real-world km).

---

## API Endpoints

### POST /calculate-disturbance
Input:
```json
{
  "ship_coordinates": [[lat, lng], ...],
  "whale_coordinates": [[lat, lng], ...],
  "noise_level": 120,
  "ship_density": 10
}
```
Output:
```json
{
  "disturbance_score": 42.3,
  "whale_safety_score": 57.7,
  "min_distance_km": 234.1,
  "affected_whales": 970
}
```

### POST /optimize-route
Automatically nudges ship coordinates away from whale routes.

---

## Environmental Significance

Commercial shipping is one of the leading causes of ocean noise
pollution. Humpback whales rely on low-frequency sound for
communication and navigation over thousands of miles. Even small
route adjustments of 50-100km can dramatically reduce acoustic
overlap with migration corridors.

This tool demonstrates how data-driven route planning could be
used by shipping companies or regulators to minimize marine impact
without significantly increasing shipping costs.

---

Built by Arjun Patel, Aneesh Pudipeddi, Dhruv Mishra, and Sashank Kondraju for SMathHacks 2026
