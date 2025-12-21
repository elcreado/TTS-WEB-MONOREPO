import { useEffect, useState, useRef } from 'react';
import './App.css';

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<string>('Disconnected');
  const [lastMessage, setLastMessage] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);

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

        setChatMessages(prev => [...prev, data.data]);
        speak(fullMessage); // Trigger TTS
      } else if (data.type === 'TIKTOK_STATUS') {
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

  const connectToTikTok = () => {
    if (ws && ws.readyState === WebSocket.OPEN && username) {
      ws.send(JSON.stringify({ type: 'CONNECT_TIKTOK', username }));
    }
  };

  const sendMessage = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type: 'TEST', content: 'Hello from Frontend!' });
      ws.send(message);
      console.log('Sent:', message);
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  return (
    <>
      <h1>Tiktok TTS</h1>
      <div className="card">
        <p>Status: {status}</p>
        <p>Last Message: {lastMessage}</p>

        <div style={{ margin: '20px 0', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
          <input
            type="text"
            placeholder="TikTok Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={connectToTikTok}>Connect TikTok</button>
        </div>

        <button onClick={sendMessage}>
          Send Test Message
        </button>

        <div style={{ textAlign: 'left', marginTop: '20px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #333', padding: '10px' }}>
          <h3>Chat:</h3>
          {chatMessages.map((msg, idx) => (
            <div key={idx}><strong>{msg.uniqueId}:</strong> {msg.comment}</div>
          ))}
        </div>
      </div>
    </>
  );
}

export default App
