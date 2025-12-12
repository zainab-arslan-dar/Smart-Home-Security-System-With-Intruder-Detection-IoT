from flask import Flask, request, jsonify, send_file # <-- Use send_file, not send_from_directory, for absolute paths
from flask_cors import CORS
import os

app = Flask(__name__)
# Enable CORS for React app running on localhost:5173 (or whatever port you are using)
CORS(app, resources={r"/*": {"origins": "*"}}) 

# --- CRITICAL PATH DEFINITION ---

# 1. DEFINE THE ABSOLUTE PATH WHERE YOUR C# APP *SAVES* THE FILE.
# Use 'r' before the string (raw string literal) to handle the Windows backslashes correctly.
LATEST_IMAGE_PATH = "C:/Users/zaina/OneDrive/Desktop/OV7670_Pictures/terminal_ov7670_pic.bmp"


# We do NOT need IMAGE_DIR or os.makedirs since the path is absolute and outside the project.
# The variable names like WIDTH/HEIGHT and the upload logic are fine, 
# but the retrieval logic below must be corrected.

# --- END CRITICAL PATH DEFINITION ---

# Define the expected dimensions for OV7670 QVGA YUV422 (for size check)
# WIDTH = 320
# HEIGHT = 240
# You can keep these commented out unless you plan to validate the raw byte size.

@app.route('/upload', methods=['POST'])
def upload_image():
    """
    Endpoint for the C# app to POST the raw image data.
    The C# app must send the data in a 'multipart/form-data' request 
    with the file field named 'image_data'.
    """
    if 'image_data' not in request.files:
        return jsonify({"message": "Error: 'image_data' file part missing from request."}), 400

    raw_data_file = request.files['image_data']
    raw_data = raw_data_file.read()

    # Save the data stream as the latest image file to the absolute path
    try:
        with open(LATEST_IMAGE_PATH, 'wb') as f:
            f.write(raw_data)
    except Exception as e:
        # A 500 error if the path is bad, permissions are denied, or disk is full
        return jsonify({"message": f"Error saving file: {str(e)}"}), 500

    return jsonify({"message": f"Image successfully saved to {LATEST_IMAGE_PATH}", "size": len(raw_data)}), 200

@app.route('/api/camera/latest-image', methods=['GET']) # <-- Changed endpoint name for React
def get_image():
    """
    Endpoint for the React app (dashboard) to GET the latest image file.
    We use send_file() for absolute paths outside the project structure.
    """
    if not os.path.exists(LATEST_IMAGE_PATH):
        # Return a clear error if the C# program hasn't saved the file yet
        return jsonify({"message": "No image available yet at the local path."}), 404
        
    # --- CRITICAL FIX: Use send_file for an absolute path ---
    # send_from_directory is meant for files *within* a defined base directory.
    # send_file() handles the full, absolute path correctly.
    
    # NOTE: Set the correct mimetype based on what the C# app saves (BMP or JPEG)
    return send_file(
        LATEST_IMAGE_PATH, 
        mimetype='image/bmp' # <-- CHANGE THIS if your C# app saves JPEG/JPG
    )

if __name__ == '__main__':
    print(f"Starting Flask server on http://localhost:5000")
    # Set LATEST_IMAGE_PATH as an app configuration for easier debugging/access if needed
    app.config['LATEST_IMAGE_PATH'] = LATEST_IMAGE_PATH 
    app.run(host='0.0.0.0', port=5000, debug=True)