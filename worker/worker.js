var request = require('request');
var redis = require('redis');
var tasksQueue = redis.createClient({ host: 'queue', port: 6379 });

tasksQueue.subscribe('tasksChannel');

tasksQueue.on('message', function (channel, message) {
    console.log('channel:', channel, 'message:', message);
    console.log('TODO: notify browser that worker is finished');
    request.debug = true;
    request.post('http://notifier:3001/notify', {form:{clientId:message, result: Date.now()}});
    //request.post('http://notifier:3001/notify', {json:{clientId:message}});
});
