var pull = require('pull-stream')
var ssbKeys = require('ssb-keys')
var ref = require('ssb-ref')
var reconnect = require('pull-reconnect')

var config = require('./config')()
var createClient = require('ssb-client')
var createFeed   = require('ssb-feed')

var keys = require('./keys')

var CACHE = {}

var rec = reconnect(function (isConn) {
  function notify (value) {
    isConn(value)
  }

  createClient(keys, {
    manifest: require('./manifest.json'),
    remote: config.remote,
    caps: config.caps
  }, function (err, _sbot) {
    if(err)
      return notify(err)

    sbot = _sbot
    sbot.on('closed', function () {
      sbot = null
      notify(new Error('closed'))
    })

    notify()
  })
})

var internal = {
  getLatest: rec.async(function (id, cb) {
    sbot.getLatest(id, cb)
  }),
  add: rec.async(function (msg, cb) {
    sbot.add(msg, cb)
  })
}

var feed = createFeed(internal, keys, {remote: true})

module.exports = {
  createLogStream: rec.source(function (opts) {
    return pull(
      sbot.createLogStream(opts),
      pull.through(function (e) {
        CACHE[e.key] = CACHE[e.key] || e.value
      })
    )
  }),
  userStream: rec.source(function (config) {
    return pull(
      sbot.createUserStream(config),
      pull.through(function (e) {
        CACHE[e.key] = CACHE[e.key] || e.value
      })
    )
  }),
  backlinks: rec.source(function (query) {
    return sbot.backlinks.read(query)
  }),
  names: {
    get: rec.async(function (opts, cb) {
      sbot.names.get(opts, cb)
    }),
    getImages: rec.async(function (opts, cb) {
      sbot.names.getImages(opts, cb)
    }),
    getImageFor: rec.async(function (opts, cb) {
        return sbot.names.getImageFor(opts, cb)
      if(images[opts]) cb(null, images[opts])
      else
        sbot.names.getImageFor(opts, function (err, v) {
          if(err) cb(err)
          else cb(null, images[opts]= v)
        })
    }),
    getSignifier: rec.async(function (opts, cb) {
      sbot.names.getSignifier(opts, cb)
    }),
    getSignifies: rec.async(function (opts, cb) {
      sbot.names.getSignifies(opts, cb)
    })
  },
  friends: {
    get: rec.async(function (opts, cb) {
      sbot.friends.get(opts, cb)
    })
  },
  query: rec.source(function (query) {
    return sbot.query.read(query)
  }),
  get: rec.async(function (key, cb) {
    if('function' !== typeof cb)
      throw new Error('cb must be function')
    if(CACHE[key]) cb(null, CACHE[key])
    else sbot.get(key, function (err, value) {
      if(err) return cb(err)
      cb(null, CACHE[key] = value)
    })
  }),
  links: rec.source(function (query) {
    return sbot.links(query)
  }),
  addblob: rec.sink(function (cb)  {
    return sbot.blobs.add(cb)
  }),
  publish: rec.async(function (content, cb) {
    if(content.recps)
      content = ssbKeys.box(content, content.recps.map(function (e) {
        return ref.isFeed(e) ? e : e.link
      }))
    else if(content.mentions)
      content.mentions.forEach(function (mention) {
        if(ref.isBlob(mention.link)) {
          sbot.blobs.push(mention.link, function (err) {
            if(err) console.error(err)
          })
        }
      })
    feed.add(content, function (err, msg) {
      if(err) console.error(err)
      else if(!cb) console.log(msg)
      cb && cb(err, msg)
    })
  })

}

