# P2PChat

P2PChat is a peer-to-peer chat application built using Node.js, leveraging UDP for message transmission. It utilizes TypeScript for type safety and Zod for schema validation, ensuring robust and error-free message handling.

## Features

- **Peer-to-Peer Communication:** Directly send and receive messages without the need for a central server.
- **Group Chat:** Broadcast messages to all connected peers or send direct messages.
- **Causal and Orderly Message Delivery:** Ensures messages are delivered in a causally consistent order and handles direct messages with expected sequence numbers.
- **Dynamic Peer Discovery:** Automatically discover and connect with peers using the "meet" protocol.
- **Vector Clocks:** Utilize vector clocks for maintaining a partial ordering of events in the distributed system.

## Installation

To run P2PChat, ensure you have Node.js and npm/yarn installed on your system.

1. Clone the repository:

```bash
git clone  
```

2. Install dependencies:

```bash
yarn install
```
## Usage

To start the application, run the following command:

```bash
yarn start
```
Follow the on-screen prompts to connect with peers and start messaging.

## Commands

- **meet <address> <port>:** Connect to a new peer.
- **dm:** Send a direct message to a specific peer.
- **broadcast:** Send a message to all connected peers.
- **quit:** Disconnect from the network.

## License

This project is licensed under the MIT License - see the LICENSE file for details.