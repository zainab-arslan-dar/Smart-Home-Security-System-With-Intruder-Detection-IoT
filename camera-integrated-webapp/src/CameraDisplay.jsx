import React, { useState, useEffect, useCallback } from 'react';

// Define the dimensions based on your captured BMP file (240px W x 320px H)
const IMAGE_WIDTH = '240px';
const IMAGE_HEIGHT = '320px';

const CameraDisplay = () => {
    // Note: The image URL should be fully qualified if the app is hosted elsewhere, 
    // but '/api/camera/latest-image' works for local development/proxy setup.
    const [imageSrc, setImageSrc] = useState("/api/camera/latest-image");
    const [imageLoading, setImageLoading] = useState(false);
    const [error, setError] = useState(null);
    const [imageTimestamp, setImageTimestamp] = useState('N/A');

    const refreshImage = useCallback(() => {
        // 1. Create the cache-busting URL IMMEDIATELY
        const newImage = `/api/camera/latest-image?ts=${Date.now()}`;
        
        // 2. Set the image source state immediately, forcing the <img> tag to use the new URL
        setImageSrc(newImage); 
        
        setImageLoading(true);
        setError(null);

        // 3. Use a temporary image object for loading/error detection
        const temp = new Image();

        // Use setTimeout to allow the browser a moment to start the load
        // and to ensure the state update has finished
        setTimeout(() => {
            temp.onload = () => {
                // Image successfully loaded into the DOM via state update
                setImageTimestamp(new Date().toLocaleTimeString());
                setImageLoading(false);
            };

            temp.onerror = () => {
                // If the temporary image fails, it means the URL is bad/server is down
                setError("Failed to load camera image. Check Flask server and C# app.");
                setImageLoading(false);
                setImageTimestamp("Failed");
                // Optionally revert to a placeholder or the last known good image
            };

            // Start the load on the temporary object
            temp.src = newImage; 
        }, 50); // Small delay to ensure state update has been processed
    }, []);

    useEffect(() => {
        refreshImage(); // initial load
        const interval = setInterval(refreshImage, 5000); // every 5 seconds
        return () => clearInterval(interval);
    }, [refreshImage]);

    return (
        // The outer div acts as the main frame for the card slot.
        <div className="flex flex-col items-center justify-center">

            {/* Image Container: Enforces 240x320 dimensions */}
            <div 
                className="relative border-4 border-gray-200 rounded-lg overflow-hidden shadow-xl bg-gray-900"
                style={{
                    width: IMAGE_WIDTH,
                    height: IMAGE_HEIGHT,
                    minWidth: IMAGE_WIDTH,
                    minHeight: IMAGE_HEIGHT
                }}
            >
                {imageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                    </div>
                )}
                
                {/* Image Element */}
                {imageSrc && !error ? (
                    <img
                        src={imageSrc}
                        alt="Security Camera Feed"
                        // Tailwind classes removed and replaced by object-fit style
                        className="w-full h-full"
                        style={{ objectFit: 'contain' }} // Ensures the vertical image is fully visible inside the frame
                    />
                ) : (
                    // Placeholder when image fails to load
                    <div className="w-full h-full flex items-center justify-center text-white text-lg p-2">
                        {error || "No Image Feed"}
                    </div>
                )}

                {/* Footer/Timestamp Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-1 text-white text-xs flex justify-between">
                    <span>Last Update: {imageTimestamp}</span>
                </div>
            </div>
            
            {/* Manual Refresh Button (outside the image frame) */}
            <button 
                onClick={refreshImage} 
                disabled={imageLoading}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition disabled:bg-indigo-400"
            >
                {imageLoading ? 'Loading...' : 'Refresh Snapshot'}
            </button>
        </div>
    );
};

export default CameraDisplay;