import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: Number(PORT) });

const { WebcastPushConnection } = require('tiktok-live-connector');

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
                console.log('Disconnecting previous session...');
                tiktokConnection.disconnect();
                tiktokConnection = undefined;
            }

            // Create a wrapper to ensuring we only handle events for the current session
            const currentConnection = new WebcastPushConnection(username);
            tiktokConnection = currentConnection;
            let isConnected = false;

            currentConnection.on('connected', (state: any) => {
                console.log('TikTok Connected event received');
                isConnected = true;
                if (tiktokConnection === currentConnection) {
                    ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'CONNECTED' }));
                }
            });

            currentConnection.connect().then((state: any) => {
                console.log(`Connected to users roomId ${state.roomId}`);
                // Status is handled by 'connected' event usually, but just in case
                if (tiktokConnection === currentConnection && !isConnected) {
                    isConnected = true;
                    ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'CONNECTED' }));
                }
            }).catch((err: any) => {
                console.error('Failed to connect', err);
                if (tiktokConnection === currentConnection) {
                    if (isConnected) {
                        console.warn('Connection promise failed but socket seems open. Ignoring error.');
                    } else {
                        ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'ERROR', error: err.message }));
                        tiktokConnection = undefined;
                    }
                }
            });

            currentConnection.on('chat', (data: any) => {
                if (tiktokConnection === currentConnection) {
                    ws.send(JSON.stringify({ type: 'TIKTOK_CHAT', data: { uniqueId: data.uniqueId, comment: data.comment } }));
                }
            });

            currentConnection.on('disconnected', () => {
                console.log('TikTok disconnected');
                if (tiktokConnection === currentConnection) {
                    ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'DISCONNECTED' }));
                }
            });
        } else if (data.type === 'DISCONNECT_TIKTOK') {
            if (tiktokConnection) {
                console.log('Disconnecting from TikTok...');
                tiktokConnection.disconnect();
                tiktokConnection = undefined;
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'DISCONNECTED' }));
            }
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