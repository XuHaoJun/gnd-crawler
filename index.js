var request = require('request-promise');
var encoding = require('encoding');
var cheerio = require('cheerio');
var fs = require('fs');
var opencc = require('node-opencc');
var BlueBirdQueue = require('bluebird-queue')
var Promise = require('bluebird');

var prefixURL = 'http://rs.qcplay.com/html/slime-datum/cn';
var path = {
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
  slimelist: '/slimelist'
}

let queue = new BlueBirdQueue({
  concurrency: 3,
  delay: 100
})

function getSlime(id) {
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
      return
    }
    let alignment = _dataRows[2].substr(4)
    let sclass = _dataRows[3].substr(4)
    let description = _dataRows[4]
    let mastery = _dataRows[7]
    let skill = {
      name: _dataRows[9],
      description: _dataRows[11]
    }
    let weapon = _dataRows[14]
    let medal = _dataRows[17]
    let fullstat = _dataRows[20]
    console.log(_dataRows)
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
    console.log(JSON.stringify(slime, null, 2))
  }).catch(error => {
    console.log('!!!!!!!!!!!!!!', id)
  }))
}

// let i for (i = 1; i <= 90; i++) {   queue.add(getSlime.bind(null, i)) }
queue.add(getSlime.bind(null, 1))
queue.add(getSlime.bind(null, 84))
queue.start()
