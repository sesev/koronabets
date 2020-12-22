const Telegraf = require('telegraf')
const session = require('telegraf/session')
const config = require('./utils/config')
const mongoose = require('mongoose')
const fs = require('fs')
const needle = require('needle')
const CronJob = require('cron').CronJob




const bot = new Telegraf(config.BOT_TOKEN)

//mongodb yhteys
mongoose.connect(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })

const veikkausSchema = new mongoose.Schema({
  telegramId: { type: String, required: true },
  name: { type: String, required: true },
  veikkaukset: [{ veikkaus: Number, date: Date }]
})

const Veikkaus = mongoose.model('Veikkaus', veikkausSchema)

const tartunnatSchema = new mongoose.Schema({
  tartunnat: { type: String, required: true },
  date: Date
})
const Tartunnat = mongoose.model('Tartunnat', tartunnatSchema)

//alustetaan botti käyttöön ja session middleware käyttöön

bot.use(session())


//haetaan twiitit
bot.command('twiitit', (ctx) => {

  const token = config.TWITTER
  const endpointUrl = 'https://api.twitter.com/2/tweets/search/recent'

  async function getRequest() {

    // Edit query parameters below
    const params = {
      'query': 'from:bot_fi -is:retweet',
      'tweet.fields': 'author_id'
    }

    const res = await needle('get', endpointUrl, params, {
      headers: {
        'authorization': `Bearer ${token}`
      }
    })

    if (res.body) {
      return res.body
    } else {
      throw new Error('Unsuccessful request')
    }
  }
  (async () => {

    try {
      // Make request
      const tulos = await getRequest()
      const response = JSON.stringify(tulos)
      const siistitty = response.split(' ')
      ctx.reply(siistitty)
      console.log(siistitty)
    } catch (e) {
      console.log(e)
    }
  })()
})




// Register logger middleware
bot.use((ctx, next) => {
  const start = new Date()
  return next().then(() => {
    const ms = new Date() - start
    console.log('response time %sms', ms)
  })
})
var job = new CronJob('0 */1 11-12 * * *', function () {
  haeTulokset()
}, null, true, 'Europe/Helsinki')
job.start()


var kutittaa = new CronJob('0 0 12 * * *', function () {
  pallejaKutittaa()
}, null, true, 'Europe/Helsinki')
kutittaa.start()


function pallejaKutittaa() {
  bot.telegram.sendMessage(config.lorocrewId, 'palleja kutittaa')
}
//haetaan hesarin lajitellusta tartuntamääräkannasta tartunnat
function haeTulokset() {
  const apiurl = 'https://w3qa5ydb4l.execute-api.eu-west-1.amazonaws.com/prod/finnishCoronaData/v2'
  async function getRequest() {

    const res = await needle('get', apiurl)

    if (res.body) {
      return res.body
    } else {
      throw new Error('Unsuccessful request')
    }
  }
  (async () => {
    let tulos
    try {
      // Make request
      tulos = await getRequest()
    } catch (e) {
      console.log(e)
    }

    Tartunnat.find({}, async function (err, data) {
      if (err) {
        console.log(err)
      } else if (data.length === 0) {
        console.log('kannassa ei tietueita, lisätään tartuntaluku')
        const tartuntaluvut = new Tartunnat({
          tartunnat: tulos.confirmed.length,
          date: new Date()
        })
        console.log(tulos.confirmed.length)
        tartuntaluvut.save()
      } else {
        console.log(getMostRecentTartunnat(data))
        const uusinTartuntaTieto = getMostRecentTartunnat(data)
        if (tulos.confirmed.length > uusinTartuntaTieto.tartunnat) {
          console.log('tulokset päivittyneet')
          const tartuntaluvut = new Tartunnat({
            tartunnat: tulos.confirmed.length,
            date: new Date()
          })
          console.log(tulos.confirmed.length)
          await tartuntaluvut.save()
          tarkistaTulokset()
        }

        else {
          console.log('tulokset ei muuttuneet')
        }
      }
    })
  })()
}



bot.command('hae', () => {
  haeTulokset()
})

