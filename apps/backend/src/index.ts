import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: Number(PORT) });

const { WebcastPushConnection } = require('tiktok-live-connector');

// ... imports

wss.on("connection", (ws) => {
    console.log("Client connected");

    let tiktokConnection: any;

    ws.on("message", (message) => {
        const data = JSON.parse(message.toString());
        console.log("Received:", data);

        if (data.type === 'CONNECT_TIKTOK') {
            const username = data.username;
            console.log(`Connecting to TikTok user: ${username}`);

            if (tiktokConnection) {
                tiktokConnection.disconnect();
            }

            tiktokConnection = new WebcastPushConnection(username);

            tiktokConnection.connect().then((state: any) => {
                console.log(`Connected to roomId ${state.roomId}`);
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'CONNECTED' }));
            }).catch((err: any) => {
                console.error('Failed to connect', err);
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'ERROR', error: err.message }));
            });

            tiktokConnection.on('chat', (data: any) => {
                ws.send(JSON.stringify({ type: 'TIKTOK_CHAT', data: { uniqueId: data.uniqueId, comment: data.comment } }));
            });

            tiktokConnection.on('disconnected', () => {
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'DISCONNECTED' }));
            });
        }
    });

    ws.on('close', () => {
        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }
    });

    ws.send(JSON.stringify({ type: "STATUS", state: "CONNECTED" }));
});

console.log(`Server started on port ${PORT}`);