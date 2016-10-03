const _ = require('lodash')
const request = require('request-promise')
const encoding = require('encoding')
const cheerio = require('cheerio')
const fs = require('fs')
const opencc = require('node-opencc')
const BlueBirdQueue = require('bluebird-queue')
const Promise = require('bluebird')

const prefixURL = 'http://rs.qcplay.com/html/slime-datum/cn'
const path = {
  root: '/index_cn.htm',
  camps: {
    a: '/camp_a_cn.htm',
    k: '/camp_k_cn.htm',
    s: '/camp_s_cn.htm',
    y: '/camp_y_cn.htm'
  },
  titles: {
    ven: '/title/ven.htm',
    mel: '/title/mel.htm',
    mag: '/title/mag.htm'
  },
  slimelist: '/slimelist',
  spells: {
    earth: '/spells/sp_earth.htm',
    fire: '/spells/sp_fire.htm',
    light: '/spells/sp_light.htm',
    water: '/spells/sp_water.htm',
    air: '/spells/sp_air.htm',
    dark: '/spells/sp_dark.htm',
    special: '/spells/sp_special.htm'
  },
  potions: {
    1: '/potion/potion_1.htm',
    2: '/potion/potion_2.htm',
    3: '/potion/potion_3.htm',
    4: '/potion/potion_4.htm'
  },
  stealList: '/steal_list.htm'
}

function getSlimes() {
  let queue = new BlueBirdQueue({concurrency: 3, delay: 100})
  function getSlimeTask(id) {
    return (request({
      uri: prefixURL + path.slimelist + '/' + id + '.htm',
      encoding: null,
      transform: body => {
        return encoding
          .convert(body, 'UTF-8', 'GB18030')
          .toString()
      }
    }).then(opencc.simplifiedToTraditional).then(body => {
      return cheerio.load(body)
    }).then($ => {
      let slime
      let name = $('title').text()
      let initStars = $('#table4')
        .find('img')
        .length - 1
      let _dataRows = $('#table4')
        .text()
        .replace(/^\s*[\r\n]/gm, "\n")
        .replace(/(\t|\r)/gm, '')
        .split('\n')
      if (_dataRows.length != 22) {
        console.log('!!!!!!!!!!!!!!', id, name)
        return
      }
      let alignment = _dataRows[2].substr(4)
      let sclass = _dataRows[3].substr(4)
      let description = _dataRows[4]
      let mastery = _dataRows[7]
      let skill = {
        name: _dataRows[9].slice(1, -1),
        description: _dataRows[11]
      }
      let _weaponRow = _dataRows[14]
      let _weapon2eng = function(str) {
        if (str == '攻擊' || str == '火力') {
          return 'atk'
        } else if (str == '魔力') {
          return 'matk'
        } else if (str == '幸運') {
          return 'luk'
        } else if (str == '裝甲') {
          return 'def'
        }
        return ''
      }
      let weapon = {}
      let _weaponeng = _weapon2eng(_weaponRow.substr(0, 2))
      let matkStrStart
      if (_weaponeng != '') {
        matkStrStart = _weaponRow.search(/魔力/)
        weapon[_weaponeng] = _weaponRow.substr(0, matkStrStart)
      } else {
        console.log('error', id, name, _weaponeng)
        return
      }
      let matkStrEnd = _weaponRow
        .substr(matkStrStart + 3)
        .search(/：/) + 1
      weapon['matk'] = _weaponRow.substr(matkStrStart, matkStrEnd)
      _weaponeng = _weapon2eng(_weaponRow.substr(matkStrStart + matkStrEnd, 2))
      weapon['airship'] = {}
      weapon['airship'][_weaponeng] = _weaponRow.substr(matkStrStart + matkStrEnd)
      let medal = {}
      let _medalRow = _dataRows[17]
      let _medalFourStart = _medalRow.search(/4階/)
      let _medalFiveStart = _medalRow.search(/5階/)
      medal['1-3'] = _medalRow.substring(0, _medalFourStart)
      medal['4'] = _medalRow.substring(_medalFourStart, _medalFiveStart)
      medal['5'] = _medalRow.substring(_medalFiveStart)
      let fullstat = {}
      let _fullstatRow = _dataRows[20]
      let _fullstatAirshipStart = _fullstatRow.search(/【飛艇】/)
      fullstat['dungeon'] = _fullstatRow.substring(0, _fullstatAirshipStart)
      fullstat['airship'] = _fullstatRow.substring(_fullstatAirshipStart)
      // console.log(_dataRows)
      slime = {
        id,
        name,
        initStars,
        alignment,
        sclass,
        description,
        mastery,
        skill,
        weapon,
        medal,
        fullstat
      }
      return slime
      // console.log(JSON.stringify(slime, null, 2))
    }).catch(error => {
      console.log('!!!!!!!!!!!!!!', id, error)
    }))
  }
  let i;
  for (i = 1; i <= 90; i++) {
    if (i == 84 || i == 85 || i == 86) {
      continue
    }
    queue.add(getSlimeTask.bind(null, i))
  }
  // queue.add(getSlimeTask.bind(null, 54)) queue.add(getSlimeTask.bind(null, 80))
  return (queue.start().then(result => {
    fs.writeFileSync('./data/slimes.json', JSON.stringify(result, null, 2))
  }))
}

