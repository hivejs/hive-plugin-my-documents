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
var redux = require('redux')
  , vdom = require('virtual-dom')
  , h = vdom.h

const ACTIVATE = 'MYDOCUMENTS_ACTIVATE'
const DEACTIVATE = 'MYDOCUMENTS_DEACTIVATE'
const FETCH_OWNS = 'MYDOCUMENTS_FETCH_OWNS'
const FETCH_READS = 'MYDOCUMENTS_FETCH_READS'
const FETCH_WRITES = 'MYDOCUMENTS_FETCH_WRITES'
const DOCUMENT_CREATE = 'MYDOCUMENTS_DOCUMENT_CREATE'
const LOAD = 'MYDOCUMENTS_LOAD'
const NEWDOCUMENT_RESET = 'MYDOCUMENTS_NEWDOCUMENT_RESET'
const NEWDOCUMENT_ALLOWUSER = 'MYDOCUMENTS_NEWDOCUMENT_ALLOWUSER'
const NEWDOCUMENT_ALLOWPUBLIC = 'MYDOCUMENTS_NEWDOCUMENT_ALLOWPUBLIC'
const NEWDOCUMENT_REMOVECOLLAB = 'MYDOCUMENTS_NEWDOCUMENT_REMOVECOLLAB'
const CHOOSEUSER_SEARCH = 'MYDOCUMENTS_CHOOSEUSER_SEARCH'
const USERS_LOAD = 'MYDOCUMENTS_USERS_LOAD'
const USER_SEARCH = 'MYDOCUMENTS_USER_SEARCH'

function checkStatus(response) {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText)
    error.response = response
    throw error
  }
}

