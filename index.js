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

const ouluVeikkausSchema = new mongoose.Schema({
  telegramId: {type: String, required: true},
  name: {type: String, required: true},
  veikkaukset: [{ veikkaus: Number, date: Date}]
})

const OuluVeikkaus = mongoose.model('OuluVeikkaus', ouluVeikkausSchema)

const tartunnatSchema = new mongoose.Schema({
  tartunnat: { type: Number, required: true },
  date: Date
})
const Tartunnat = mongoose.model('Tartunnat', tartunnatSchema)

const ouluTartunnatSchema = new mongoose.Schema({
  oulutartunnat: {type: Number, required: true},
  date: Date
})
const OuluTartunnat = mongoose.model('OuluTartunnat', ouluTartunnatSchema)

//alustetaan botti käyttöön ja session middleware käyttöön

bot.use(session())

// Register logger middleware
bot.use((ctx, next) => {
  const start = new Date()
  return next().then(() => {
    const ms = new Date() - start
    console.log('response time %sms', ms)
  })
})
var job = new CronJob('0 30/1 11 * * *', function () {
  haeTulokset()
  thlTulokset()
}, null, true, 'Europe/Helsinki')
job.start()


var kutittaa = new CronJob('0 0 7 * * *', function () {
  pallejaKutittaa()
  hesesaa()
  oulusaa()
}, null, true, 'Europe/Helsinki')
kutittaa.start()




function pallejaKutittaa() {
  bot.telegram.sendMessage(config.lorocrewId, 'Muistakaa veikata! Esim. /korona 666 ja/tai /oulu 12')
}

