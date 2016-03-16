var path = require('path')

module.exports = setup
module.exports.consumes = ['ui', 'http', 'hooks']

function setup(plugin, imports, register) {
  var ui = imports.ui
    , hooks = imports.hooks
    , http = imports.http

  ui.registerModule(path.join(__dirname, 'client.js'))

  http.router.get('/', ui.bootstrapMiddleware())

  hooks.on('models:load', function*(models) {
    models.document.attributes['title'] = 'string'
    models.document.attributes['owner'] = {
      model: 'user'
    , via: 'owns'
    }
    models.document.attributes['readers'] = {
      collection: 'user'
    , via: 'reads'
    , dominant: true
    }
    models.document.attributes['writers'] = {
      collection: 'user'
    , via: 'writes'
    , dominant: true
    }
    models.user.attributes['owns'] = {
      collection: 'document'
    , via: 'owner'
    }
    models.user.attributes['reads'] = {
      collection: 'document'
    , via: 'readers'
    }
    models.user.attributes['writes'] = {
      collection: 'document'
    , via: 'writers'
    }
  })

  register()
}

