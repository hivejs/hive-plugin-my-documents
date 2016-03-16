var vdom = require('virtual-dom')
  , h = vdom.h

const ACTIVATE = 'MYDOCUMENTS_ACTIVATE'
const DEACTIVATE = 'MYDOCUMENTS_DEACTIVATE'
const FETCH_OWNS = 'MYDOCUMENTS_FETCH_OWNS'
const FETCH_READS = 'MYDOCUMENTS_FETCH_READS'
const FETCH_WRITES = 'MYDOCUMENTS_FETCH_WRITES'
const LOAD = 'MYDOCUMENTS_LOAD'
const DOCUMENT_CREATE = 'MYDOCUMENTS_DOCUMENT_CREATE'

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
    if(ui.route(action, '/')) {
      session.onceLoggedIn(() => {
        store.dispatch(myDocuments.action_activate())
        store.dispatch(myDocuments.action_load(store.getState().session.user.id))
      })
    }
    if(ui.exitRoute(store, action, '/')) {
      store.dispatch(myDocuments.action_deactivate())
    }
    if(ui.route(action, '/documents/new')) {
      session.onceLoggedIn(() => {
        store.dispatch(myDocuments.action_activate('new'))
        setTimeout(() => store.dispatch({type: 'EDITOR_DEACTIVATE'}), 100)
      })
    }
    if(ui.exitRoute(store, action, '/documents/new')) {
      store.dispatch(myDocuments.action_deactivate())
    }
    switch(action.type) {
      case DOCUMENT_CREATE:
        return fetch(ui.baseURL+'/api/v1/documents/',{
            headers: {Authorization: 'token '+store.getState().session.grant.access_token}
          , method: 'post'
          , body: JSON.stringify({data:{
              type: 'document'
            , attributes:action.payload
            , relationships: {owner: {data:{type: 'user', id: store.getState().session.user.id}}}
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
  ui.reduxMiddleware.unshift(middleware)

  ui.reduxReducerMap['myDocuments'] = function(state, action) {
    if(!state) {
      return {
        active: false
      , owns: null // `null` means loading. `[]` means nothing there
      , reads: [] // these won't be displayed either way
      , writes: []
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
    if(LOAD === action.type) {
      return {
        ...state
      , ...action.payload
      }
    }
    return state
  }

  var myDocuments = {
    action_activate: function(part) {
      return {type: ACTIVATE, payload:part}
    }
  , action_deactivate: function() {
      return {type: DEACTIVATE}
    }
  , action_loadOwns: function*(userId) {
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
  , action_create: function*(attrs) {
      var doc = yield {type: DOCUMENT_CREATE, payload: attrs}
      return yield ui.action_route('/documents/'+doc.id)
    }
  , action_load: function*(userId) {
      yield {type: LOAD, payload: {
        owns: yield myDocuments.action_loadOwns(userId)
      , reads: yield myDocuments.action_loadReads(userId)
      , writes: yield myDocuments.action_loadWrites(userId)
      }}
    }
  }

  ui.onRenderNavbarLeft((store, children) => {
    if(store.getState().session.user) children.push(renderMenu(store))
  })

  ui.onRenderBody((store, children) => {
    if(store.getState().myDocuments.active) {
      if(store.getState().myDocuments.active == 'new') children.push(renderNewDocument(store))
      else children.push(render(store))
    }
  })

  function renderMenu(store) {
    return h('li', h('a', {
      href: 'javascript:void(0)'
    , 'ev-click': evt => ui.store.dispatch(ui.action_route('/'))
    }, 'My Documents'))
  }

  function render(store) {
    const state = store.getState().myDocuments
    var children = [
      h('h1', 'My Documents')
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

    children.push(
      h('p', h('button.btn.btn-default',{
        'ev-click': (evt) => store.dispatch(ui.action_route('/documents/new'))
      }, [h('i.glyphicon.glyphicon-plus'), 'New document']))
    )

    return h('div.container', children)
  }

  function renderNewDocument(store) {
    var title
      , type
    return h('div.container', [
      h('h1', 'New document')
    , h('p', h('label',[
        'Title'
      , title = new Widget(h('input[type=text].form-control'))
      ]))
    , h('p', h('label',[
        'Type'
      , type = new Widget(h('select.form-control', ui.config['ot:types'].map((type) =>
          h('option', {value: type}, type)
        )))
      ]))
    , h('p', h('button.btn.btn-default',{
        'ev-click': (evt) => store.dispatch(myDocuments.action_create({
          title: title.node.value
        , type: type.node.value
        }))
      }, 'Create'))
    ])
  }

  register()
}

var Widget = function (vnode){this.node = vdom.create(vnode)}
Widget.prototype.type = "Widget"
Widget.prototype.init = function(){return this.node}
Widget.prototype.update = function(previous, domNode){return this.node}
Widget.prototype.destroy = function(domNode){}
