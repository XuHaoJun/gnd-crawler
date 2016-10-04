const Promise = require('bluebird')
const _ = require('lodash')
const request = require('request-promise')
const encoding = require('encoding')
const cheerio = require('cheerio')
const fs = Promise.promisifyAll(require('fs'))
const opencc = require('node-opencc')
const BlueBirdQueue = require('bluebird-queue')

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
    dark: '/spells/sp_dark.htm'
    // special: '/spells/sp_special.htm'
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
      console.log(slime.id, slime.name)
      return slime
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
  return (queue.start().then(result => {
    result.sort((a, b) => {
      return a.id - b.id
    })
    return fs.writeFileAsync('./data/slimes.json', JSON.stringify(result, null, 2))
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
          if (err) {}
          rq(uri)
            .pipe(fs.createWriteStream(filepath))
            .on('close', () => {});
        })
        let potion = {
          id
        }
        let name = _dataRows[index * 3]
        let tier = _dataRows[index * 3 + 1]
        let effect = _dataRows[index * 3 + 2]
        potion['name'] = name.substring(4)
        potion['tier'] = tier.substring(4)
        potion['effect'] = effect.substring(4)
        console.log(potion.id, potion.name)
        potions.push(potion)
      })
    }))
  }
  queue.add(getPotionsByTier.bind(null, 1))
  queue.add(getPotionsByTier.bind(null, 2))
  queue.add(getPotionsByTier.bind(null, 3))
  queue.add(getPotionsByTier.bind(null, 4))
  return (queue.start().then(() => {
    potions.sort((a, b) => {
      return a.id - b.id
    })
    return fs.writeFileAsync('./data/potions.json', JSON.stringify(potions, null, 2))
  }))
}

function getSpells() {
  let queue = new BlueBirdQueue({concurrency: 3, delay: 100})
  let spells = []
  function getSpellsByType(type) {
    let uri = prefixURL + '/spells/sp_' + type + '.htm'
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
      let _dataRows = $('#table2')
        .text()
        .replace(/^\s*[\t\r]/gm, "\n")
        .replace(/[\t\r]/gm, '')
        .split('\n')
      let i = 0
      for (i = 0; i < _dataRows.length; i++) {
        if (_dataRows[i] == '【名稱】地震術') {
          _dataRows.splice(i + 4, 0, '【強化】重裝卡車岡布奧')
          break
        }
      }
      let _imgDataRows = $('#table2').find('img')
      let imgPaths = []
      _imgDataRows.each((index, elem) => {
        imgPaths.push($(elem).attr('src'))
      })
      let ids = []
      let idRegexp = /..\/..\/images\/spell\/(\d+)\.png/
      _.each(imgPaths, (p, i) => {
        let match = idRegexp.exec(p)
        if (match) {
          let id = parseInt(match[1])
          ids.push(id)
          const rq = require('request')
          const prefixImageURL = 'http://rs.qcplay.com/html/slime-datum/images/spell/'
          const uri = prefixImageURL + id + '.png'
          const filepath = './data/image/spells/' + id + '.png'
          rq.head(uri, (err, res, body) => {
            if (err) {}
            rq(uri)
              .pipe(fs.createWriteStream(filepath))
              .on('close', () => {});
          })
        }
      })
      _dataRows = _.drop(_dataRows)
      _dataRows = _.dropRight(_dataRows)
      _.each(ids, (id, index) => {
        let spell = {
          id,
          type
        }
        let name = _dataRows[index * 5]
        let consumeMp = parseInt(_dataRows[index * 5 + 1].substring(1))
        let tier = _dataRows[index * 5 + 2]
        let description = _dataRows[index * 5 + 3]
        let buff = _dataRows[index * 5 + 4]
        spell['name'] = name.substring(4)
        spell['consumeMp'] = consumeMp
        spell['tier'] = tier.substring(4)
        spell['description'] = description.substring(4)
        spell['buff'] = buff.substring(4)
        console.log(spell.id, spell.name)
        spells.push(spell)
      })
    }))
  }
  _.each(path.spells, (v, type) => {
    queue.add(getSpellsByType.bind(null, type))
  })
  return queue
    .start()
    .then(() => {
      spells.sort((a, b) => {
        return a.id - b.id
      })
      const outputPath = './data/spells.json'
      return fs.writeFileAsync(outputPath, JSON.stringify(spells, null, 2))
    })
}

function getTitles() {
  let queue = new BlueBirdQueue({concurrency: 3, delay: 100})
  let titles = []
  function getTitlesByName(name) {
    let uri = prefixURL + '/title/' + name + '.htm'
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
      let _dataRows = $('script')
        .text()
        .replace(/[\t\r]+/gm, '')
        .split('\n')
      _tmpDataRows = _dataRows
      _dataRows = []
      const rowRegexp = /^Array/
      const joinRegexp = /^"<br/
      _.each(_tmpDataRows, (row, i) => {
        if (rowRegexp.test(row)) {
          if (i + 1 < _tmpDataRows.length) {
            let nextRow = _tmpDataRows[i + 1]
            if (joinRegexp.test(nextRow)) {
              row = row + nextRow
            }
          }
          _dataRows.push(row)
        }
      })
      _.each(_dataRows, (row, i) => {})
      // {name: '尋寶者', buffs: ['每層偵測3/4/5個敵人的初始位置', '攻擊+1/2/3']}
      console.log(_dataRows)
    }))
  }
  getTitlesByName('ven')
}

