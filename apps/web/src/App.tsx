import { useEffect, useState, useRef } from 'react';
import './App.css';

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<string>('Disconnected');
  const [lastMessage, setLastMessage] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [tiktokStatus, setTiktokStatus] = useState<string>('DISCONNECTED');

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
    const SOCKET_URL = import.meta.env.PROD
      ? 'wss://tts-web-monorepo-1.onrender.com'
      : "ws://localhost:8080";

    const socket = new WebSocket(SOCKET_URL);

    socket.onopen = () => {
      console.log('Connected to WebSocket');
      setStatus('Connected');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Message from server:', data);

      if (data.type === 'TIKTOK_CHAT') {
        const comment = data.data.comment;
        const uniqueId = data.data.uniqueId;
        const fullMessage = `${uniqueId} dice: ${comment}`;

        // If we receive chats, we are definitely connected
        setTiktokStatus('CONNECTED');
        setChatMessages(prev => [...prev, data.data]);
        speak(fullMessage); // Trigger TTS
      } else if (data.type === 'TIKTOK_STATUS') {
        setTiktokStatus(data.status);
        setLastMessage(`TikTok Status: ${data.status}`);
      } else {
        setLastMessage(JSON.stringify(data));
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

  const connectToTikTok = (isRetry = false) => {
    if (ws && ws.readyState === WebSocket.OPEN && username) {
      setIsConnecting(true);
      if (!isRetry) {
        setConnectionStatusText('Connecting Tiktok...');
      }
      ws.send(JSON.stringify({ type: 'CONNECT_TIKTOK', username }));

      // Set a timeout to retry if no signal received
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

      retryTimeoutRef.current = setTimeout(() => {
        if (tiktokStatus !== 'CONNECTED') {
          console.log("No signal from Render server. Retrying...");
          setConnectionStatusText('No signal. Retrying...');
          // Trigger retry with a longer delay so user can see the message
          // We pass true to indicate it's a retry so we might handle text differently if needed
          // But here we rely on the generic "Connecting..." or keep "Retrying..."
          // If we want "Retrying..." to stick until next timeout, we can set isRetry logic.
          // Let's just restart the process after 3s.
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
      // If we were connecting and got disconnected (error), we might want to handle it
      // But for now, we rely on the timeout to retry unless user manually disconnected
    }
  }, [tiktokStatus]);

  const isTiktokConnected = tiktokStatus === 'CONNECTED';
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  return (
    <>
      <div className="card">
        <h1>Tiktok TTS</h1>

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
    </>
  );
}

export default App
