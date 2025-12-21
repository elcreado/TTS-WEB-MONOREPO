import { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<string>('Disconnected');
  const [lastMessage, setLastMessage] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);

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
        setChatMessages(prev => [...prev, data.data]);
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
