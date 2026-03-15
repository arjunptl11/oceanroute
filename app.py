from flask import Flask, request, jsonify, render_template
import math

app = Flask(__name__)

# -----------------------------------------------
# OceanRoute - Smart Shipping for Marine Life
# Built for SMathHacks 2026 - Under the Sea
# Data Science Track
# -----------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/calculate-disturbance', methods=['POST'])
def calculate_disturbance():
    """
    Calculate whale disturbance score based on:
    - Distance between ship route and whale route
    - Noise level of ships (decibels)
    - Number of ships in region (density)

    Formula:
        disturbance = ship_density * (noise_level / 100) * overlap_factor
        overlap_factor = 1 / (distance + 1)

    Returns a score from 0 to 100.
    """
    data = request.get_json()

    ship_coords = data.get('ship_coordinates', [])   # list of [lat, lng]
    whale_coords = data.get('whale_coordinates', []) # list of [lat, lng]
    noise_level = float(data.get('noise_level', 120))
    ship_density = float(data.get('ship_density', 10))

    if not ship_coords or not whale_coords:
        return jsonify({'error': 'Missing coordinates'}), 400

    # find the minimum distance between any ship point and any whale point
    min_distance = float('inf')
    for s in ship_coords:
        for w in whale_coords:
            dist = haversine_distance(s[0], s[1], w[0], w[1])
            if dist < min_distance:
                min_distance = dist

    # overlap factor: closer = higher disturbance
    # distance in km, using +1 to avoid division by zero
    overlap_factor = 1.0 / (min_distance + 1)

    # noise factor: 50dB baseline, scaled to 0-1
    noise_factor = (noise_level - 50) / 150.0
    noise_factor = max(0, min(1, noise_factor))

    # density factor: scaled to 0-1 (max 50 ships)
    density_factor = ship_density / 50.0

    # raw disturbance score
    raw_score = density_factor * noise_factor * overlap_factor * 10000

    # clamp to 0-100
    disturbance_score = min(100, max(0, round(raw_score, 1)))
    whale_safety_score = round(100 - disturbance_score, 1)

    # rough estimate of affected whales (purely illustrative)
    affected_whales = int((disturbance_score / 100) * 2300)

    return jsonify({
        'disturbance_score': disturbance_score,
        'whale_safety_score': whale_safety_score,
        'min_distance_km': round(min_distance, 1),
        'affected_whales': affected_whales,
        'noise_level': noise_level,
        'ship_density': ship_density,
    })


@app.route('/optimize-route', methods=['POST'])
def optimize_route():
    """
    Simple route optimization: nudge each ship coordinate
    slightly away from the nearest whale coordinate.
    Returns adjusted ship coordinates.
    """
    data = request.get_json()
    ship_coords = data.get('ship_coordinates', [])
    whale_coords = data.get('whale_coordinates', [])
    nudge_amount = 2.5  # degrees to shift away

    if not ship_coords or not whale_coords:
        return jsonify({'error': 'Missing coordinates'}), 400

    optimized = []
    for s in ship_coords:
        # find the closest whale point
        closest_whale = min(whale_coords,
            key=lambda w: haversine_distance(s[0], s[1], w[0], w[1]))

        # direction vector away from whale
        dlat = s[0] - closest_whale[0]
        dlng = s[1] - closest_whale[1]
        magnitude = math.sqrt(dlat**2 + dlng**2) + 0.0001

        # normalize and apply nudge
        new_lat = s[0] + (dlat / magnitude) * nudge_amount
        new_lng = s[1] + (dlng / magnitude) * nudge_amount

        # clamp lat/lng to valid range
        new_lat = max(-85, min(85, new_lat))
        new_lng = max(-180, min(180, new_lng))

        optimized.append([round(new_lat, 4), round(new_lng, 4)])

    return jsonify({'optimized_coordinates': optimized})


def haversine_distance(lat1, lng1, lat2, lng2):
    """
    Calculate the great-circle distance between two points
    on Earth in kilometers using the Haversine formula.
    """
    R = 6371  # Earth's radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = math.sin(dphi / 2)**2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


if __name__ == '__main__':
    print("OceanRoute running at http://localhost:5000")
    app.run(debug=True, port=8080)