module.exports = setup
module.exports.consumes = ['ui', 'session']
module.exports.provides = []
function setup(plugin, imports, register) {
  var ui = imports.ui
    , session = imports.session

  const middleware = (store) => (next) => (action) => {
    const state = store.getState().myDocuments
    // check for route exits first, since we might match a different route
    // of this component
    if(ui.exitRoute(store, action, '/')) {
      store.dispatch(myDocuments.action_deactivate())
    }
    if(ui.exitRoute(store, action, '/documents/new')) {
      store.dispatch(myDocuments.action_deactivate())
    }
    if(ui.route(action, '/')) {
      session.onceLoggedIn(() => {
        store.dispatch(myDocuments.action_activate())
        store.dispatch(myDocuments.overview.action_load(store.getState().session.user.id))
      })
    }
    if(ui.route(action, '/documents/new')) {
      session.onceLoggedIn(() => {
        store.dispatch(myDocuments.action_activate('new'))
        setTimeout(() => store.dispatch({type: 'EDITOR_DEACTIVATE'}), 100)
      })
    }
    if (NEWDOCUMENT_ALLOWUSER === action.type) {
      const userId = action.payload.user
      if (!state.users[userId]) {
        store.dispatch(myDocuments.users.action_load(userId))// Note: We don't wait for load to finish!
      }
    }
    switch(action.type) {
      case DOCUMENT_CREATE:
        return fetch(ui.baseURL+'/api/v1/documents/',{
            headers: {
              Authorization: 'token '+store.getState().session.grant.access_token
            , 'Content-type': 'application/vnd.api+json'
            }
          , method: 'post'
          , body: JSON.stringify({data:{
              type: 'document'
            , attributes: {
                ...action.payload
              , settings: {
                  'myDocuments:publicAccess': state.newDocument.publicAccess
                }
              }
            , relationships: {
                owner: {data:{type: 'user', id: store.getState().session.user.id}}
              , readers: {data: Object.keys(state.newDocument.collaborators)
                         .filter(userId => state.newDocument.collaborators[userId] === 1)
                         .map(userId => {return {type: 'user', id: userId}})
                         }
              , writers: {data: Object.keys(state.newDocument.collaborators)
                         .filter(userId => state.newDocument.collaborators[userId] === 2)
                         .map(userId => {return {type: 'user', id: userId}})
                         }
              }
            }})
          })
          .then(checkStatus)
          .then((response) => response.json())
          .then((json) => json.data)
      case FETCH_OWNS:
        return fetch(ui.baseURL+'/api/v1/users/'+action.payload+'/relationships/owns',{
            headers: {Authorization: 'token '+store.getState().session.grant.access_token}
          })
          .then(checkStatus)
          .then((response) => response.json())
          .then((json) => json.data)
      case FETCH_READS:
        return fetch(ui.baseURL+'/api/v1/users/'+action.payload+'/relationships/reads',{
            headers: {Authorization: 'token '+store.getState().session.grant.access_token}
          })
          .then(checkStatus)
          .then((response) => response.json())
          .then((json) => json.data)
      case FETCH_WRITES:
        return fetch(ui.baseURL+'/api/v1/users/'+action.payload+'/relationships/writes',{
            headers: {Authorization: 'token '+store.getState().session.grant.access_token}
          })
          .then(checkStatus)
          .then((response) => response.json())
          .then((json) => json.data)
      default:
        return next(action)
    }
  }
  ui.reduxMiddleware.push(middleware)

  ui.reduxReducerMap['myDocuments'] = redux.combineReducers({
    main: function(state, action) {
      if(!state) {
        return {
          active: false
        }
      }
      if(ACTIVATE === action.type) {
        return {
          ...state
        , active: action.payload || true
        }
      }
      if(DEACTIVATE === action.type) {
        return {
          ...state
        , active: false
        }
      }
      return state
    }
  , overview: function(state, action) {
      if(!state) {
        return {
          owns: null // `null` means loading. `[]` means nothing there
        , reads: [] // these won't be displayed either way
        , writes: []
        }
      }
      if(LOAD === action.type) {
        return {
          ...state
        , ...action.payload
        }
      }
      return state
    }
  , newDocument: function(state, action) {
      if(!state || NEWDOCUMENT_RESET === action.type) {
        return {
          publicAccess: 0
        , collaborators: {}
        }
      }
      if(NEWDOCUMENT_ALLOWUSER === action.type) {
        const userId = action.payload.user
        return {
          ...state
        , collaborators: {
            ...state.collaborators
          , [userId]: action.payload.accessLevel
          }
        }
      }
      if(NEWDOCUMENT_ALLOWPUBLIC === action.type) {
        return {
          ...state
        , publicAccess: action.payload
        }
      }
      if(NEWDOCUMENT_REMOVECOLLAB === action.type) {
        const userId = action.payload
        return {
          ...state
        , collaborators: {
            ...state.collaborators
          , [userId]: null
          }
        }
      }
      return state
    }
  , users: function(state, action) {
      if (!state) {
        return {}
      }
      if (USERS_LOAD === action.type) {
        const user = action.payload
        return {
          ...state
        , [user.id]: user
        }
      }
      return state
    }
  })

  var myDocuments = {
    action_activate: function(part) {
      return {type: ACTIVATE, payload:part}
    }
  , action_deactivate: function() {
      return {type: DEACTIVATE}
    }
  , overview: {
      action_loadOwns: function*(userId) {
        var owns = yield {type: FETCH_OWNS, payload: userId}
        return yield owns.map((doc) => ({type: 'API_DOCUMENT_GET', payload: doc.id}))
      }
    , action_loadReads: function*(userId) {
        var owns = yield {type: FETCH_READS, payload: userId}
        return yield owns.map((doc) => ({type: 'API_DOCUMENT_GET', payload: doc.id}))
      }
    , action_loadWrites: function*(userId) {
        var owns = yield {type: FETCH_WRITES, payload: userId}
        return yield owns.map((doc) => ({type: 'API_DOCUMENT_GET', payload: doc.id}))
      }
    , action_load: function*(userId) {
        yield {type: LOAD, payload: {
          owns: yield this.action_loadOwns(userId)
        , reads: yield this.action_loadReads(userId)
        , writes: yield this.action_loadWrites(userId)
        }}
      }
    }
  , newDocument: {
      action_allowUser: function*(id, accessLevel) {
        return yield {type: NEWDOCUMENT_ALLOWUSER, payload: {user: id, accessLevel}}
      }
    , action_allowPublic: function*(accessLevel) {
        return yield {type: NEWDOCUMENT_ALLOWPUBLIC, payload: accessLevel}
      }
    , action_removeCollaborator: function(userId) {
        return {type: NEWDOCUMENT_REMOVECOLLAB, payload: userId}
      }
    , action_create: function*(attrs) {
        var doc = yield {type: DOCUMENT_CREATE, payload: attrs}
        return yield ui.action_route('/documents/'+doc.id)
      }
  }
  , users: {
    action_load: function*(userId) {
      const user = yield {type: 'API_USER_GET', payload: userId}
      return yield {type: USERS_LOAD, payload: user}
    }
  }
  , action_chooseUserSearch: function*(searchString) {
      yield { type: CHOOSEUSER_SEARCH
            , payload: yield {type: USER_SEARCH, payload: searchString}
            }
    }
  }

  ui.onRenderNavbarLeft((store, children) => {
    if(store.getState().session.user) children.push(renderMenu(store))
  })

  ui.onRenderBody((store, children, props) => {
    const state = store.getState()
    if(state.myDocuments.main.active) {
      if(state.myDocuments.main.active == 'new') children.push(renderNewDocument(store))
      else children.push(render(store))
    }
    // This is for the settings
    if(state.editor.document && state.editor.document.relationships.owner.data.id == state.session.user.id) {
      props.className = (props.className? props.className+' ' : '') + 'is-owner'
    }
  })

  function renderMenu(store) {
    const state = store.getState().myDocuments
    return h('li'+(state.main.active?'.active':''), h('a', {
      href: 'javascript:void(0)'
    , 'ev-click': evt => ui.store.dispatch(ui.action_route('/'))
    }, [h('i.glyphicon.glyphicon-briefcase'), ' My Documents']))
  }

  function render(store) {
    const state = store.getState().myDocuments.overview
    var children = [
      h('h1', 'My Documents')
    , h('h3', 'Your own documents')
    ]
    if(!state.owns) {
      children.push(
        h('p', 'Loading...')
      )
    }else if(!state.owns.length) {
      children.push(
        h('p', 'You don\'t have any documents.')
      )
    }else {
      children.push(
        h('ul.list-group', state.owns.map((document) =>
          h('li.list-group-item', h('a',{
            href: 'javascript:void(0)'
          , 'ev-click': (evt) => store.dispatch(ui.action_route('/documents/'+document.id))
          }, document.attributes.title))
        ))
      )
    }

    if(state.writes.length || state.reads.length) {
      children.push(
        h('h3', 'Documents by others')
      )
      
      children.push(
        h('ul.list-group', state.writes.map((document) =>
          h('li.list-group-item', h('a',{
            href: 'javascript:void(0)'
          , 'ev-click': (evt) => store.dispatch(ui.action_route('/documents/'+document.id))
          }, document.attributes.title))
        ).concat(
          state.reads.map((document) =>
            h('li.list-group-item', [
              h('a',{
                href: 'javascript:void(0)'
              , 'ev-click': (evt) => store.dispatch(ui.action_route('/documents/'+document.id))
              }, document.attributes.title)
            , h('i.glyphicon.glyphicon-lock', {title: 'read-only'})
            , h('span.sr-only', '(read-only)')
            ])
          )
        ))
      )
    }

    children.push(
      h('p', h('button.btn.btn-default',{
        'ev-click': (evt) => store.dispatch(ui.action_route('/documents/new'))
      }, [h('i.glyphicon.glyphicon-plus'), 'New document']))
    )

    return h('div.container', children)
  }

  function renderNewDocument(store) {
    const state = store.getState().myDocuments.newDocument
    var title
      , type
    return h('div.container.MyDocuments__NewDocument', [
      h('h2', 'Create a new document')
    , h('p', h('label',[
        'Title'
      , title = new Widget(h('input[type=text].form-control'), () => title.node.focus())
      ]))
    , h('p', h('label',[
        'Type'
      , type = new Widget(h('select.form-control', ui.config['ot:types'].map((type) =>
          h('option', {value: type}, type)
        )))
      ]))
  , h('div.MyDocuments__NewDocument__access', [
      h('h3', [h('i.glyphicon.glyphicon-user'), ' Collaborators'])
    , h('div.MyDocuments__NewDocument__collaborators'
      , vdomTableWithHeaderAndFallback(    
          h('div.MyDocuments__User.hidden-xs',[
            h('span.MyDocuments__User__name')
          , h('label', [ h('i.glyphicon.glyphicon-eye-open', {title: 'read-only access'}), h('span.sr-only','read-only access')])
          , h('label', [ h('i.glyphicon.glyphicon-pencil', {title: 'full write access'}), h('span.sr-only', 'full write access')])
          ])
        , Object.keys(state.collaborators)
          .filter(userId => !!state.collaborators[userId])
          .map((userId) => renderUser(store, userId, state.collaborators[userId]))
        , 'No collaborators added, yet.'
        )
      )
    , renderChooseUser(store, (er, userId) => {
        store.dispatch(myDocuments.newDocument.action_allowUser(userId, 1/*(read-only)*/))
      })
    , h('h3', [h('i.glyphicon.glyphicon-globe'), ' Public access'])
    , h('p', [
        'Any user not mentioned above has'
      , Choice('public-access', {
          0: [h('i.glyphicon.glyphicon-lock'), ' no access']
        , 1: [h('i.glyphicon.glyphicon-eye-open'), ' read-only access']
        , 2: [h('i.glyphicon.glyphicon-pencil'), ' full write access']
        }, state.publicAccess, (er, access) => store.dispatch(myDocuments.newDocument.action_allowPublic(access)))
      ])
    ]) 
    , h('p', h('button.btn.btn-success',{
        'ev-click': (evt) => store.dispatch(myDocuments.newDocument.action_create({
          title: title.node.value
        , type: type.node.value
        }))
      }, 'Create document'))
    ])
  }

  function renderUser(store, userId, access) {
    const user = store.getState().myDocuments.users[userId]
    return h('div.MyDocuments__User.form-inline', [
      h('span.MyDocuments__User__name', user? user.attributes.name : 'Loading...')
    , h('span.form-group.pull-right', h('button.close', {
        'aria-label': "Remove user"
      , 'ev-click': (evt) => store.dispatch(myDocuments.newDocument.action_removeCollaborator(userId))
      }
      , h('span', {'aria-hidden':"true"}, h('i.glyphicon.glyphicon-remove')))
      )
    , Choice('access-user-'+userId, {
        1: [NBSP() // This is kind of a table, so we only need the buttons here
           , h('span.visible-xs-inline', 'read-only access')
           , h('span.sr-only', 'read-only access')]
      , 2: [NBSP()
           , h('span.visible-xs-inline', 'full write access')
           , h('span.sr-only', 'full write access')]
      }, access, (er, access) => store.dispatch(myDocuments.newDocument.action_allowUser(userId, access)))
    ])
  }
  function renderChooseUser(store, cb) {
    const state = store.getState().myDocuments
    var username
    return h('div.MyDocuments__ChooseUser.form-inline',[
      h('div.form-group', username = new Widget(h('input[type=text].form-control',{
        placeholder: 'Enter a user name'
      //, 'ev-keyup': (evt) => store.dispatch(myDocuments.action_chooseUserSearch(evt.currentTarget.value))
      })))
    , /*h('div.MyDocuments__ChooseUser__results', state.chooseUser.results.map((user) =>
        h('div.MyDocuments__ChooseUser__User', [
          user.attributes.name
        , h('a', {href:'javascript:void(0)', 'ev-click': (evt) => cb(null, user.id)}, 'choose')
        ])
      ))*/
      h('div.form-group', h('button.btn.btn-default.MyDocuments__ChooseUser__submit', {
        'ev-click': (evt) => cb(null, 1)
      }, 'Add user'))
    ])
  }

  register()
}

