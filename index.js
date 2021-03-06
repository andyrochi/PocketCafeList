'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const cors = require('cors');

// Obtain token and secret from .env if not production
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// export Maps API key
exports.mapsAPI = process.env.MAPS_API_KEY;

// create LINE SDK client
const client = new line.Client(config);
// export to import in commandHandler
exports.client = client;
// prevent cyclic dependencies
const command = require('./controllers/commandHandler');
const list = require('./controllers/list');

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/callback', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// handle frontend requests
app.get('/list/:id',cors(), async (req, res) => {
  const id = req.params.id
  let response = 0;
  await list.getUserList(id).then((res)=>{
    console.log(res)
    response = res;
  })
  if (response === false)
    res.status(404).send({
      message: 'User id not found!'
    })
  else
    res.send(response)
})

app.get('/user/:id',cors(), async (req, res) => {
  const id = req.params.id
  let response = 0;
  await list.getUserInfo(id).then((res)=>{
    console.log(res)
    response = res;
  })
  if (response === null)
    res.status(404).send({
      message: 'User id not found!'
    })
  else
    res.send(response)
})

// event handler
async function handleEvent(event) {
  if (event.type !== 'message' && event.message?.type !== 'text' && event.message?.type !== 'location' && event.type !== 'postback') {
    // ignore non-text-message/non-location/non-postback event
    return Promise.resolve(null);
  }

  // handle text message with commandHandler
  const echo = await command.commandHandler(event);
  
  if (echo === null) {
    return Promise.resolve(null);
  }
  // use reply API
  return client.replyMessage(event.replyToken, echo);
}

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});

module.exports = {
  client: client
}
