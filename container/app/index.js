const express = require('express');
const morgan = require('morgan');
const cosmos = require('@azure/cosmos');

async function getContainer(endpoint, masterKey, region) {
    const client = new cosmos.CosmosClient({
        endpoint,
        key: masterKey,
        connectionPolicy: {
            preferredLocations: [region],
        },
    });

    const { database: db } = await client.databases.createIfNotExists({ id: "thedb" });
    const { container } = await db.containers.createIfNotExists({ id: "urls" });
    return container;
}

const app = express();
app.use(morgan('combined'));


app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
});

app.get('/cosmos', async (req, res) => {
  const endpoint = process.env.ENDPOINT;
  const masterKey = process.env.MASTER_KEY;
  const location = process.env.LOCATION;

  let container = await getContainer(endpoint, masterKey, location);
  const response = await container.item("test", undefined).read();

  if (response.resource && response.resource.url) {
    res.send(response.resource.url);
  } else {
    res.status(404).end();
  }
});

app.get('/api/ping', (req, res) => {
  res.send('Ack')
});

var listener = app.listen(process.env.PORT || 80, function() {
 console.log('listening on port ' + listener.address().port);
});