function getSlimesImage() {
  const prefixImageURL = "http://rs.qcplay.com/html/slime-datum/images/hero/"
  let queue = new BlueBirdQueue({concurrency: 3, delay: 100})
  function getSlimeImageTask(id) {
    const rq = require('request')
    const uri = prefixImageURL + id + '.png'
    const filepath = './data/image/slimes/' + id + '.png'
    return new Promise((resolve, reject) => {
      rq.head(uri, (err, res, body) => {
        if (err) {
          reject(err)
        }
        rq(uri)
          .pipe(fs.createWriteStream(filepath))
          .on('close', resolve);
      })
    })
  }
  let i;
  for (i = 1; i <= 90; i++) {
    if (i == 84 || i == 85 || i == 86) {
      continue
    }
    queue.add(getSlimeImageTask.bind(null, i))
  }
  return queue.start()
}

function getPotions() {
  let queue = new BlueBirdQueue({concurrency: 3, delay: 100})
  let potions = []
  function getPotionsByTier(tier) {
    let uri = prefixURL + '/potion/potion_' + tier + '.htm'
    return (request({
      uri: uri,
      encoding: null,
      transform: body => {
        return encoding
          .convert(body, 'UTF-8', 'GB18030')
          .toString()
      }
    }).then(opencc.simplifiedToTraditional).then(body => {
      return cheerio.load(body)
    }).then($ => {
      // #table2 > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody >
      // tr:nth-child(1) > td:nth-child(1) > span:nth-child(2)
      // console.log($('#table2').text()) console.log($('#table2>tbody').text())
      // console.log($('table').find('td').html())
      let _dataRows = $('#table2')
        .text()
        .replace(/[\s\t\r]+岡布奧/g, '岡布奧')
        .replace(/（[\s\t\r]+/g, '（')
        .replace(/^\s*[\t\r]/gm, "\n")
        .replace(/[\t\r]/gm, '')
        .split('\n')
      let _imgDataRows = $('#table2').find('img')
      let imgPaths = []
      _imgDataRows.each((index, elem) => {
        imgPaths.push($(elem).attr('src'))
      })
      let ids = []
      let idRegexp = /..\/..\/images\/potion\/(\d+)\.png/
      _.each(imgPaths, (p, i) => {
        let match = idRegexp.exec(p)
        let id = parseInt(match[1])
        ids.push(id)
      })
      _dataRows = _.drop(_dataRows)
      _dataRows = _.dropRight(_dataRows)
      _.each(ids, (id, index) => {
        const rq = require('request')
        const prefixImageURL = 'http://rs.qcplay.com/html/slime-datum/images/potion/'
        const uri = prefixImageURL + id + '.png'
        const filepath = './data/image/potions/' + id + '.png'
        rq.head(uri, (err, res, body) => {
          if (err) {
          }
          rq(uri)
          .pipe(fs.createWriteStream(filepath))
          .on('close', ()=>{});
        })
        let potion = {id}
        let name = _dataRows[index * 3]
        let tier = _dataRows[index * 3 + 1]
        let effect = _dataRows[index * 3 + 2]
        potion['name'] = name.substring(4)
        potion['tier'] = tier.substring(4)
        potion['effect'] = effect.substring(4)
        potions.push(potion)
      })
    }))
  }
  queue.add(getPotionsByTier(1))
  queue.add(getPotionsByTier(2))
  queue.add(getPotionsByTier(3))
  queue.add(getPotionsByTier(4))
  queue.start().then(()=> {
    fs.writeFileSync('./data/potions.json', JSON.stringify(potions, null, 2))
  })
}

// getSlimes().then(() => {   return getSlimesImage() }) getSlimesImage()
// getPotions()
