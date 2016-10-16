// starting point was: https://github.com/mminer/blog-code/blob/master/pattern-for-async-task-queue-results/notifier.js

var express = require('express'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

// Echo the client's ID back to them when they connect.
io.on('connection', function(socket) {
    console.log('connection:', socket.id);
    socket.emit('register', socket.id);
});

// Accept URL-encoded body in POST request
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

// Forward task results to the clients who initiated them.
app.post('/notify', function(request, response) {
    console.log('request.body:', request.body);
    if (request.body && request.body.clientId) {
        var client = io.sockets.connected[request.body.clientId];
        if(client) {
            console.log('will send notification to:', request.body.clientId);
            client.emit('notify', request.body.result);
            response.type('text/plain');
            response.send('Result broadcast to client.' + Date.now());
        }
        else {
            console.log('cannot find client to notify');
            res.status(500).send('cannot find client to notify');
        }
    }
    else {
        response.status(403).send('Forbidden');
    }
});

server.listen(3001, function(){
    console.log('notifier instance started');
});
