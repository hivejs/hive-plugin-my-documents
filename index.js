/** 
 * hive.js 
 * Copyright (C) 2013-2016 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License version 2
 * as published by the Mozilla Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the Mozilla Public License
 * along with this program.  If not, see <https://www.mozilla.org/en-US/MPL/2.0/>.
 */
var path = require('path')

module.exports = setup
module.exports.consumes = ['ui', 'http', 'hooks', 'auth', 'orm']

function setup(plugin, imports, register) {
  var ui = imports.ui
    , hooks = imports.hooks
    , http = imports.http
    , auth = imports.auth
    , orm = imports.orm

  ui.registerModule(path.join(__dirname, 'client.js'))
  ui.registerStylesheet(path.join(__dirname, 'index.css'))

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

  auth.registerAuthorizationProvider(function*(user, action, data) {
    switch(action) {
    case 'document:read':
      var doc = yield orm.collections.document.findOne({id: data.id}).populate('readers')
      if (doc.settings && doc.settings['myDocuments:publicAccess'] > 0) return true
      if (user.id === doc.owner) return true
      return doc.readers.some(reader => reader.id === user.id)
    case 'document:change':
      var doc = yield orm.collections.document.findOne({id: data.id}).populate('writers')
      if (doc.settings && doc.settings['myDocuments:publicAccess'] > 1) return true
      if (user.id === doc.owner) return true
      return doc.writers.some(writer => writer.id === user.id)
    case 'document:write':
      var doc = yield orm.collections.document.findOne({id: data.id})
      return user.id === doc.owner
    default:
      return null
    }
  })

  register()
}

