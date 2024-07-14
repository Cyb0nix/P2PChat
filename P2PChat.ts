import * as dgram from "node:dgram";
import {z} from "zod";
import * as readline from "node:readline";
import {randomUUID} from "node:crypto";


const server = dgram.createSocket('udp4');

const portSchema = z.string().regex(/^((6553[0-5])|(655[0-2][0-9])|(65[0-4][0-9]{2})|(6[0-4][0-9]{3})|([1-5][0-9]{4})|([0-5]{0,5})|([0-9]{1,4}))$/);
const addressSchema = z.string().ip({version: "v4"});

const messageSchema = z.object({
    type: z.enum(["meet", "broadcast", "direct", "rebroadcast"]),
    content: z.string(),
    origin: z.string(),
    timestamp: z.string().optional()
});

export interface MessageModel {
    type: "meet" | "broadcast" | "direct" | "rebroadcast" | "quit";
    content: string;
    origin: string;
    timestamp?: string;
}

const messageQueue: MessageModel[] = [];
const messageHistory: MessageModel[] = [];

let clientAddress = "";
let clientPort = null;
const nodeId = randomUUID();

const neighbors = new Map<string, string>();
const vectorClock = new Map<string, number>();
vectorClock.set(nodeId, 0);

const dmSentSequenceNumbers = new Map<string, number>();
const dmExpectedSequenceNumbers = new Map<string, number>();

function validatePayload(payload: string) {
    return messageSchema.safeParse(JSON.parse(payload)).success;
}

function clearLastLine() {
    process.stdout.moveCursor(0, -1) // up one line
    process.stdout.clearLine(1) // from cursor to end
}

function broadcastMessage(content: string, type: "broadcast" | "rebroadcast" | "quit" = "broadcast") {
    // @ts-ignore
    vectorClock.set(nodeId, vectorClock.get(nodeId) + 1);

    const message: MessageModel = {
        type: type,
        content: content,
        origin: nodeId,
        timestamp: JSON.stringify([...vectorClock])
    };

    const payload = JSON.stringify(message);
    neighbors.forEach((address) => {
        server.send(payload, Number.parseInt(address.split(":")[1]), address.split(":")[0], (err) => {
            if (err) {
                console.log(err);
                process.exit(1);
            }
        });
    });
}

function groupMeet(address: string, port: string) {
    if (!addressSchema.safeParse(address).success) {
        console.log("%cInvalid address", "color: red");
        return;
    }

    if (!portSchema.safeParse(port).success) {
        console.log("%cInvalid port", "color: red");
        return;
    }

    const meetMessage: MessageModel = {
        type: "meet",
        content: "",
        origin: nodeId,
    };

    const payload = JSON.stringify(meetMessage);

    if (![...neighbors.values()].includes(`${address}:${port}`)) {
        server.send(payload, Number.parseInt(port), address, (err) => {
            if (err) {
                console.log(err);
                process.exit(1);
            }
        });
    }
}

