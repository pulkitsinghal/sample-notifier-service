var express = require('express'),
    app = express(),
    server = require('http').Server(app),
    redis = require('redis'),
    tasksQueue = redis.createClient({ host: 'queue', port: 6379 });

// 1. browser clients will download the app
app.use(express.static('public'));
app.use(express.static('node_modules/socket.io-client'));

// Accept URL-encoded body in POST request
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

// 2. browser clients will make requests to web server from the app
app.post('/runTask', function(request, response) {
    if (request.body && request.body.clientId) {
        console.log('TODO: run a worker for user w/ clientId:', request.body.clientId);
        tasksQueue.publish('tasksChannel', request.body.clientId);

        response.type('text/plain');
        response.send('roger! worker will notify you when the work is done.');
    }
    else {
        response.type('text/plain');
        response.send('roger! worker cannot notify you without an identifier');
    }
});

server.listen(3000, function(){
    console.log('server instance started');
});
