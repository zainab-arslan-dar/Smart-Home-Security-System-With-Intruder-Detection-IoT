import React, { useState, useEffect, useCallback, useRef } from 'react';
import CameraDisplay from './CameraDisplay'; // <--- ADD THIS IMPORT

// --- GLOBAL CONFIGURATION AND CONSTANTS ---
const THINGSPEAK_URL = "https://api.thingspeak.com/channels/";
const THINGSPEAK_TALKBACK_URL = "https://api.thingspeak.com/talkbacks/";
const POLLING_INTERVAL = 10000; // 10 seconds

// Security Configuration
const MASTER_PASSCODE = "2025!"; // !!! MASTER PASSCODE !!!
const MIN_VOICE_CONFIDENCE = 0.90; // Minimum required confidence (0.0 to 1.0)

// --- VOICE COMMAND PHRASES (REQUIRED FOR ENROLLMENT/VERIFICATION) ---
const CRITICAL_COMMANDS = ['lock door', 'unlock door', 'disarm alarm'];
// 3 recordings total (3 commands * 1 rep)
const ENROLLMENT_REPETITIONS = 1;
const ENROLLMENT_KEY = 'voiceEnrollmentData'; // Stores the 3 enrolled phrases

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
            throw new Error(`Channel not found (404) for URL: ${url}`);
          }
          throw new Error(`HTTP error! status: ${response.status}`);
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
// --- SVG ICONS (Defined robustly for Tailwind usage) ---
// ----------------------------------------------------------------
const HomeIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
    <path d="M12 2a18 18 0 0 1 6 6c0 3.5-2 6-6 6s-6-2.5-6-6a18 18 0 0 1 6-6z" strokeDasharray="2 4"/>
  </svg>
);

const SettingsIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/>
    <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
    <path d="M15.4 17.6l-2.6-2.6"/>
    <path d="M10.2 10.2 7.6 7.6"/>
    <path d="M22 12h-4"/>
    <path d="M6 12H2"/>
    <path d="M12 6V2"/>
    <path d="M12 22v-4"/>
  </svg>
);

const CpuIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <rect width="20" height="12" x="2" y="6" rx="2"/>
    <path d="M6 18h.01"/>
    <path d="M10 18h.01"/>
  </svg>
);

