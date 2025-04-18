// Initialize variables that will be available when the DOM is loaded
let username; 
let chatMessages;
let messageForm;
let messageInput;
let onlineUsersList;
let socket;

// Helper function to format timestamps
function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
}

// Function to add a message to the chat container
function addMessageToChat(message, type) {
    const messageDiv = document.createElement('div');
    
    if (type === 'system') {
        messageDiv.className = 'system-message';
        messageDiv.innerHTML = `<div class="message-content">${message.message}</div>`;
    } else {
        const isMyMessage = message.sender === username;
        messageDiv.className = `message ${isMyMessage ? 'my-message' : 'other-message'}`;
        
        messageDiv.innerHTML = `
            <div class="message-sender">${message.sender}</div>
            <div class="message-content">${message.message}</div>
            <div class="message-timestamp">${formatTimestamp(message.timestamp)}</div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to update online users list
function updateOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        
        if (user === username) {
            li.innerHTML = `${user} <span class="badge bg-primary">You</span>`;
        } else {
            li.innerHTML = `<a href="/profile/${user}" class="text-decoration-none">${user}</a>`;
        }
        
        onlineUsersList.appendChild(li);
    });
}

// Connect to WebSocket server
function connectToWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    socket.onopen = function() {
        console.log('Connected to chat server');
    };
    
    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'chatMessage':
                addMessageToChat({
                    sender: data.sender,
                    message: data.message,
                    timestamp: data.timestamp
                });
                break;
            
            case 'userConnected':
                addMessageToChat({
                    message: data.message
                }, 'system');
                updateOnlineUsers(data.onlineUsers);
                break;
            
            case 'userDisconnected':
                addMessageToChat({
                    message: `User ${data.username} has left the chat`
                }, 'system');
                updateOnlineUsers(data.onlineUsers);
                break;
            
            default:
                console.log('Unknown message type:', data.type);
        }
    };
    
    socket.onclose = function() {
        console.log('Disconnected from chat server');
        // Try to reconnect after 5 seconds
        setTimeout(connectToWebSocket, 5000);
    };
    
    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Send a message
function onMessageSent(e) {
    e.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    socket.send(JSON.stringify({
        type: 'chatMessage',
        message: message
    }));
    
    messageInput.value = '';
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {

    // Add navbar toggle functionality
    const navbarToggler = document.querySelector('.navbar-toggler');
    if (navbarToggler) {
        navbarToggler.addEventListener('click', function() {
        const navbarCollapse = document.querySelector('.navbar-collapse');
        navbarCollapse.classList.toggle('show');
        });
    }
    // Get username from global variable 
    username = chatUsername; // This will be defined in the EJS template
    
    // Get DOM elements
    chatMessages = document.getElementById('chatMessages');
    messageForm = document.getElementById('messageForm');
    messageInput = document.getElementById('messageInput');
    onlineUsersList = document.getElementById('onlineUsers');
    
    // Add event listener for message form
    messageForm.addEventListener('submit', onMessageSent);
    
    // Initial connection
    connectToWebSocket();
    
    // Scroll chat to bottom on load
    chatMessages.scrollTop = chatMessages.scrollHeight;
});