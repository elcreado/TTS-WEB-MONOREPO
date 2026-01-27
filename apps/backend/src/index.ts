import { WebSocketServer, WebSocket } from "ws";
import express from "express";

import { SignConfig } from "tiktok-live-connector";

import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const EULER_API_KEY = process.env.EULER_API_KEY;

app.get("/keep-alive", (req, res) => {
    res.status(200).send('Server is alive');
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    console.log("Client connected");

    let eulerConnection: WebSocket | undefined;

    ws.on("message", (message) => {
        const data = JSON.parse(message.toString());
        console.log("Received:", data);

        if (data.type === 'CONNECT_TIKTOK') {
            const username = data.username;
            console.log(`Connecting to TikTok user via Eulerstream: ${username}`);

            if (eulerConnection) {
                console.log('Disconnecting previous session...');
                eulerConnection.close();
                eulerConnection = undefined;
            }

            const eulerUrl = `wss://ws.eulerstream.com?uniqueId=${username}&apiKey=${EULER_API_KEY}`;
            console.log(`Connecting to: ${eulerUrl}`);

            eulerConnection = new WebSocket(eulerUrl);

            eulerConnection.on('open', () => {
                console.log('Eulerstream WebSocket Connected');
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'CONNECTED' }));
            });

            eulerConnection.on('message', (data) => {

                try {
                    const messageStr = data.toString();
                    const eventData = JSON.parse(messageStr);

                    eventData.messages.forEach((msg: any) => {
                        if (msg.type === 'WebcastChatMessage') {
                            const usuario = msg.data.user.uniqueId;
                            const comentario = msg.data.comment;

                            console.log(`${usuario}: ${comentario}`);
                            ws.send(JSON.stringify({
                                type: 'TIKTOK_CHAT',
                                data: {
                                    uniqueId: usuario,
                                    comment: comentario
                                }
                            }));
                        }
                    })

                } catch (err) {
                    console.error('Error parsing Euler message:', err);
                }
            });

            eulerConnection.on('close', (code, reason) => {
                console.log(`Eulerstream disconnected. Code: ${code}, Reason: ${reason}`);
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'DISCONNECTED' }));
            });

            eulerConnection.on('error', (err) => {
                console.error('Eulerstream Connection Error:', err);
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'ERROR', error: err.message }));
            });

        } else if (data.type === 'DISCONNECT_TIKTOK') {
            if (eulerConnection) {
                console.log('Disconnecting from Eulerstream...');
                eulerConnection.close();
                eulerConnection = undefined;
                ws.send(JSON.stringify({ type: 'TIKTOK_STATUS', status: 'DISCONNECTED' }));
            }
        }
    });

    ws.on('close', () => {
        if (eulerConnection) {
            eulerConnection.close();
        }
    });

    ws.send(JSON.stringify({ type: "STATUS", state: "CONNECTED" }));
});

console.log(`Server started on port ${PORT}`);
