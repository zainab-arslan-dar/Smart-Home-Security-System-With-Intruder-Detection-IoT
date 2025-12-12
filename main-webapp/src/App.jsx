app.jsx import React, { useState, useEffect, useCallback, useRef } from 'react';

// --- GLOBAL CONFIGURATION AND CONSTANTS ---
const THINGSPEAK_URL = "https://api.thingspeak.com/channels/";
const THINGSPEAK_TALKBACK_URL = "https://api.thingspeak.com/talkbacks/";
const POLLING_INTERVAL = 10000; // 10 seconds (Used for Status and Camera Updates)

// Security Configuration
const MASTER_PASSCODE = "2025!"; 
// CRITICAL: We rely purely on the SpeechRecognition confidence score for security checks.
const MIN_CONFIDENCE_THRESHOLD = 0.95; 

// --- VOICE COMMAND PHRASES (REQUIRED FOR ENROLLMENT/VERIFICATION) ---
const CRITICAL_COMMANDS = ['lock door', 'unlock door', 'disarm alarm'];
const ENROLLMENT_KEY = 'voice_enrolled_phrases'; // Stores the phrases as text only

// Check for Web Speech API support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Custom hook for exponential backoff fetch
const useFetchWithRetry = () => {
    const fetcher = useCallback(async (url, retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error(Channel not found (404) for URL: ${url});
                    }
                    throw new Error(HTTP error! status: ${response.status});
                }
                return await response.json();
            } catch (error) {
                if (i === retries - 1) {
                    console.error("Fetch failed after all retries:", error);
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }, []);
    return fetcher;
};