function getArtifacts() {
  let queue = new BlueBirdQueue({concurrency: 3, delay: 100})
  let artifacts = []
  function getArtifactsByType(type) {
    let uri = prefixURL + '/artifact/art_' + type + '.htm'
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
      let _dataRows = $('table')
        .text()
        .replace(/[\t\r]+/gm, '')
        .replace(/^\s*[\r\n]/gm, '')
        .replace(/基礎屬性：[\s\t\r]/gm, '基礎屬性：')
        .split('\n')
      _dataRows = _dataRows.slice(2, -6)
      let _imgDataRows = $('span>img')
      let imgPaths = []
      _imgDataRows.each((index, elem) => {
        const imgPath = $(elem).attr('src')
        imgPaths.push(imgPath)
      })
      let ids = []
      let idRegexp = /..\/..\/images\/artifact\/(\d+)\.png/
      _.each(imgPaths, (p, i) => {
        let match = idRegexp.exec(p)
        if (match) {
          let id = parseInt(match[1])
          ids.push(id)
        }
      })
      _.each(ids, (id, index) => {
        let artifact = {
          id
        }
        let name = _dataRows[index * 16]
        let sclass = _dataRows[index * 16 + 1]
        let eqType = _dataRows[index * 16 + 2]
        let initAttr = _dataRows[index * 16 + 3]
        let enhance = {}
        enhance[1] = _dataRows[index * 16 + 5]
        enhance[2] = _dataRows[index * 16 + 7]
        enhance[3] = _dataRows[index * 16 + 9]
        enhance[4] = _dataRows[index * 16 + 11]
        enhance[5] = _dataRows[index * 16 + 13]
        enhance[6] = _dataRows[index * 16 + 15]
        artifact['name'] = name.substring(4)
        artifact['sclass'] = sclass.substr(4)
        artifact['eqType'] = eqType.substr(4)
        artifact['initAttr'] = initAttr.substr(5)
        artifact['enhance'] = enhance
        console.log(id, artifact['name'])
        artifacts.push(artifact)
      })
      function getArtifactImages(_ids) {
        _.each(_ids, (id) => {
          const rq = require('request')
          const prefixImageURL = 'http://rs.qcplay.com/html/slime-datum/images/artifact/'
          const uri = prefixImageURL + id + '.png'
          const filepath = './data/image/artifacts/' + id + '.png'
          rq.head(uri, (err, res, body) => {
            if (err) {
              console.log(err)
              return
            }
            rq(uri)
              .pipe(fs.createWriteStream(filepath))
              .on('close', () => {});
          })
        })
      }
      getArtifactImages(ids)
      // console.log(JSON.stringify(_dataRows, null, 2))
    }))
  }
  _.each([
    'ven', 'mel', 'mag'
  ], (type) => {
    queue.add(getArtifactsByType.bind(null, type))
  })
  return queue
    .start()
    .then(() => {
      artifacts.sort((a, b) => {
        return a.id - b.id
      })
      return fs.writeFileAsync('./data/artifacts.json', JSON.stringify(artifacts, null, 2))
    })
}

function getIconImages() {
  const starImageURL = 'http://rs.qcplay.com/html/slime-datum/images/icon/star.png'
  const mpImageURL = 'http://rs.qcplay.com/html/slime-datum/images/icon/mp.png'
  function _getIconImages(filepath, uri) {
    const rq = require('request')
    return new Promise((resolve, reject) => {
      rq.head(uri, (err, res, body) => {
        if (err) {
          reject(err)
        }
        rq(uri)
          .pipe(fs.createWriteStream(filepath))
          .on('close', resolve)
      })
    })
  }
  let ps = [
    _getIconImages('./data/image/icons/star.png', starImageURL),
    _getIconImages('./data/image/icons/mp.png', mpImageURL)
  ]
  return Promise.all(ps)
}

function createDirs() {
  return fs
    .mkdirAsync('./data')
    .then(() => {
      return fs.mkdirAsync('./data/image')
    })
    .then(() => {
      return Promise.all([
        fs.mkdirAsync('./data/image/icons'),
        fs.mkdirAsync('./data/image/spells'),
        fs.mkdirAsync('./data/image/slimes'),
        fs.mkdirAsync('./data/image/potions'),
        fs.mkdirAsync('./data/image/artifacts')
      ])
    })
    .catch(err => {
      if (err.code == 'EEXIST') {
        return
      } else {
        return Promise.reject(err)
      }
    })
}

function getAll() {
  return getSlimes()
    .then(getSlimesImage)
    .then(getPotions)
    .then(getSpells)
    .then(getArtifacts)
    .then(getIconImages)
}

function init() {
  // createDirs()
  getArtifacts()
}

init()
