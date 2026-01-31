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
    // Default config (will be updated by frontend)
    let clientConfig: any = {
        readChat: { enabled: false },
        readEvents: { enabled: false },
        readGifts: { enabled: false },
        readLikes: { enabled: false },
        readFollows: { enabled: false },
        readShares: { enabled: false },
        readJoins: { enabled: false }
    };

    ws.on("message", (message) => {
        const data = JSON.parse(message.toString());
        console.log("Received:", data);

        if (data.type === 'UPDATE_CONFIG') {
            clientConfig = data.config;
            console.log("Updated Client Config:", clientConfig);
        } else if (data.type === 'CONNECT_TIKTOK') {
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
                        // Filter: CHAT MESSAGES
                        if (msg.type === 'WebcastChatMessage') {
                            if (clientConfig.readChat?.enabled) {
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
                        }
                        // Filter: GIFT
                        else if (msg.type === 'WebcastGiftMessage') {
                            if (clientConfig.readGifts?.enabled) {
                                const usuario = msg.data.user.uniqueId;
                                const giftId = msg.data.giftId;
                                const giftName = msg.data.gift?.name || "Gift"; // Fallback if name not available
                                console.log(`${usuario} sent gift: ${giftName}`);

                                ws.send(JSON.stringify({
                                    type: 'TIKTOK_GIFT',
                                    data: {
                                        uniqueId: usuario,
                                        giftName: giftName,
                                        giftId: giftId
                                    }
                                }));
                            }
                        }

                        // Filter: LIKE
                        else if (msg.type === 'WebcastLikeMessage') {
                            if (clientConfig.readLikes?.enabled) {
                                ws.send(JSON.stringify({
                                    type: 'TIKTOK_LIKE',
                                    data: {
                                        uniqueId: msg.data.user.uniqueId
                                    }
                                }));
                            }
                        }
                        // Filter: MEMBER JOIN
                        else if (msg.type === 'WebcastMemberMessage') {
                            if (clientConfig.readJoins?.enabled) {
                                console.log(`Member event: ${msg.data.user.uniqueId}`);

                                const usuario = msg.data.user.uniqueId;

                                ws.send(JSON.stringify({
                                    type: 'JOIN_MESSAGE',
                                    data: {
                                        comment: `${usuario} se unio al chat`
                                    }
                                }));
                            }
                        }

                        // Filter: SOCIAL (Follow, Share)
                        else if (msg.type === 'WebcastSocialMessage') {
                            // displayType: 'pm_mt_msg_viewer_follow_chain' or similar? 
                            // Need to check msg structure. Often:
                            // type: 1 -> Follow?
                            // type: 3 -> Share?
                            // We'll rely on text or specific fields if available. 
                            // Using a safe heuristic if Eulerstream normalized it, otherwise raw.

                            const displayType = msg.data.displayType || "";

                            if (displayType.includes("follow") && clientConfig.readFollows?.enabled) {
                                ws.send(JSON.stringify({
                                    type: 'TIKTOK_FOLLOW',
                                    data: {
                                        comment: `${msg.data.user.uniqueId} se siguió`
                                    }
                                }));
                            }

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
