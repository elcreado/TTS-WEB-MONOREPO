export type ClientMessage =
    | { type: "CONNECT"; username: string }
    | { type: "DISCONNECT" }

export type serverMessage =
    | { type: "STATUS"; state: string }
    | { type: "SAY"; id: string; text: string }