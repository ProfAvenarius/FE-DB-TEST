const Message = require('../models/Message');

/**
 * Handles a client disconnecting from the chat server
 * 
 * @param {string} username The username of the client who disconnected
 * @param {Array} connectedClients Array of connected clients
 * @param {function} broadcastMessage Function to broadcast messages to all clients
 */
function onClientDisconnected(username, connectedClients, broadcastMessage) {
  // Find and remove the disconnected client
  const index = connectedClients.findIndex(client => client.username === username);
  if (index !== -1) {
    connectedClients.splice(index, 1);
    
    // Notify other users about the disconnection
    broadcastMessage({
      type: 'userDisconnected',
      username: username,
      timestamp: new Date(),
      onlineUsers: connectedClients.map(client => client.username)
    });
  }
}

/**
 * Handles a new client connecting to the chat server
 * 
 * @param {WebSocket} newSocket The socket the client has opened with the server
 * @param {string} username The username of the user who connected
 * @param {Array} connectedClients Array of connected clients
 * @param {function} broadcastMessage Function to broadcast messages to all clients
 */
function onNewClientConnected(newSocket, username, connectedClients, broadcastMessage) {
  // Check if user is already connected (e.g., from another tab/window)
  const existingClientIndex = connectedClients.findIndex(client => client.username === username);
  
  if (existingClientIndex !== -1) {
    // Replace the existing socket with the new one
    connectedClients[existingClientIndex].socket = newSocket;
  } else {
    // Add new client to connected clients list
    connectedClients.push({ socket: newSocket, username: username });
    
    // Notify all users about the new connection
    broadcastMessage({
      type: 'userConnected',
      username: username,
      timestamp: new Date(),
      message: `User ${username} has joined the chat!`,
      onlineUsers: connectedClients.map(client => client.username)
    });
  }
}

/**
 * Handles a new chat message being sent from a client
 * 
 * @param {string} messageContent The message being sent
 * @param {string} username The username of the user who sent the message
 * @param {string} id The ID of the user who sent the message
 * @param {function} broadcastMessage Function to broadcast messages to all clients
 * @returns {Object} The saved message object
 */
async function onNewMessage(messageContent, username, id, broadcastMessage) {
  try {
    // Create and save the message to the database
    const message = new Message({
      content: messageContent,
      sender: username,
      timestamp: new Date()
    });
    
    await message.save();
    
    // Broadcast the message to all connected clients
    broadcastMessage({
      type: 'chatMessage',
      message: messageContent,
      sender: username,
      timestamp: message.timestamp
    });
    
    return message;
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

/**
 * Retrieves recent messages from the database
 * 
 * @param {number} limit Number of messages to retrieve
 * @returns {Array} Array of recent messages
 */
async function getRecentMessages(limit = 50) {
  try {
    const messages = await Message.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    return messages.reverse();
  } catch (error) {
    console.error('Error retrieving recent messages:', error);
    throw error;
  }
}

module.exports = {
  onClientDisconnected,
  onNewClientConnected,
  onNewMessage,
  getRecentMessages
};