function tarkistaTulokset() {
  Tartunnat.find({}, function (err, data) {
    if (data.length <= 1) {
      console.log('tietueita 1 tai alle, ei voida vertailla')
    } else {
      const sorted = data.sort((a, b) => {
        return b.tartunnat - a.tartunnat
      })
      const erotus = sorted[0].tartunnat - sorted[1].tartunnat

      if (erotus === 0) {
        console.log('erotus nolla')
      }

      else {
        console.log('hulabaloo')
      }


      Veikkaus.find({}, function (err, data) {
        if (err) {
          console.log(err)
        } else {
          let uusimmat = []
          data.forEach(veikkaaja => {
            const uusinveikkaus = {
              id: veikkaaja.telegramId,
              name: veikkaaja.name,
              uusin: getMostRecentVeikkaus(veikkaaja)
            }
            uusimmat.push(uusinveikkaus)
          })
          let jaettu = uusimmat.map((item) => {
            return {
              name: item.name,
              veikkaus: item.uusin.veikkaus
            }
          })

          const officialCount = erotus
          const bestBets = jaettu
            .map(bet => {
              return {
                difference: Math.abs(officialCount - bet.veikkaus),
                ...bet
              }
            })
            .sort((first, second) => first.difference - second.difference)
          console.log(bestBets[0])
          console.log(erotus)
          let reply = ''
          bestBets.forEach(v => {
            reply = reply + v.name + ': ' + v.veikkaus + ' +/– ' + v.difference +'\n'

          })

          bot.telegram.sendMessage(config.lorocrewId, `${dateStr}\nUusia tartuntoja: ${erotus}\n\nTulokset päivälle:\n\n${reply}\n\n${bestBets[0].name} on voittaja ${bestBets[0].veikkaus} tartuntaveikkauksella!\nOnneksi olkoon voittajalle!`)

        }
      })
      var d = new Date()
      var date = d.getDate()
      var month = d.getMonth() + 1
      var year = d.getFullYear()

      var dateStr = date + '.' + month + '.' + year

    }


  })}


function veikkaukset() {
  Veikkaus.find({}, function (err, data) {
    if (err) {
      console.log(err)
    } else {
      let uusimmat = []
      data.forEach(veikkaaja => {
        const uusinveikkaus = {
          id: veikkaaja.telegramId,
          name: veikkaaja.name,
          uusin: getMostRecentVeikkaus(veikkaaja)
        }
        uusimmat.push(uusinveikkaus)
      })

      let reply = ''
      uusimmat.forEach(v => {
        reply = reply + v.name + ': ' + v.uusin.veikkaus + '\n'

      })
    }
  })
}


bot.command('tarkista', () => {
  tarkistaTulokset()
})

//haetaan tartuntamäärä @bot_fi twiitistä
bot.command('tart', (ctx) => {
  fs.readFile('./tartunnat.json', 'utf8', (err, data) => {
    if (err) {
      console.log(`Ei pystytty lukemaan: ${err}`)
    }
    else {
      const tartunnat = JSON.parse(data)
      const puhdistettu2 = tartunnat.renderedContent.replace(/\s/g, ' ')
      const puhdistettu3 = puhdistettu2.replace(/\u25aa/g, '')
      const puhdistettu = puhdistettu3.split(' ')
      ctx.reply(`Uusia tartuntoja tänään: ${puhdistettu[10]}\nVeikkauksen voittaja: `)
      console.log('Uusia tartuntoja tänään: ' + puhdistettu[10])
      var d = new Date()

      var date = d.getDate()
      var month = d.getMonth() + 1 // Since getMonth() returns month from 0-11 not 1-12
      var year = d.getFullYear()

      var dateStr = date + '.' + month + '.' + year
      ctx.reply(dateStr)
    }
  })
})