const MotionIcon = ({ isActive = false, className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    {isActive ? (
      <>
        <path d="M10 20l4-16"/>
        <path d="M16 4l-4 16"/>
        <path d="M14 12l6 4"/>
        <path d="M4 16l6-4"/>
      </>
    ) : (
      <circle cx="12" cy="12" r="7"/>
    )}
  </svg>
);

const LockIcon = ({ isLocked = false, className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
    <path d={isLocked ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 9.9-1"}/>
  </svg>
);

const BellIcon = ({ isActive = false, className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    {isActive ? (
      <>
        <path d="M10 21v-7a3 3 0 0 1 6 0v7"/>
        <path d="M12 7h.01"/>
        <path d="M11 19c-1.8-1-3-3.3-3-6.1a5 5 0 0 1 10 0c0 2.8-1.2 5.1-3 6.1"/>
        <path d="M12 21v2"/>
      </>
    ) : (
      <>
        <path d="M12 10a4 4 0 0 0-4 4v2"/>
        <path d="M10 21v-7a3 3 0 0 1 6 0v7"/>
        <path d="M5.1 19C4 18 3 16.5 3 14c0-3.3 2.7-6 6-6 0-3 2-5 6-5 2.2 0 4 1.8 4 4"/>
        <path d="M12 21v2"/>
      </>
    )}
  </svg>
);

const AlertTriangle = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const CheckCircle = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <path d="M22 4L12 14.01l-3-3"/>
  </svg>
);

const InfoIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

const MicIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
       viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

// ----------------------------------------------------------------
// --- SUB-COMPONENTS ---
// ----------------------------------------------------------------

const StatusPill = ({ label, value, icon: Icon, isPulsing = false }) => {
  let colorClasses;
  let pulseClass = "";

  switch (value) {
    case 'CLEAR':
    case 'UNLOCKED':
      colorClasses = value === 'CLEAR'
        ? "bg-green-100 text-emerald-600"
        : "bg-amber-100 text-amber-600";
      break;
    case 'LOCKED':
    case 'MOTION DETECTED':
      colorClasses = "bg-red-100 text-red-600";
      if (value === 'MOTION DETECTED' && isPulsing) {
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
      <h4 className="text-sm text-gray-500 font-normal mb-2">{label}</h4>
      <span
        className={`status-indicator px-3 py-1 rounded-full font-semibold text-sm inline-block shadow-sm transition-all duration-300 ${colorClasses} ${pulseClass}`}
      >
        {value}
      </span>
    </div>
  );
};

const MessageBox = ({ message, title, onClose }) => {
  if (!message) return null;
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
        <h3 className="text-xl font-bold mb-3 text-gray-800">{title}</h3>
        <p className="text-gray-600 mb-4">{message}</p>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-300"
        >
          OK
        </button>
      </div>
    </div>
  );
};

const AlertCard = ({ alert, onMarkAsRead }) => {
  let bgColor, icon, titleColor, borderColor;

  if (alert.type === 'intruder') {
    bgColor = 'bg-red-50';
    icon = AlertTriangle;
    titleColor = 'text-red-700';
    borderColor = 'border-red-700';
  } else if (alert.type === 'valid') {
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
    <div className={`${bgColor} p-4 rounded-xl shadow-sm border ${borderColor} flex flex-col mb-3`}>
      <div className="flex justify-between items-start">
        <div className="flex items-center">
          <AlertIcon className={`w-6 h-6 mr-3 ${titleColor}`} />
          <h4 className={`text-lg font-bold ${titleColor}`}>{alert.title}</h4>
        </div>
        <button
          onClick={() => onMarkAsRead(alert.id)}
          className="text-gray-400 hover:text-gray-600 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
               viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <p className="text-gray-700 mt-2 ml-9 text-sm">{alert.message}</p>
      <div className="text-xs text-gray-500 mt-2 ml-9 flex justify-between items-center">
        <span>{alert.time}</span>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------
// --- MAIN APP COMPONENT ---
// ----------------------------------------------------------------

const App = () => {
  const fetchWithRetry = useFetchWithRetry();

  // --- VOICE ENROLLMENT STATE ---
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
    pir: 'Initializing...',
    door: 'Initializing...',
    alarm: 'Initializing...',
    rfid: 'N/A',
    lastUpdated: '--'
  });
  const [alerts, setAlerts] = useState([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [commandMessage, setCommandMessage] = useState('');
  const [messageBox, setMessageBox] = useState({ message: '', title: '', onClose: null });
  const [isSendingCommand, setIsSendingCommand] = useState(false);

  // // Image State
  // const [imageTimestamp, setImageTimestamp] = useState('--');
  // const [imageLoading, setImageLoading] = useState(false);
  // const [imageSrc, setImageSrc] = useState("https://placehold.co/800x450/b0b0b0/ffffff?text=Waiting+for+Image");

  const prevRfidRef = useRef(null);
  const prevPirRef = useRef(null);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);

  // --- UTILITY FUNCTIONS ---
  const closeMessageBox = () => setMessageBox({ title: '', message: '', onClose: null });

  const showMessageBox = useCallback((title, message, callback) => {
    if (callback) {
      setMessageBox({
        title,
        message,
        onClose: () => {
          closeMessageBox();
          callback();
        }
      });
    } else {
      setMessageBox({
        title,
        message,
        onClose: () => closeMessageBox()
      });
    }
  }, []);

  const clearAlerts = () => setAlerts([]);

  const handleMarkAsRead = (id) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  // --- THINGSPEAK API FUNCTIONS ---
  const updateStatus = useCallback(async () => {
    const { dataChannelId, readApiKey } = config;
    if (!dataChannelId || !readApiKey) return;

    const url = `${THINGSPEAK_URL}${dataChannelId}/feeds.json?api_key=${readApiKey}&results=1`;

    try {
      const data = await fetchWithRetry(url);

      if (!data || !data.feeds || data.feeds.length === 0) {
        setStatus(prev => ({ ...prev, pir: 'No data feed received.', lastUpdated: 'No Data' }));
        return;
      }

      const feed = data.feeds[0];
      const pirVal = parseInt(feed.field1);
      const doorVal = parseInt(feed.field2);
      const alarmVal = parseInt(feed.field3);
      const rfidVal = feed.field4;

      generateAlerts(feed);

      setStatus({
        pir: pirVal === 1 ? 'MOTION DETECTED' : 'CLEAR',
        door: doorVal === 1 ? 'LOCKED' : 'UNLOCKED',
        alarm: alarmVal === 1 ? 'ALARM ACTIVE' : 'DISARMED',
        rfid: rfidVal || 'No recent ID',
        lastUpdated:
          new Date(feed.created_at).toLocaleTimeString() +
          ', ' +
          new Date(feed.created_at).toLocaleDateString(),
      });

    } catch (error) {
      console.error("Error updating status:", error);
      setStatus(prev => ({ ...prev, pir: 'ERROR', lastUpdated: 'Connection Error' }));
    }
  }, [config, fetchWithRetry]);

  // const updateCameraFeed = useCallback(async () => {
  //   const { dataChannelId } = config;
  //   if (!dataChannelId) return;

  //   const imageUrl = `https://thingspeak.com/channels/${dataChannelId}/widgets/latest_image.png`;
  //   setImageLoading(true);
  //   const newImageSrc = `${imageUrl}?timestamp=${Date.now()}`;

  //   const tempImage = new Image();
  //   tempImage.onload = () => {
  //     setImageSrc(newImageSrc);
  //     setImageTimestamp(`Last Image Time: ${new Date().toLocaleTimeString()} (Refreshed)`);
  //     setImageLoading(false);
  //   };
  //   tempImage.onerror = () => {
  //     setImageLoading(false);
  //     setImageSrc("https://placehold.co/800x450/b0b0b0/ffffff?text=Image+Load+Failed");
  //     setImageTimestamp(`Last Image Time: N/A - Check Widget Setup`);
  //   };
  //   tempImage.src = newImageSrc;
  // }, [config]);

  const sendCommand = useCallback(async (command) => {
    const { talkBackId, readApiKey } = config;
    if (!talkBackId) {
      showMessageBox("Configuration Required", "Please enter the TalkBack ID to send commands.");
      return;
    }

    const TALKBACK_API_KEY = readApiKey;
    const url = `${THINGSPEAK_TALKBACK_URL}${talkBackId}/commands?api_key=${TALKBACK_API_KEY}&command_string=${command}`;

    setIsSendingCommand(true);
    setCommandMessage(`Sending command: ${command.replace('_', ' ')}...`);

    try {
      const response = await fetchWithRetry(url);

      if (response.command_id) {
        setCommandMessage(`Command queued successfully.`);
        setAlerts(prev => [{
          id: Date.now() + Math.random(),
          type: 'info',
          title: `REMOTE CONTROL: ${command.replace('_', ' ')}`,
          message: `Command sent successfully to ESP32 TalkBack queue.`,
          time: new Date().toLocaleTimeString(),
        }, ...prev]);
      } else {
        throw new Error("TalkBack queuing failed. Check API Key/Permissions.");
      }

    } catch (error) {
      console.error("Error sending command:", error);
      setCommandMessage(`Error sending command: ${error.message}`);
    } finally {
      setTimeout(() => {
        setIsSendingCommand(false);
        updateStatus();
      }, 2000);
    }
  }, [config, fetchWithRetry, updateStatus, showMessageBox]);

  const generateAlerts = useCallback((latestFeed) => {
    const newAlerts = [];
    const currentTime = new Date();
    const pirVal = parseInt(latestFeed.field1);
    const alarmVal = parseInt(latestFeed.field3);
    const rfid = latestFeed.field4;

    if (pirVal === 1 && alarmVal === 1 && prevPirRef.current === 0) {
      newAlerts.push({
        id: Date.now() + Math.random(),
        type: 'intruder',
        title: 'INTRUDER DETECTED',
        message: `Motion detected while the system was armed. Alarm is active.`,
        time: currentTime.toLocaleTimeString(),
      });
    }

    if (rfid && rfid !== prevRfidRef.current) {
      newAlerts.push({
        id: Date.now() + Math.random(),
        type: 'valid',
        title: 'RFID ACCESS',
        message: `Access granted by RFID tag: ${rfid}. System status updated.`,
        time: currentTime.toLocaleTimeString(),
      });
    }

    prevPirRef.current = pirVal;
    prevRfidRef.current = rfid;

    setAlerts(prev => [...newAlerts, ...prev]);
  }, []);

  // ----------------------------------------------------------------
  // --- SIMPLIFIED VOICE CONTROL LOGIC ---
  // ----------------------------------------------------------------

  const handleVoiceCommand = useCallback((transcript, confidence) => {
    const lowerTranscript = transcript.toLowerCase().trim();
    setCommandMessage(`Voice command: "${transcript}" (Conf: ${confidence.toFixed(2)})`);

    // 1. Strict confidence check
    if (confidence < MIN_VOICE_CONFIDENCE) {
      showMessageBox(
        'Voice Rejected',
        `Confidence (${confidence.toFixed(2)}) is below ${MIN_VOICE_CONFIDENCE.toFixed(2)}. Access denied.`
      );
      return;
    }

    // 2. Require that phrase matches any enrolled phrase (text check)
    if (
      enrolledPhrases.length === 0 ||
      !enrolledPhrases.some(p => lowerTranscript.includes(p))
    ) {
      showMessageBox(
        'Voice Rejected',
        'Spoken phrase does not match your enrolled phrases. Access denied.'
      );
      return;
    }

    // 3. Execute only allowed critical commands
    if (lowerTranscript.includes('lock') && lowerTranscript.includes('door')) {
      sendCommand('LOCK_DOOR');
    } else if (lowerTranscript.includes('unlock') && lowerTranscript.includes('door')) {
      sendCommand('UNLOCK_DOOR');
    } else if (lowerTranscript.includes('disarm') && lowerTranscript.includes('alarm')) {
      sendCommand('DISARM_ALARM');
    } else {
      showMessageBox(
        'Command Not Recognized',
        `I did not understand that command: "${transcript}".`
      );
    }
  }, [sendCommand, showMessageBox, enrolledPhrases]);

  const toggleVoiceControl = useCallback(() => {
    if (!SpeechRecognition) {
      showMessageBox("Browser Error", "Speech Recognition is not supported in this browser.");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    if (enrolledPhrases.length < CRITICAL_COMMANDS.length * ENROLLMENT_REPETITIONS) {
      showMessageBox(
        "Enrollment Required",
        `You must enroll all ${CRITICAL_COMMANDS.length} commands before using voice control.`
      );
      return;
    }

    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
      setCommandMessage("Listening for command...");
    };

    rec.onresult = (event) => {
      const result = event.results[0][0];
      handleVoiceCommand(result.transcript, result.confidence);
    };

    rec.onerror = (event) => {
      setIsListening(false);
      setCommandMessage(`Error: ${event.error}`);
      showMessageBox("Voice Error", `Speech recognition error: ${event.error}`);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    try {
      rec.start();
    } catch (error) {
      console.error("Speech recognition start error:", error);
      setIsListening(false);
      showMessageBox("Voice Error", "Could not start speech recognition.");
    }

  }, [isListening, enrolledPhrases, handleVoiceCommand, showMessageBox]);

  const enrollVoice = () => {
    if (!SpeechRecognition) {
      showMessageBox("Browser Error", "Speech Recognition is not supported in this browser.");
      return;
    }

    const totalRecordings = CRITICAL_COMMANDS.length * ENROLLMENT_REPETITIONS; // 3
    const recordings = [];
    let commandIndex = 0;

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;

    const startStep = () => {
      if (commandIndex >= CRITICAL_COMMANDS.length) {
        setEnrolledPhrases(recordings);
        localStorage.setItem(ENROLLMENT_KEY, JSON.stringify(recordings));
        showMessageBox(
          "Enrollment Complete",
          `Saved ${recordings.length} phrases. Voice verification is now enabled.`
        );
        return;
      }

      const cmd = CRITICAL_COMMANDS[commandIndex];
      showMessageBox(
        "Voice Enrollment",
        `Recording ${recordings.length + 1} of ${totalRecordings}. Say: "${cmd.toUpperCase()}".`,
        () => {
          try {
            rec.start();
          } catch (error) {
            showMessageBox("Voice Error", "Could not start recording. Try again.");
          }
        }
      );
    };

    rec.onresult = (event) => {
      const result = event.results[0][0];
      const transcript = result.transcript.toLowerCase().trim();
      const confidence = result.confidence;
      const expected = CRITICAL_COMMANDS[commandIndex];

       if (!transcript.includes(expected)) {
    showMessageBox(
      "Enrollment Failed",
      `Expected "${expected.toUpperCase()}", heard "${transcript}". Try again.`,
      startStep
    );
    return;
  }

      if (!transcript.includes(expected)) {
        showMessageBox(
          "Enrollment Failed",
          `Expected "${expected.toUpperCase()}", heard "${transcript}". Try again.`,
          startStep
        );
        return;
      }

      recordings.push(expected);
      commandIndex += 1;
      startStep();
    };

    rec.onerror = (event) => {
      showMessageBox("Enrollment Error", `Recording error: ${event.error}`, startStep);
    };

    startStep();
  };

  const verifyVoice = () => {
    if (!SpeechRecognition) {
      showMessageBox("Verification Failed", "Speech Recognition is not supported in this browser.");
      return;
    }
    if (enrolledPhrases.length === 0) {
      showMessageBox("Verification Failed", "No phrases enrolled. Use 'Enroll Voice' first.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      showMessageBox("Voice Verification", "Say one of your enrolled security phrases.");
    };

    rec.onresult = (event) => {
      const result = event.results[0][0];
      const transcript = result.transcript.toLowerCase().trim();
      const confidence = result.confidence;

      if (confidence < MIN_VOICE_CONFIDENCE) {
        showMessageBox(
          "Verification Failed",
          `Confidence (${confidence.toFixed(2)}) is below ${MIN_VOICE_CONFIDENCE.toFixed(2)}.`
        );
        return;
      }

      const isMatch = enrolledPhrases.some(p => transcript.includes(p));
      if (isMatch) {
        showMessageBox("Verification Successful", "Your voice phrase matches the enrolled data.");
      } else {
        showMessageBox("Verification Failed", "Phrase does not match any enrolled phrase.");
      }
    };

    rec.onerror = (event) => {
      showMessageBox("Verification Error", `Error: ${event.error}`);
    };

    try {
      rec.start();
    } catch (error) {
      showMessageBox("Voice Error", "Could not start recording for verification.");
    }
  };

  // --- MAIN APPLICATION FLOW ---

  const startPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    updateStatus();
  

    timerRef.current = setInterval(() => {
      updateStatus();
    }, POLLING_INTERVAL);
  }, [updateStatus]);

  const saveConfigAndStartMonitoring = () => {
    const dataId = document.getElementById('dataChannelId').value.trim();
    const readKey = document.getElementById('readApiKey').value.trim();
    const talkbackId = document.getElementById('talkBackId').value.trim();

    if (!dataId || !readKey || !talkbackId) {
      showMessageBox('Configuration Error', 'All three configuration fields (Channel ID, Read API Key, TalkBack ID) are required to start monitoring.');
      return;
    }

    setConfig({ dataChannelId: dataId, readApiKey: readKey, talkBackId: talkbackId });
    setIsConfigured(true);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      startPolling();
    }
  }, [isAuthenticated, startPolling]);

  const pirIsActive = status.pir === 'MOTION DETECTED';
  const doorIsLocked = status.door === 'LOCKED';
  const alarmIsActive = status.alarm === 'ALARM ACTIVE';
  const speechApiAvailable = !!SpeechRecognition;

  const renderConfig = () => (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-10 mx-auto max-w-4xl">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
        <SettingsIcon className="w-5 h-5 mr-2 text-indigo-500" />
        Cloud Connection Setup
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Input credentials to link your dashboard to the ThingSpeak Data and TalkBack services.
        The TalkBack commands will use the Read API Key.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input
          type="text"
          id="dataChannelId"
          placeholder="Data Channel ID"
          className="p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
        />
        <input
          type="text"
          id="readApiKey"
          placeholder="Read API Key"
          className="p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
        />
        <input
          type="text"
          id="talkBackId"
          placeholder="TalkBack ID (For Control)"
          className="p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      <button
        onClick={saveConfigAndStartMonitoring}
        className="action-button mt-6 w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-700 transition duration-300"
      >
        Save & Proceed to Login
      </button>

      <div className="mt-8 p-4 bg-gray-100 rounded-lg border border-gray-300">
        <h3 className="text-base font-semibold text-gray-800 mb-2">Voice Debug Console</h3>
        <p className="text-sm flex items-center">
          <span
            className={`w-3 h-3 rounded-full mr-2 ${
              speechApiAvailable ? 'bg-green-500' : 'bg-red-500'
            }`}
          ></span>
          Speech API Status: <span className="font-bold ml-1">
            {speechApiAvailable ? 'Available' : 'Unavailable'}
          </span>
        </p>
        <p className="text-xs text-gray-600 mt-2">
          *The minimum confidence threshold for commands is:
          <span className="font-mono text-indigo-800 font-bold"> {MIN_VOICE_CONFIDENCE}</span>.
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
      } else {
        setError('Invalid passcode. Please try again.');
        setPasscode('');
      }
    };

    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-center">
            <LockIcon isLocked={true} className="w-6 h-6 mr-2 text-red-500" />
            System Locked
          </h2>
          <p className="text-gray-600 mb-6">
            Enter your master security passcode to access the dashboard.
          </p>
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
            <button
              type="submit"
              className="action-button mt-6 w-full px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-700 transition duration-300"
            >
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

      {/* Column 1: Status, Control, Alerts */}
      <div className="lg:col-span-2 space-y-8">

        {/* SECTION: STATUS OVERVIEW */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">System Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StatusPill
              id="pirStatus"
              label="Motion Sensor"
              value={status.pir}
              icon={MotionIcon}
              isActive={pirIsActive}
            />
            <StatusPill
              id="doorState"
              label="Door Lock State"
              value={status.door}
              icon={LockIcon}
              isActive={doorIsLocked}
            />
            <StatusPill
              id="alarmStatus"
              label="System Alarm"
              value={status.alarm}
              icon={BellIcon}
              isActive={alarmIsActive}
            />
          </div>
        </div>

        {/* SECTION: REMOTE CONTROL */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-5 flex items-center">
            <CpuIcon className="w-5 h-5 mr-2 text-indigo-500" />
            Remote Door & Siren Control
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => sendCommand('LOCK_DOOR')}
              disabled={isSendingCommand}
              className="action-button px-6 py-3 bg-red-500 text-white font-semibold rounded-xl shadow-lg hover:bg-red-600 transition duration-300 disabled:opacity-50 flex items-center justify-center"
            >
              <LockIcon isLocked={true} className="w-5 h-5 mr-2" />
              LOCK DOOR
            </button>
            <button
              onClick={() => sendCommand('UNLOCK_DOOR')}
              disabled={isSendingCommand}
              className="action-button px-6 py-3 bg-yellow-500 text-white font-semibold rounded-xl shadow-lg hover:bg-yellow-600 transition duration-300 disabled:opacity-50 flex items-center justify-center"
            >
              <LockIcon isLocked={false} className="w-5 h-5 mr-2" />
              UNLOCK DOOR
            </button>
            <button
              onClick={() => sendCommand('DISARM_ALARM')}
              disabled={isSendingCommand}
              className="action-button px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl shadow-lg hover:bg-indigo-600 transition duration-300 disabled:opacity-50 flex items-center justify-center"
            >
              <BellIcon isActive={false} className="w-5 h-5 mr-2" />
              DISARM ALARM
            </button>
          </div>

          {commandMessage && (
            <p className="mt-4 text-sm text-gray-600">
              Status: {commandMessage}
            </p>
          )}
        </div>

        {/* SECTION: ALERTS */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800 flex items-center">
              <BellIcon className="w-5 h-5 mr-2 text-red-500" />
              Security Alerts
            </h3>
            <button
              onClick={clearAlerts}
              className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100"
            >
              Clear All
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500">No alerts yet.</p>
          ) : (
            alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onMarkAsRead={handleMarkAsRead} />
            ))
          )}
        </div>
      </div>

      {/* Column 2: Camera + Voice */}
      <div className="space-y-8">
      
      // --- NEW CODE TO INSERT --- //
    {/* SECTION: CAMERA FEED */}
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
        <HomeIcon className="w-5 h-5 mr-2 text-indigo-500" />
        Live Camera Snapshot
      </h3>
  
      {/* The CameraDisplay component handles fetching, loading, and refreshing */}
      <CameraDisplay />
  
    </div>
