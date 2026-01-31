import { useEffect, useState, useRef } from 'react';
import './App.css';
import ConfigSection from './components/ConfigSection';
import defaultConfig from '../data/config.json'; // Initial fallback

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<string>('Disconnected');
  const [lastMessage] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [tiktokStatus, setTiktokStatus] = useState<string>('DISCONNECTED');

  // App Config State (synced with backend)
  const [appConfig, setAppConfig] = useState<any>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // TTS Queue Logic
  const ttsQueue = useRef<string[]>([]);
  const isSpeaking = useRef(false);

  const processQueue = () => {
    if (isSpeaking.current || ttsQueue.current.length === 0) return;

    isSpeaking.current = true;
    const text = ttsQueue.current.shift(); // Get the next message

    if (text) {
      const utterance = new SpeechSynthesisUtterance(text);
      // Try to detect Spanish, otherwise default
      utterance.lang = 'es-ES';

      utterance.onend = () => {
        isSpeaking.current = false;
        // Small cooldown to prevent overlap feeling
        setTimeout(() => processQueue(), 200);
      };

      utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        isSpeaking.current = false;
        processQueue();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      isSpeaking.current = false;
    }
  };

  const speak = (text: string) => {
    // Logic: Max queue size 2.
    // If full (>=2), remove the oldest pending message (index 0) to make room for new one.
    if (ttsQueue.current.length >= 2) {
      ttsQueue.current.shift();
    }
    ttsQueue.current.push(text);
    processQueue();
  };

  useEffect(() => {
    // Initial config load from file (as baseline)
    setAppConfig(defaultConfig);
    setUsername(defaultConfig.tiktok.username);

    const SOCKET_URL = import.meta.env.PROD
      ? 'wss://tts-web-monorepo-1.onrender.com'
      : "ws://localhost:8080";

    const socket = new WebSocket(SOCKET_URL);

    socket.onopen = () => {
      console.log('Connected to WebSocket');
      setStatus('Connected');
      // On connect, we send our default/local config to backend
      socket.send(JSON.stringify({
        type: 'UPDATE_CONFIG',
        config: defaultConfig
      }));
    };

    //Managing TIKTOK EVENTS

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'TIKTOK_CHAT') {
        const comment = data.data.comment;
        const uniqueId = data.data.uniqueId;
        const fullMessage = `${uniqueId} dice: ${comment}`;

        setTiktokStatus('CONNECTED');
        setChatMessages(prev => [...prev, data.data]);
        speak(fullMessage); // Trigger TTS

      } else if (data.type === 'JOIN_MESSAGE') {
        const fullMessage = `${data.data.comment}`;

        setTiktokStatus('CONNECTED');
        setChatMessages(prev => [...prev, data.data]);
        speak(fullMessage); // Trigger TTS

      } else if (data.type === 'TIKTOK_FOLLOW') {
        const fullMessage = `${data.data.comment}`;

        setTiktokStatus('CONNECTED');
        setChatMessages(prev => [...prev, data.data]);
        speak(fullMessage); // Trigger TTS
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from WebSocket');
      setStatus('Disconnected');
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatusText, setConnectionStatusText] = useState('Connect TikTok');
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear timeout on unmount
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const handleConfigSave = (newConfig: any) => {
    // Preserve the current username from the input field, 
    // because ConfigSection might have a stale version of it.
    const configToSave = {
      ...newConfig,
      tiktok: {
        ...newConfig.tiktok,
        username: username // Use the current state 'username'
      }
    };

    setAppConfig(configToSave);
    // username state is already correct (controlled input), so we don't need to setUsername here.
    // In fact, setting it from the passed config caused the issue if the passed config was stale.

    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log("Sending updated config to backend...");
      ws.send(JSON.stringify({
        type: 'UPDATE_CONFIG',
        config: configToSave
      }));
    }
  };

  const connectToTikTok = (isRetry = false) => {
    if (ws && ws.readyState === WebSocket.OPEN && username) {
      setIsConnecting(true);
      if (!isRetry) {
        setConnectionStatusText('Connecting Tiktok...');
      }
      // Ensure we send the latest username/config when connecting
      const configToUse = { ...appConfig, tiktok: { username } };
      ws.send(JSON.stringify({ type: 'UPDATE_CONFIG', config: configToUse }));
      ws.send(JSON.stringify({ type: 'CONNECT_TIKTOK', username }));

      // Set a timeout to retry if no signal received
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

      retryTimeoutRef.current = setTimeout(() => {
        if (tiktokStatus !== 'CONNECTED') {
          console.log("No signal from Render server. Retrying...");
          setConnectionStatusText('No signal. Retrying...');
          setTimeout(() => connectToTikTok(true), 3000);
        }
      }, 10000); // 10 seconds timeout
    }
  };

  const disconnectFromTikTok = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Clear any pending retry
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      setIsConnecting(false);
      setConnectionStatusText('Connect TikTok');

      ws.send(JSON.stringify({ type: 'DISCONNECT_TIKTOK' }));

      // Update local status immediately to reflect user action
      setTiktokStatus('DISCONNECTED');

      // Stop TTS
      window.speechSynthesis.cancel();
      ttsQueue.current = [];
      isSpeaking.current = false;
    }
  };

  // Listen for status changes to clear connecting state
  useEffect(() => {
    if (tiktokStatus === 'CONNECTED') {
      setIsConnecting(false);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    } else if (tiktokStatus === 'DISCONNECTED') {
      // Handled
    }
  }, [tiktokStatus]);

  const isTiktokConnected = tiktokStatus === 'CONNECTED';
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1 style={{ margin: 0 }}>Tiktok TTS</h1>
            <button className="btn-toggle-config" onClick={() => setIsConfigOpen(!isConfigOpen)}>
              ⚙️ Config
            </button>
          </div>

          {/* Status Bar */}
          <div className="status-bar">
            <div className="status-item">
              <div className={`status-dot ${status === 'Connected' ? 'connected' : 'disconnected'}`}></div>
              <span>Server: {status}</span>
            </div>
            <div className="status-item">
              <div className={`status-dot ${isTiktokConnected ? 'connected' : 'disconnected'}`}></div>
              <span>TikTok: {tiktokStatus}</span>
            </div>
          </div>

          <div className="last-message">
            Last Event: {lastMessage}
          </div>

          {/* Controls */}
          <div className="control-panel">
            <input
              type="text"
              placeholder="TikTok Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isTiktokConnected || isConnecting}
            />
            {!isTiktokConnected ? (
              <button
                className={isConnecting ? "btn-connecting" : "btn-primary"}
                onClick={() => connectToTikTok(false)}
                disabled={isConnecting}
              >
                {connectionStatusText}
              </button>
            ) : (
              <button className="btn-danger" onClick={disconnectFromTikTok}>
                Disconnect
              </button>
            )}
          </div>


          {/* Chat Log */}
          <div className="chat-container">
            {chatMessages.length === 0 && (
              <p style={{ color: '#666', textAlign: 'center', marginTop: '20px' }}>
                Waiting for chat messages...
              </p>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="chat-bubble">
                <span className="chat-user">{msg.uniqueId}</span>
                <span className="chat-text">{msg.comment}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>

      {/* Side Configuration Panel */}
      <div className={`config-panel ${isConfigOpen ? '' : 'closed'}`}>
        <ConfigSection
          onSave={handleConfigSave}
          currentConfig={appConfig}
          onClose={() => setIsConfigOpen(false)}
        />
      </div>
    </div>
  );
}

export default App;