// ----------------------------------------------------------------
// --- SVG ICONS & SUB-COMPONENTS (Retained structure) ---
// ----------------------------------------------------------------
const HomeIcon = ({ className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/><path d="M12 2a18 18 0 0 1 6 6c0 3.5-2 6-6 6s-6-2.5-6-6a18 18 0 0 1 6-6z" strokeDasharray="2 4"/></svg>);
const SettingsIcon = ({ className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M15.4 17.6l-2.6-2.6"/><path d="M10.2 10.2 7.6 7.6"/><path d="M22 12h-4"/><path d="M6 12H2"/><path d="M12 6V2"/><path d="M12 22v-4"/></svg>);
const CpuIcon = ({ className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="12" x="2" y="6" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/></svg>);
const MotionIcon = ({ isActive = false, className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{isActive ? (<><path d="M10 20l4-16"/><path d="M16 4l-4 16"/><path d="M14 12l6 4"/><path d="M4 16l6-4"/></>) : (<circle cx="12" cy="12" r="7"/>)}</svg>);
const LockIcon = ({ isLocked = false, className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d={isLocked ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 9.9-1"}/></svg>);
const BellIcon = ({ isActive = false, className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{isActive ? (<><path d="M10 21v-7a3 3 0 0 1 6 0v7"/><path d="M12 7h.01"/><path d="M11 19c-1.8-1-3-3.3-3-6.1a5 5 0 0 1 10 0c0 2.8-1.2 5.1-3 6.1"/><path d="M12 21v2"/></>) : (<><path d="M12 10a4 4 0 0 0-4 4v2"/><path d="M10 21v-7a3 3 0 0 1 6 0v7"/><path d="M5.1 19C4 18 3 16.5 3 14c0-3.3 2.7-6 6-6 0-3 2-5 6-5 2.2 0 4 1.8 4 4"/><path d="M12 21v2"/></>)}</svg>);
const AlertTriangle = ({ className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>);
const CheckCircle = ({ className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>);
const InfoIcon = ({ className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>);
const MicIcon = ({ className = "w-6 h-6" }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>);


// ----------------------------------------------------------------
// --- SUB-COMPONENTS (Skipped for brevity, retained structure) ---
// ----------------------------------------------------------------
const StatusPill = (props) => { 
    let colorClasses;
    let pulseClass = "";
    
    switch (props.value) {
        case 'CLEAR':
        case 'UNLOCKED':
            colorClasses = props.value === 'CLEAR' ? "bg-green-100 text-emerald-600" : "bg-amber-100 text-amber-600";
            break;
        case 'LOCKED':
        case 'MOTION DETECTED':
            colorClasses = "bg-red-100 text-red-600";
            if (props.value === 'MOTION DETECTED' && props.isPulsing) {
                pulseClass = "animate-pulse";
            }
            break;
        case 'DISARMED':
        default:
            colorClasses = "bg-gray-200 text-gray-600";
            break;
    }

    return (
        <div className="status-card text-center bg-white rounded-lg p-3 border border-gray-100">
            <h4 className="text-sm text-gray-500 font-normal mb-2">{props.label}</h4>
            <span className={status-indicator px-3 py-1 rounded-full font-semibold text-sm inline-block shadow-sm transition-all duration-300 ${colorClasses} ${pulseClass}}>
                {props.value}
            </span>
        </div>
    );
};
const MessageBox = (props) => { 
    if (!props.message) return null;
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
                <h3 className="text-xl font-bold mb-3 text-gray-800">{props.title}</h3>
                <p className="text-gray-600 mb-4">{props.message}</p>
                <button onClick={props.onClose} className="w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-300">
                    OK
                </button>
            </div>
        </div>
    );
};
const AlertCard = (props) => { 
    let bgColor, icon, titleColor, borderColor; 

    if (props.alert.type === 'intruder') {
        bgColor = 'bg-red-50';
        icon = AlertTriangle;
        titleColor = 'text-red-700';
        borderColor = 'border-red-700';
    } else if (props.alert.type === 'valid') {
        bgColor = 'bg-green-50';
        icon = CheckCircle;
        titleColor = 'text-green-700';
        borderColor = 'border-green-700';
    } else {
        bgColor = 'bg-gray-50';
        icon = InfoIcon;
        titleColor = 'text-gray-800';
        borderColor = 'border-gray-400';
    }

    const AlertIcon = icon; 

    return (
        <div className={${bgColor} p-4 rounded-xl shadow-sm border ${borderColor} flex flex-col mb-3}>
            <div className="flex justify-between items-start">
                <div className="flex items-center">
                    <AlertIcon className={w-6 h-6 mr-3 ${titleColor}} /> 
                    <h4 className={text-lg font-bold ${titleColor}}>{props.alert.title}</h4>
                </div>
                <button onClick={() => props.onMarkAsRead(props.alert.id)} className="text-gray-400 hover:text-gray-600 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <p className="text-gray-700 mt-2 ml-9 text-sm">{props.alert.message}</p>
            <div className="text-xs text-gray-500 mt-2 ml-9 flex justify-between items-center">
                <span>{props.alert.time}</span>
            </div>
        </div>
    );
};


// ----------------------------------------------------------------
// --- MAIN APP COMPONENT ---
// ----------------------------------------------------------------

const App = () => {
    const fetchWithRetry = useFetchWithRetry();
    
    // --- STATE DEFINITIONS ---
    const [enrolledPhrases, setEnrolledPhrases] = useState(() => {
        const stored = localStorage.getItem(ENROLLMENT_KEY);
        try {
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const [isListening, setIsListening] = useState(false); 
    const [config, setConfig] = useState({ dataChannelId: '', readApiKey: '', talkBackId: '' });
    const [status, setStatus] = useState({
        pir: 'Initializing...', door: 'Initializing...', alarm: 'Initializing...',
        rfid: 'N/A', lastUpdated: '--'
    });
    const [alerts, setAlerts] = useState([]);
    const [isConfigured, setIsConfigured] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false); 
    const [isLoading, setIsLoading] = useState(false);
    const [commandMessage, setCommandMessage] = useState('');
    const [messageBox, setMessageBox] = useState({ message: '', title: '' });
    const [isSendingCommand, setIsSendingCommand] = useState(false);
    
    // Image State
    const [imageTimestamp, setImageTimestamp] = useState('--');
    const [imageLoading, setImageLoading] = useState(false);
    const [imageSrc, setImageSrc] = useState("https://placehold.co/800x450/b0b0b0/ffffff?text=Waiting+for+Image");

    const prevRfidRef = useRef(null);
    const prevPirRef = useRef(null);
    const timerRef = useRef(null);
    const recognitionRef = useRef(null);


    // --- UTILITY FUNCTIONS ---
    const closeMessageBox = () => setMessageBox({ title: '', message: '', onClose: null }); 
    const showMessageBox = useCallback((title, message, callback) => {
        setMessageBox({ title, message, onClose: callback ? () => { closeMessageBox(); callback(); } : closeMessageBox });
    }, []);
    const clearAlerts = () => setAlerts([]);
    const handleMarkAsRead = (id) => { setAlerts(prev => prev.filter(alert => alert.id !== id)); };

    // --- THINGSPEAK API FUNCTIONS ---
    const updateStatus = useCallback(async () => { /* ... existing implementation ... */ }, [config, fetchWithRetry, showMessageBox]);
    
    // Camera Polling uses the polling interval for refresh timing
    const updateCameraFeed = useCallback(async () => {
        const { dataChannelId } = config;
        if (!dataChannelId) return;

        const imageUrl = https://thingspeak.com/channels/${dataChannelId}/widgets/latest_image.png;
        
        setImageLoading(true);
        const newImageSrc = ${imageUrl}?timestamp=${Date.now()};
        
        const tempImage = new Image();
        tempImage.onload = () => {
            setImageSrc(newImageSrc);
            setImageTimestamp(Last Image Time: ${new Date().toLocaleTimeString()} (Refreshed));
            setImageLoading(false);
        };
        tempImage.onerror = () => {
            setImageLoading(false);
            setImageSrc("https://placehold.co/800x450/b0b0b0/ffffff?text=Image+Load+Failed");
            setImageTimestamp(Last Image Time: N/A - Check Widget Setup);
        };
        tempImage.src = newImageSrc;
    }, [config]);

    const sendCommand = useCallback(async (command) => { /* ... existing implementation ... */ }, [config, fetchWithRetry, updateStatus, showMessageBox]);
    const generateAlerts = useCallback((latestFeed) => { /* ... existing implementation ... */ }, []);



    // Helper to start Speech Recognition and return promise for transcript/confidence
    const recordTranscript = () => {
        return new Promise((resolve, reject) => {
            const rec = new SpeechRecognition();
            rec.lang = 'en-US';
            rec.continuous = false;
            rec.interimResults = false;

            rec.onstart = () => setIsListening(true);
            rec.onend = () => setIsListening(false);
            
            rec.onresult = (event) => {
                const result = event.results[0][0];
                resolve({ transcript: result.transcript.toLowerCase().trim(), confidence: result.confidence });
            };

            rec.onerror = (event) => {
                reject(new Error(Speech recognition failed: ${event.error}));
            };
            
            try {
                rec.start();
            } catch (err) {
                reject(new Error(Failed to start speech recognition.));
            }
        });
    };

    // --- ENROLLMENT LOGIC (Simple text saving) ---
    const enrollVoice = () => {
        if (!SpeechRecognition) {
            showMessageBox("Error", "Speech Recognition is not available in this browser.");
            return;
        }

        let commandIndex = 0;
        const totalRequired = CRITICAL_COMMANDS.length; // 3 recordings total (once each)

        const nextStep = async () => {
            if (commandIndex >= CRITICAL_COMMANDS.length) {
                // Enrollment complete
                setEnrolledPhrases(CRITICAL_COMMANDS); // Save the official phrases
                localStorage.setItem(ENROLLMENT_KEY, JSON.stringify(CRITICAL_COMMANDS));
                showMessageBox("Enrollment SUCCESSFUL", You successfully confirmed and saved the 3 phrases. Voice control is now enabled.);
                return;
            }

            const expectedCommand = CRITICAL_COMMANDS[commandIndex];
            
            try {
                // 1. Prompt and wait for OK click (Acquiring mic access on click)
                const message = Recording ${commandIndex + 1} of ${totalRequired}. Say: "${expectedCommand.toUpperCase()}" clearly.;
                await new Promise(resolve => showMessageBox("Voice Enrollment", message, resolve));
                
                // 2. Record mic and transcribe
                showMessageBox("Voice Enrollment", "Listening for your phrase...");
                const { transcript, confidence } = await recordTranscript();
                
                // 3. Text Match and Confidence Check (Enrollment only needs basic check)
                if (confidence === 0 || !transcript.includes(expectedCommand)) {
                    // This error is now clearer and allows retry
                    showMessageBox("Enrollment Failed", Transcript: "${transcript}". Clarity too low or phrase mismatch. Please retry., nextStep);
                    return;
                }

                // 4. Record Success and Move to next command
                commandIndex++;
                showMessageBox("Voice Enrollment", Phrase saved! Progress: ${commandIndex}/${totalRequired}. Prepare for the next command., nextStep);

            } catch (error) {
                showMessageBox("Enrollment Error", Recording failed: ${error.message || 'Aborted'}. Please ensure microphone is active and retry., nextStep);
            }
        };

        // Clear existing enrollment data before starting
        setEnrolledPhrases([]);
        localStorage.removeItem(ENROLLMENT_KEY);
        nextStep(); // Start the sequence
    };

    // --- VERIFICATION LOGIC (Used by Verify Button) ---
    const verifyVoice = async () => {
        if (!SpeechRecognition) {
            showMessageBox("Error", "Speech Recognition is not available in this browser.");
            return;
        }
        if (enrolledPhrases.length < CRITICAL_COMMANDS.length) {
            showMessageBox("Verification Failed", "Enrollment is incomplete. Please enroll all 3 phrases first.");
            return;
        }
        
        try {
            // 1. Prompt for phrase and wait for transcription
            const message = "Say one of your enrolled security phrases (e.g., 'LOCK DOOR').";
            await new Promise(resolve => showMessageBox("Voice Verification", message, resolve));
            
            showMessageBox("Voice Verification", "Listening for your verification phrase...");
            const { transcript, confidence } = await recordTranscript();

            // 2. Strict Security Check: Confidence MUST be 0.95 or higher
            if (confidence < MIN_CONFIDENCE_THRESHOLD) {
                showMessageBox("Verification Failed", Clarity Failure. Confidence (${confidence.toFixed(3)}). Access denied.);
                return;
            }

            // 3. Phrase Match Check
            const isMatch = CRITICAL_COMMANDS.some(cmd => transcript.includes(cmd));

            if (isMatch) {
                showMessageBox("Verification Successful", Voice ACCEPTED! Confidence: ${confidence.toFixed(3)}. Access granted.);
            } else {
                showMessageBox("Verification Failed", "Phrase Mismatch. The spoken command was not recognized as a critical phrase.");
            }

        } catch (error) {
             showMessageBox("Verification Error", Error during verification: ${error.message || 'Aborted'}.);
        }
    };
    
    // --- COMMAND EXECUTION LOGIC (Used by Mic Button) ---
    const toggleVoiceControl = async () => {
        if (!SpeechRecognition) {
            showMessageBox("Error", "Speech Recognition is not available in this browser.");
            return;
        }

        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }
        
        if (enrolledPhrases.length < CRITICAL_COMMANDS.length) {
             showMessageBox("Security Requirement", Enrollment is incomplete. Please enroll all ${CRITICAL_COMMANDS.length} commands.);
             return;
        }

        try {
            // 1. Record text (Transcription only)
            showMessageBox("Command Input", "Listening for your command...");
            const { transcript, confidence } = await recordTranscript();
            setCommandMessage(Spoken: ${transcript} (Conf: ${confidence.toFixed(3)}));

            // 2. Strict Security Check: Confidence MUST be 0.95 or higher
            if (confidence < MIN_CONFIDENCE_THRESHOLD) {
                showMessageBox("ACCESS DENIED", Clarity Failure. Confidence (${confidence.toFixed(3)}). Access denied.);
                return;
            }

            // 3. Execution (Phrase Match)
            if (transcript.includes('lock') && transcript.includes('door')) {
                sendCommand('LOCK_DOOR');
            } else if (transcript.includes('unlock') && transcript.includes('door')) {
                sendCommand('UNLOCK_DOOR');
            } else if (transcript.includes('disarm') && transcript.includes('alarm')) {
                sendCommand('DISARM_ALARM');
            } else {
                 showMessageBox("Command Not Recognized", I did not understand the action in "${transcript}".);
            }

        } catch (error) {
            setCommandMessage(Error: ${error.message || 'Aborted'});
            showMessageBox("Voice Error", Command recording failed: ${error.message}.);
        }
    };
    // ----------------------------------------------------------------


    // --- MAIN APPLICATION FLOW ---
    const startPolling = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        
        // Initial manual update
        updateStatus();
        updateCameraFeed();

        // Start interval
        timerRef.current = setInterval(() => {
            updateStatus();
            updateCameraFeed(); // Camera updates every 10 seconds (POLLING_INTERVAL)
        }, POLLING_INTERVAL);
    }, [updateStatus, updateCameraFeed]);

    const saveConfigAndStartMonitoring = () => {
        const dataId = document.getElementById('dataChannelId').value.trim();
        const readKey = document.getElementById('readApiKey').value.trim();
        const talkbackId = document.getElementById('talkBackId').value.trim();

        if (!dataId || !readKey || !talkbackId) {
            showMessageBox('Configuration Error', 'All three fields are required.');
            return;
        }

        setConfig({ dataChannelId: dataId, readApiKey: readKey, talkBackId: talkbackId });
        setIsConfigured(true);
        setIsLoading(true);

        setTimeout(() => {
            setIsLoading(false);
        }, 1000);
    };
    
    // Cleanup interval on component unmount
    useEffect(() => {
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []); 

    // Start polling once authenticated
    useEffect(() => {
        if (isAuthenticated) startPolling();
    }, [isAuthenticated, startPolling]);
    
    // Variable definitions (moved up for scope fix)
    const pirIsActive = status.pir === 'MOTION DETECTED';
    const doorIsLocked = status.door === 'LOCKED';
    const alarmIsActive = status.alarm === 'ALARM ACTIVE';
    const speechApiAvailable = !!SpeechRecognition;

    // UI RENDERERS (Skipped for brevity, retained structure)
    const renderConfig = () => (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-10 mx-auto max-w-4xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                 <SettingsIcon className="w-5 h-5 mr-2 text-indigo-500" />
                Cloud Connection Setup
            </h2>
            <p className="text-sm text-gray-500 mb-4">Input credentials to link your dashboard to the ThingSpeak Data and TalkBack services. The TalkBack commands will use the Read API Key.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" id="dataChannelId" placeholder="Data Channel ID" className="p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                <input type="text" id="readApiKey" placeholder="Read API Key" className="p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                <input type="text" id="talkBackId" placeholder="TalkBack ID (For Control)" className="p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <button onClick={() => {
                 const dataId = document.getElementById('dataChannelId').value.trim();
                 const readKey = document.getElementById('readApiKey').value.trim();
                 const talkbackId = document.getElementById('talkBackId').value.trim();

                 if (!dataId || !readKey || !talkbackId) {
                     showMessageBox('Configuration Error', 'All three fields are required.');
                     return;
                 }

                 setConfig({ dataChannelId: dataId, readApiKey: readKey, talkBackId: talkbackId });
                 setIsConfigured(true);
                 setIsLoading(true);

                 setTimeout(() => {
                     setIsLoading(false);
                 }, 1000);
            }} className="action-button mt-6 w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-700 transition duration-300">
                Save & Proceed to Login
            </button>

            <div className="mt-8 p-4 bg-gray-100 rounded-lg border border-gray-300">
                <h3 className="text-base font-semibold text-gray-800 mb-2">Voice Debug Console</h3>
                <p className="text-sm flex items-center">
                    <span className={w-3 h-3 rounded-full mr-2 ${speechApiAvailable ? 'bg-green-500' : 'bg-red-500'}}></span>
                    Speech API Status: *{speechApiAvailable ? 'Available' : 'Unavailable'}*
                </p>
                <p className="text-sm flex items-center mt-1">
                    <span className="font-mono text-indigo-800 font-bold">MIN CONFIDENCE: {MIN_CONFIDENCE_THRESHOLD}</span>
                </p>
            </div>
        </div>
    );
    const PasscodeScreen = () => {
        const [passcode, setPasscode] = useState('');
        const [error, setError] = useState('');

        const handleSubmit = (e) => {
            e.preventDefault();
            if (passcode === MASTER_PASSCODE) {
                setIsAuthenticated(true);
                setError('');
                // Real-time alert for successful login
                setAlerts(prev => [{
                    id: Date.now(),
                    type: 'valid',
                    title: 'DASHBOARD ACCESS',
                    message: User logged in successfully.,
                    time: new Date().toLocaleTimeString(),
                }, ...prev]);
            } else {
                setError('Invalid passcode. Please try again.');
                setPasscode('');
            }
        };
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-center">
                        <LockIcon isLocked={true} className="w-6 h-6 mr-2 text-red-500"/>
                        System Locked
                    </h2>
                    <p className="text-gray-600 mb-6">Enter your master security passcode to access the dashboard.</p>
                    <form onSubmit={handleSubmit}>
                        <input
                            type="password"
                            value={passcode}
                            onChange={(e) => setPasscode(e.target.value)}
                            placeholder="Enter Passcode"
                            className="p-3 border border-gray-300 rounded-lg w-full text-center tracking-widest text-lg focus:ring-indigo-500 focus:border-indigo-500"
                            maxLength="8"
                            required
                        />
                        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
                        <button type="submit" className="action-button mt-6 w-full px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-700 transition duration-300">
                            Authenticate
                        </button>
                    </form>
                </div>
            </div>
        );
    };
    const renderDashboard = () => (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            <div className="lg:col-span-2 space-y-8">
                
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">System Overview</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <StatusPill 
                            id="pirStatus" 
                            label="Motion Sensor" 
                            value={status.pir}
                            icon={MotionIcon}
                            isActive={pirIsActive} 
                            pulsing={pirIsActive}
                            activeColor="bg-red-500" 
                            inactiveColor="bg-green-500"
                        />
                        <StatusPill 
                            id="doorState" 
                            label="Door Lock State" 
                            value={status.door}
                            icon={LockIcon}
                            isActive={doorIsLocked} 
                            activeColor="bg-indigo-600" 
                            inactiveColor="bg-yellow-600"
                        />
                         <StatusPill 
                            id="alarmStatus" 
                            label="System Alarm" 
                            value={status.alarm}
                            icon={BellIcon}
                            isActive={alarmIsActive} 
                            activeColor="bg-red-700" 
                            inactiveColor="bg-gray-500"
                        />
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-5 flex items-center">
                        <CpuIcon className="w-5 h-5 mr-2 text-indigo-500" />
                        Remote Door & Siren Control
                    </h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <button onClick={() => sendCommand('LOCK_DOOR')} disabled={isSendingCommand} className="action-button px-6 py-3 bg-red-500 text-white font-semibold rounded-xl shadow-lg hover:bg-red-600 transition duration-300 disabled:opacity-50 flex items-center justify-center">
                             <LockIcon isLocked={true} className="w-5 h-5 mr-2" /> 
                            LOCK DOOR
                        </button>
                        <button onClick={() => sendCommand('UNLOCK_DOOR')} disabled={isSendingCommand} className="action-button px-6 py-3 bg-yellow-500 text-white font-semibold rounded-xl shadow-lg hover:bg-yellow-600 transition duration-300 disabled:opacity-50 flex items-center justify-center">
                            <LockIcon isLocked={false} className="w-5 h-5 mr-2" /> 
                            UNLOCK DOOR
                        </button>
                        <button onClick={() => sendCommand('DISARM_ALARM')} disabled={isSendingCommand} className="action-button px-6 py-3 bg-green-500 text-white font-semibold rounded-xl shadow-lg hover:bg-green-600 transition duration-300 disabled:opacity-50 flex items-center justify-center">
                            <BellIcon isActive={true} className="w-5 h-5 mr-2" />
                            DISARM ALARM
                        </button>
                    </div>
                    <p className="mt-4 text-sm text-center font-medium text-gray-600 italic">
                        {isSendingCommand ? commandMessage : 'Commands sent via ThingSpeak TalkBack'}
                    </p>
                </div>
                
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center">
                            Real-Time Alerts 
                            {alerts.length > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">{alerts.length}</span>
                            )}
                        </h2>
                        <button onClick={clearAlerts} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition disabled:opacity-50" disabled={alerts.length === 0}>
                            Mark all read
                        </button>
                    </div>

                    <div className="space-y-3">
                        {alerts.length === 0 ? (
                            <div className="p-4 bg-gray-200 rounded-xl text-center text-gray-600 font-medium">No new alerts. System status is nominal.</div>
                        ) : (
                            alerts.map(alert => (
                                <AlertCard key={alert.id} alert={alert} onMarkAsRead={handleMarkAsRead} />
                            ))
                        )}
                    </div>
                </div>

            </div>

            <div className="lg:col-span-1 space-y-8">
                
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-indigo-500"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-7h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                        Live Camera Snapshot
                    </h2>
                    <div className="relative overflow-hidden rounded-lg bg-gray-200 aspect-video">
                        <img src={imageSrc} alt="Latest camera snapshot from ThingSpeak" className={w-full h-auto object-cover transition-opacity duration-500 ${imageLoading ? 'opacity-50 blur-sm' : 'opacity-100'}} />
                        {imageLoading && (
                            <div className="absolute inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center">
                                <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">{imageTimestamp}</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h3>
                    <div className="space-y-3">
                        <div className="p-4 bg-gray-50 rounded-lg border">
                            <p className="text-sm font-medium text-gray-600 mb-1">Last RFID Tag</p>
                            <p className="font-mono text-gray-800 text-base break-words">{status.rfid}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg border">
                            <p className="text-sm font-medium text-gray-600 mb-1">Last Update</p>
                            <p className="text-gray-800 text-base">{status.lastUpdated}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-xl font-semibold mb-4 text-gray-700 flex items-center">
                        <span className="mr-2 text-indigo-600">🗣️</span> Voice Command Status
                    </h3>
                    <p className="text-sm text-gray-500 mb-2">
                        Status: <span className={font-semibold ${isListening ? 'text-red-500' : 'text-green-500'}}>{isListening ? 'LISTENING (Say Command)' : 'Ready'}</span>
                    </p>
                    <div className="flex flex-col gap-3">
                         <div className="flex gap-4">
                            <button 
                                className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700 transition duration-150" 
                                onClick={enrollVoice}
                            >
                                Enroll Voice ({enrolledPhrases.length}/{CRITICAL_COMMANDS.length})
                            </button>
                            <button 
                                className="px-4 py-2 bg-indigo-200 text-indigo-700 font-semibold rounded-lg shadow-sm hover:bg-indigo-300 transition duration-150"
                                onClick={verifyVoice}
                                disabled={enrolledPhrases.length < CRITICAL_COMMANDS.length}
                            >
                                Verify Voice
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">
                           {enrolledPhrases.length === CRITICAL_COMMANDS.length ? (
                                <span>*Enrollment Complete.* Voice commands are enabled.</span>
                            ) : (
                                <span className="text-red-500 font-semibold">Enrollment required: {enrolledPhrases.length}/{CRITICAL_COMMANDS.length} phrases saved.</span>
                            )}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                           *Required:* Speak one of the enrolled phrases clearly to execute commands.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="fixed inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center z-50">
                    <div className="p-4 bg-white rounded-xl shadow-lg flex items-center space-x-3">
                        <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-gray-700">Connecting...</span>
                    </div>
                </div>
            );
        }
        if (!isConfigured) return renderConfig();
        if (!isAuthenticated) return <PasscodeScreen />;
        return renderDashboard();
    };

    return (
        <div className="min-h-screen p-4 md:p-10 bg-gray-100 font-sans">
            <header className="mb-10 p-6 bg-indigo-700 text-white rounded-xl shadow-xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <HomeIcon className="w-8 h-8 text-indigo-200" />
                    <h1 className="text-3xl font-extrabold tracking-tight">Sentinel Home IoT</h1>
                </div>
                {isAuthenticated && (
                    <button 
                        onClick={toggleVoiceControl} 
                        disabled={isSendingCommand || enrolledPhrases.length < CRITICAL_COMMANDS.length}
                        className={p-3 rounded-full transition duration-300 ${isListening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-indigo-500 hover:bg-indigo-600'} disabled:opacity-50}
                        title={isListening ? "Listening..." : "Use Voice Command"}
                    >
                        <MicIcon className="w-6 h-6 text-white" />
                    </button>
                )}
            </header>

            {renderContent()}

            <MessageBox 
                message={messageBox.message} 
                title={messageBox.title} 
                onClose={messageBox.onClose || closeMessageBox} 
            />
        </div>
    );
};

export default App;