// --- END OF NEW CODE --- //


        {/* SECTION: VOICE CONTROL */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <MicIcon className="w-5 h-5 mr-2 text-indigo-500" />
            Voice Security Control
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Enroll your voice with 3 security phrases, then verify and control the door and alarm
            with high-confidence, phrase-matched commands.
          </p>
          <div className="flex flex-col space-y-3 mb-4">
            <button
              onClick={enrollVoice}
              className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition"
            >
              Enroll Voice (3 Phrases)
            </button>
            <button
              onClick={verifyVoice}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition"
            >
              Verify Voice
            </button>
            <button
              onClick={toggleVoiceControl}
              className={`px-4 py-2 rounded-lg text-sm text-white transition ${
                isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-500 hover:bg-purple-600'
              }`}
            >
              {isListening ? 'Stop Listening' : 'Use Voice Command'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Minimum confidence for verification/commands:
            <span className="font-mono text-indigo-800 font-bold"> {MIN_VOICE_CONFIDENCE}</span>.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Enrolled phrases:
            {enrolledPhrases.length > 0
              ? ` ${enrolledPhrases.join(', ')}`
              : ' None (please enroll).'}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <HomeIcon className="w-7 h-7 text-indigo-600 mr-2" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                Smart Home Security Dashboard
              </h1>
              <p className="text-xs text-gray-500">
                ESP32 + ThingSpeak + Secure Voice & RFID Access
              </p>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            <span className="inline-block px-2 py-1 rounded-full bg-gray-100 border border-gray-200">
              Status: {isAuthenticated ? 'Unlocked' : 'Locked'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {!isConfigured ? (
          renderConfig()
        ) : !isAuthenticated ? (
          <PasscodeScreen />
        ) : isLoading ? (
          <div className="flex justify-center items-center min-h-[40vh]">
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        ) : (
          renderDashboard()
        )}
      </main>

      {messageBox.message && (
        <MessageBox
          title={messageBox.title}
          message={messageBox.message}
          onClose={messageBox.onClose}
        />
      )}
    </div>
  );
};

export default App;