function thlTulokset() {
  const thlUrlOulu = 'https://sampo.thl.fi/pivot/prod/fi/epirapo/covid19case/fact_epirapo_covid19case.json?row=hcdmunicipality2020-445234.&column=dateweek20200101-509030&filter=measure-444833'
  async function getRequest() {

    const response = await needle('get', thlUrlOulu)

    if (response.body) {
      return response.body
    } else {
      throw new Error('Unsuccessful request')
    }
  }
  (async () => {
    let oulutulos
    let joulutulos
    try {
      oulutulos = await getRequest()
      joulutulos = oulutulos.dataset.value
      oulutartunta = joulutulos[Object.keys(joulutulos)[Object.keys(joulutulos).length - 1]]
    } catch (e) {
      console.log(e)
    }

    OuluTartunnat.find({}, async function (err, data) {
      if (err) {
        console.log(err)
      } else if (data.length === 0) {
        console.log('kannassa ei tietueita, lisätään tartuntaluku')
        const oulutartunnat = new OuluTartunnat({
          oulutartunnat: oulutartunta,
          date: new Date()
        })

        oulutartunnat.save()
      } else {
        console.log(getMostRecentOuluTartunnat(data))
        const uusinOuluTartuntaTieto = getMostRecentOuluTartunnat(data)
        if (oulutartunta > uusinOuluTartuntaTieto.oulutartunnat) {
          console.log('tulokset päivittyneet')
          const oulutartunnat = new OuluTartunnat({
            oulutartunnat: oulutartunta,
            date: new Date()
          })
          console.log(oulutartunta)
          await oulutartunnat.save()
          tarkistaOuluTulokset()
        }

        else {
          console.log('tulokset ei muuttuneet')
        }
      }
    })


  })()
}
//haetaan THL rajapinnasta kumulatiivinen tartuntaluku
function haeTulokset() {
  const apiurl = 'https://sampo.thl.fi/pivot/prod/fi/epirapo/covid19case/fact_epirapo_covid19case.json?row=hcdmunicipality2020-445222&column=dateweek20200101-509030&filter=measure-444833'
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
      kokotulos = tulos.dataset.value
      tartuntaluku = kokotulos[Object.keys(kokotulos)[Object.keys(kokotulos).length - 1]]
    } catch (e) {
      console.log(e)
    }

    Tartunnat.find({}, async function (err, data) {
      if (err) {
        console.log(err)
      } else if (data.length === 0) {
        console.log('kannassa ei tietueita, lisätään tartuntaluku')
        const tartuntaluvut = new Tartunnat({
          tartunnat: tartuntaluku,
          date: new Date()
        })
        console.log(tartuntaluku)
        tartuntaluvut.save()
      } else {
        console.log(getMostRecentTartunnat(data))
        const uusinTartuntaTieto = getMostRecentTartunnat(data)
        if (tartuntaluku > uusinTartuntaTieto.tartunnat) {
          console.log('tulokset päivittyneet')
          const tartuntaluvut = new Tartunnat({
            tartunnat: tartuntaluku,
            date: new Date()
          })
          console.log(tartuntaluku)
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
  thlTulokset()
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
          let reply = ''
          bestBets.forEach(v => {
            reply = reply + v.name + ': ' + v.veikkaus + ' +/– ' + v.difference +'\n'

          })

          bot.telegram.sendMessage(config.lorocrewId, `${dateStr}\nUusia tartuntoja Suomessa: ${erotus}\n\nKokonaisstartuntojen tulokset päivälle:\n\n${reply}\n\n${bestBets[0].name} on voittaja ${bestBets[0].veikkaus} uudella tartunnalla Suomessa!\nOnneksi olkoon voittajalle!`)

        }
      })
      var d = new Date()
      var date = d.getDate()
      var month = d.getMonth() + 1
      var year = d.getFullYear()

      var dateStr = date + '.' + month + '.' + year

    }


  })}

  bot.command('otark', () => {
    tarkistaOuluTulokset()
  })

  function tarkistaOuluTulokset() {
    OuluTartunnat.find({}, function (err, data) {
      if (data.length <= 1) {
        console.log('tietueita 1 tai alle, ei voida vertailla')
      } else {
        const sorted = data.sort((a, b) => {
          return b.oulutartunnat - a.oulutartunnat
        })
        const erotus = sorted[0].oulutartunnat - sorted[1].oulutartunnat
  
        if (erotus === 0) {
          console.log('erotus nolla')
        }
  
        else {
          console.log('hulabaloo')
        }
  
  
        OuluVeikkaus.find({}, function (err, data) {
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
            let reply = ''
            bestBets.forEach(v => {
              reply = reply + v.name + ': ' + v.veikkaus + ' +/– ' + v.difference +'\n'
  
            })
  
            bot.telegram.sendMessage(config.lorocrewId, `${dateStr}\nUusia tartuntoja Oulussa: ${erotus}\n\nTulokset päivälle:\n\n${reply}\n\n${bestBets[0].name} on voittaja veikkaamalla Ouluun ${bestBets[0].veikkaus} uutta tartuntaa!\nOnneksi olkoon voittajalle!`)
  
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
  Veikkaus.find({ telegramId: id }, function (err, kayttaja) {
    if (err) {
      console.log(err)
    } else {

      //ctx.reply(veikkaukset[veikkaukset.length - 1])
      const v = getMostRecentVeikkaus(kayttaja[0])
      ctx.reply(`Veikkauksesi tälle päivälle on: ${v.veikkaus}`)
    }
  })
})

bot.command('veikkaukset', () => {
  veikkaukset()
})
bot.command('oulu', (ctx) => {
  (async () => {
    console.log('\nveikkauskutsu')

    const telegramId = ctx.from.id
    const first_name = ctx.from.first_name.toString()
    const msg = ctx.message.text.substring(6)
    const now = new Date()
    const tanaan = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const ouluuusiveikkaus = new OuluVeikkaus({
      telegramId: telegramId,
      name: first_name,
      veikkaukset: [{ veikkaus: msg, date: now }]
    })

    if (isNaN(msg) || ouluuusiveikkaus.veikkaukset[0].veikkaus === null || ouluuusiveikkaus.veikkaukset[0].veikkaus >= 10000 || ouluuusiveikkaus.veikkaukset[0].veikkaus < 0) {
      // validointi haara
      ctx.reply('Mita mita sina sanoa, onko pitsasasi jota vikana!?')
    }
    else {
      const filter = { telegramId: telegramId }
      if (await OuluVeikkaus.exists(filter)) { // telegramId löytyy kannasta
        console.log('vanha veikkaaja')
        let ouludoc = await OuluVeikkaus.findOne(filter)


        let uusin = new Date(1970)
        ouludoc.veikkaukset.forEach(veikkaus => {
          if (dayIsBefore(uusin, veikkaus.date)) {
            uusin = veikkaus.date
          }
        })

        console.log('uusin', uusin)
        console.log('tanaan', tanaan)
        console.log('uusin === tanaan', datesMatch(uusin, tanaan))
        if (datesMatch(uusin, tanaan)) {
          console.log('päivitetään käyttäjän tämänpäiväinen veikkaus')

          for (let i = 0; i < ouludoc.veikkaukset.length; i++) {
            if (datesMatch(ouludoc.veikkaukset[i].date, uusin)) {
              ouludoc.veikkaukset[i].date = now
              ouludoc.veikkaukset[i].veikkaus = msg
            }
          }
          ouludoc.save(function (err, ouludoc) {
            if (err) {
              return console.error(err)
            } else {
              ctx.reply(`${first_name}, olet jo veikannut Oulun tartuntoja tänään, joten veikkauksesi päivitetään: ${msg} uutta tartuntaa Oulussa.`)
            }
          })
        } else {
          console.log('lisätään käyttäjälle uusi veikkaus')
          const update = {
            name: first_name,
            veikkaukset: [...ouludoc.veikkaukset, { veikkaus: msg, date: now }]
          }
          await OuluVeikkaus.updateOne(filter, update)

          ouludoc.save(function (err, ouludoc) {
            if (err) {
              return console.error(err)
            } else {
              ctx.reply(`${first_name}, onnea Oulu-veikkaukseen! Osallistuit veikkaamalla ${msg} uutta tartuntaa.`)
            }
          })
        }
      }
      else {
        console.log('uusi veikkaaja')
        ouluuusiveikkaus.save(function (err, doc) {
          if (err) {
            return console.error(err)
          } else {
            ctx.reply(`${first_name}, onnea Oulu-veikkaukseen! Osallistuit veikkaamalla ${msg} uutta tartuntaa.`)
          }
        })
      }
    }
  })()
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

    if (isNaN(msg) || uusiveikkaus.veikkaukset[0].veikkaus === null || uusiveikkaus.veikkaukset[0].veikkaus >= 10000 || uusiveikkaus.veikkaukset[0].veikkaus < 0) {
      // validointi haara
      ctx.reply('Mita mita sina sanoa, onko pitsasasi jota vikana!?')
    }
    else {
      const filter = { telegramId: telegramId }
      if (await Veikkaus.exists(filter)) { // telegramId löytyy kannasta
        let doc = await Veikkaus.findOne(filter)


        let uusin = new Date(1970)
        doc.veikkaukset.forEach(veikkaus => {
          if (dayIsBefore(uusin, veikkaus.date)) {
            uusin = veikkaus.date
          }
        })

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
              ctx.reply(`${first_name}, olet jo veikannut tänään, joten veikkauksesi päivitetään: ${msg} uutta tartuntaa.`)
            }
          })
        } else {
          const update = {
            name: first_name,
            veikkaukset: [...doc.veikkaukset, { veikkaus: msg, date: now }]
          }
          await Veikkaus.updateOne(filter, update)

          doc.save(function (err, doc) {
            if (err) {
              return console.error(err)
            } else {
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
function getMostRecentOuluTartunnat(t) {
  return t.reduce((a, b) => (a.date > b.date ? a : b))
}


function getMostRecentVeikkaus(veikkaaja) {
  return veikkaaja.veikkaukset.reduce((a, b) => (a.date > b.date ? a : b))
}
bot.startPolling()
//botti käyntiin
