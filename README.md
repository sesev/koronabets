# koronabets
Gets daily new infections in Finland and has a contest of guessing the new amount of daily infections.


these are variables you need to configure in .env
if you use other names, change them in ./utils/config.js

require('dotenv').config()
let BOT_TOKEN=process.env.TOKEN
let MONGODB_URI=process.env.MONGODB_URI
let TWITTER=process.env.TWITTER
let lorocrewId=process.env.lorocrewId
let testailuId=process.env.testailuId
module.exports = { BOT_TOKEN, MONGODB_URI, TWITTER, lorocrewId, testailuId }

where:
BOT_TOKEN is telegram bot api key,
MONGODB_URI is the url with identification to mongodb.
TWITTER is bearer token,
lococrewId is group id in telegram,
testailuId is testing group id in telegram,