//käyttäjän veikkaus
bot.command('veikkaukseni', (ctx) => {
  const id = ctx.from.id
  console.log(ctx.from.id)
  Veikkaus.find({ telegramId: id }, function (err, kayttaja) {
    if (err) {
      console.log(err)
    } else {

      //ctx.reply(veikkaukset[veikkaukset.length - 1])
      console.log(getMostRecentVeikkaus(kayttaja[0]))
      const v = getMostRecentVeikkaus(kayttaja[0])
      ctx.reply(`Veikkauksesi tälle päivälle on: ${v.veikkaus}`)
    }
  })
})

bot.command('veikkaukset', () => {
  veikkaukset()
})

//osallistuminen veikkaukseen
bot.command('korona', (ctx) => {
  (async () => {
    console.log('\nveikkauskutsu')

    const telegramId = ctx.from.id
    const first_name = ctx.from.first_name.toString()
    const msg = ctx.message.text.substring(8)
    const now = new Date()
    const tanaan = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const uusiveikkaus = new Veikkaus({
      telegramId: telegramId,
      name: first_name,
      veikkaukset: [{ veikkaus: msg, date: now }]
    })

    if (isNaN(msg) || uusiveikkaus.veikkaukset[0].veikkaus === null || uusiveikkaus.veikkaukset[0].veikkaus >= 10000 || uusiveikkaus.veikkaukset[0].veikkaus <= 0) {
      // validointi haara
      ctx.reply('Mita mita sina sanoa, onko pitsasasi jota vikana!?')
    }
    else {
      const filter = { telegramId: telegramId }
      if (await Veikkaus.exists(filter)) { // telegramId löytyy kannasta
        console.log('vanha veikkaaja')
        let doc = await Veikkaus.findOne(filter)


        let uusin = new Date(1970)
        doc.veikkaukset.forEach(veikkaus => {
          if (dayIsBefore(uusin, veikkaus.date)) {
            uusin = veikkaus.date
          }
        })

        console.log('uusin', uusin)
        console.log('tanaan', tanaan)
        console.log('uusin === tanaan', datesMatch(uusin, tanaan))
        if (datesMatch(uusin, tanaan)) {
          console.log('päivitetään käyttäjän tämänpäiväinen veikkaus')

          for (let i = 0; i < doc.veikkaukset.length; i++) {
            if (datesMatch(doc.veikkaukset[i].date, uusin)) {
              doc.veikkaukset[i].date = now
              doc.veikkaukset[i].veikkaus = msg
            }
          }
          doc.save(function (err, doc) {
            if (err) {
              return console.error(err)
            } else {
              console.log(doc)
              console.log(ctx.from.chat_id)
              ctx.reply(`${first_name}, olet jo veikannut tänään, joten veikkauksesi päivitetään: ${msg} uutta tartuntaa.`)
            }
          })
        } else {
          console.log('lisätään käyttäjälle uusi veikkaus')
          const update = {
            name: first_name,
            veikkaukset: [...doc.veikkaukset, { veikkaus: msg, date: now }]
          }
          await Veikkaus.updateOne(filter, update)

          doc.save(function (err, doc) {
            if (err) {
              return console.error(err)
            } else {
              console.log(doc)
              ctx.reply(`${first_name}, onnea veikkaukseen! Osallistuit veikkaamalla ${msg} uutta tartuntaa.`)
            }
          })
        }
      }
      else {
        console.log('uusi veikkaaja')
        uusiveikkaus.save(function (err, doc) {
          if (err) {
            return console.error(err)
          } else {
            console.log(doc)
            ctx.reply(`${first_name}, onnea veikkaukseen! Osallistuit veikkaamalla ${msg} uutta tartuntaa.`)
          }
        })
      }
    }
  })()
})

function datesMatch(a, b) {
  const aDay = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return aDay.getTime() === bDay.getTime()
}

function dayIsBefore(a, b) {
  const aDay = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return aDay.getTime() < bDay.getTime()
}

function getMostRecentTartunnat(t) {
  return t.reduce((a, b) => (a.date > b.date ? a : b))
}

function getMostRecentVeikkaus(veikkaaja) {
  return veikkaaja.veikkaukset.reduce((a, b) => (a.date > b.date ? a : b))
}
bot.startPolling()
//botti käyntiin
