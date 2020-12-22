require('dotenv').config()
let BOT_TOKEN=process.env.TOKEN
let MONGODB_URI=process.env.MONGODB_URI
let TWITTER=process.env.TWITTER
let lorocrewId=process.env.lorocrewId
let testailuId=process.env.testailuId
module.exports = { BOT_TOKEN, MONGODB_URI, TWITTER, lorocrewId, testailuId }