function canDeliverCausally(message: MessageModel) {
    if (message.timestamp != null) {
        const messageVectorClock = new Map(JSON.parse(message.timestamp));
        // @ts-ignore
        if (messageVectorClock.get(message.origin) == vectorClock.get(message.origin) + 1) {
            for (const [key, value] of messageVectorClock) {
                // @ts-ignore
                if (key != message.origin && value > vectorClock.get(key)) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    }
}

function canDeliverOrderly(message: MessageModel) {

    if (dmExpectedSequenceNumbers.has(message.origin)) {
        // @ts-ignore
        if (message.timestamp == dmExpectedSequenceNumbers.get(message.origin).toString()) {
            // @ts-ignore
            dmExpectedSequenceNumbers.set(message.origin, dmExpectedSequenceNumbers.get(message.origin) + 1);
            return true;
        } else {
            return false;
        }
    } else {
        dmExpectedSequenceNumbers.set(message.origin, 0);
        if (message.timestamp == "0") {
            // @ts-ignore
            dmExpectedSequenceNumbers.set(message.origin, 1);
            return true;
        } else {
            return false;
        }
    }

}

function deliverMessages() {
    while (messageQueue.length > 0) {
        const message = messageQueue[0];
        if (message.type == "rebroadcast" && messageHistory.includes(message)) {
            messageQueue.shift();
            continue;
        }
        if (message.type == "direct") {
            if (canDeliverOrderly(message)) {
                console.log(`Direct Message > ${message.origin}: ${message.content}`);
                messageQueue.shift();
                messageHistory.push(message);
                continue;
            }
        }
        if (canDeliverCausally(message)) {
            // @ts-ignore
            vectorClock.set(message.origin, vectorClock.get(message.origin) + 1);
            console.log(`Broadcast > ${message.origin}: ${message.content}`);
            messageQueue.shift();
            messageHistory.push(message);
        } else {
            break;
        }

    }
}

function directMsg(content: string, address: string, port: string) {
    if (!addressSchema.safeParse(address).success) {
        console.log("%cInvalid address", "color: red");
        return;
    }

    if (!portSchema.safeParse(port).success) {
        console.log("%cInvalid port", "color: red");
        return;
    }

    const neighbor = [...neighbors.keys()].find((key) => neighbors.get(key) == `${address}:${port}`);

    if (neighbor && !dmExpectedSequenceNumbers.has(neighbor)) {
        dmExpectedSequenceNumbers.set(neighbor, 0);
    }

    if (neighbor && !dmSentSequenceNumbers.has(neighbor)) {
        dmSentSequenceNumbers.set(neighbor, 0);
    } else if (neighbor) {
        // @ts-ignore
        dmSentSequenceNumbers.set(neighbor, dmSentSequenceNumbers.get(neighbor) + 1);
    }

    // @ts-ignore
    const timestamp = dmSentSequenceNumbers.get(neighbor).toString();

    const message: MessageModel = {
        type: "direct",
        content: content,
        origin: nodeId,
        timestamp: timestamp
    };

    const payload = JSON.stringify(message);
    server.send(payload, Number.parseInt(port), address, (err) => {
        if (err) {
            console.log(err);
            process.exit(1);
        }
    });
}

function quit() {
    broadcastMessage("", "quit");
    server.close();
}


server.on('message', (msg, info) => {
    const message = JSON.parse(msg.toString());
    if (!validatePayload(msg.toString())) {
        return;
    }

    if (message.origin == nodeId) {
        return;
    }

    if (message.type == "meet") {
        if (!neighbors.has(message.origin)) {
            groupMeet(info.address, info.port.toString());
            neighbors.set(message.origin, `${info.address}:${info.port}`);
            vectorClock.set(message.origin, 0);
            console.log(`%cNew neighbor: ${message.origin}`, "color: green");
        }
    } else if (message.type == "broadcast" || message.type == "rebroadcast") {
        messageQueue.push(message);
        deliverMessages();
        if (message.type == "broadcast") {
            broadcastMessage(message.content, "rebroadcast");
        }
    } else if (message.type == "quit") {
        neighbors.delete(message.origin);
        console.log(`%cNeighbor left: ${message.origin}`, "color: red");
    } else if (message.type == "direct") {
        messageQueue.push(message);
        deliverMessages();
    }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

server.on("listening", () => {
    const address = server.address();
    console.log(`server listening ${address.address}:${address.port}`);
});

rl.on("line", async (text) => {
    const [command, ...args] = text.split(" ");
    if (command === "meet") {
        groupMeet(args[0], args[1]);
    } else if (command === "dm") {
        const choices = [...neighbors.keys()].map((neighbor) => ({
            title: neighbor,
            value: neighbors.get(neighbor),
        }));

        console.log("Here are your neighbors:");

        choices.forEach((choice) => console.log("%s, %s", choice.title, choice.value));

        rl.question("Who do you want to send a message to? (addr:port)", (response) => {
            const [address, port] = response.split(":");

            rl.question("Type your message: ", (msg) => {
                directMsg(msg, address, port);
                clearLastLine();
                console.log("You sent: %s", msg);
            });
        });
    } else if (command === "broadcast") {
        rl.question("Type your message: ", (msg) => {
            broadcastMessage(msg);
            clearLastLine();
            console.log("You sent: %s", msg);
        });
    } else if (command === "quit") {
        quit();
    }
});


rl.question("enter your address: ", (answer) => {
    rl.question("enter your port: ", (port) => {
        if (!portSchema.safeParse(port).success) {
            console.error("Invalid port number");
            clientPort = Number.parseInt(port);
            process.exit(1);
        }
        server.bind(Number.parseInt(port), answer);
        clientAddress = answer;
    });
});