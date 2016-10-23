/**
 * Starting point for the notifier logic/idea was:
 * https://github.com/mminer/blog-code/blob/master/pattern-for-async-task-queue-results/notifier.js
 */

var express = require('express'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

// Echo the client's ID back to them when they connect.
var onConnection = function(socket) {
    console.log('new connection established on socket ID:', socket.id);
    console.log('all currently connected socket IDs:', Object.keys(io.sockets.connected));
    socket.emit('register', socket.id);
};
io.on('connection', onConnection);

// Accept URL-encoded body in POST request
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

// Forward task results to the clients who initiated them.
app.post('/notify', function(request, response) {
    console.log('request.body:', request.body);
    if (request.body && request.body.notificationId) {
        var client = io.sockets.connected[request.body.notificationId];
        if(client) {
            console.log('will send notification to:', request.body.notificationId);
            client.emit('notify', request.body);
            response.type('text/plain');
            response.send('Result broadcast to client.' + Date.now());
        }
        else {
            console.log('cannot find client to notify');
            response.status(500).send('cannot find client to notify');
        }
    }
    else {
        response.status(403).send('notificationId is required');
    }
});

server.listen(3001, function(){
    console.log('notifier instance started');
});