const vdomTableWithHeaderAndFallback = function (header, children, fallback) {
  if (!children || !children.length) return fallback
  return [header].concat(children)
}

const Choice = function(name, options, checked, cb) {
  return h('div.form-group'
  , Object.keys(options)
    .map((val) =>
      h('label.radio-inline', [
        h('input', {
          name: name
        , type: 'radio'
        , checked: checked==val
        , 'ev-click': (evt) => cb(null, val)
        })
      , options[val]
      ])
    )
  )
}

const Widget = function (vnode, onInit){this.onInit = onInit; this.node = vdom.create(vnode)}
Widget.prototype.type = "Widget"
Widget.prototype.init = function(){this.onInit && setImmediate(this.onInit); return this.node}
Widget.prototype.update = function(previous, domNode){this.node = domNode; return null}
Widget.prototype.destroy = function(domNode){}

const NBSP = function (){
  if (!(this instanceof NBSP)) return new NBSP()
  var div = vdom.create(h('div'))
  div.innerHTML = '&nbsp;'
  this.node = div.firstChild
}
NBSP.prototype.type = "Widget"
NBSP.prototype.init = function(){return this.node}
NBSP.prototype.update = function(previous, domNode){this.node = domNode; return null}
NBSP.prototype.destroy = function(domNode){}
