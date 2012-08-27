/**
JTM-Tasks is a prototype for a collaborative, real-time task management system.
Copyright (C) <2012>  <Jongmin T. Moon>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , connect = require('connect')
  , io = require('socket.io')
  , fs = require('fs')
  , mongo = require('mongodb')
  , mongoose = require('mongoose')
  , mongooseTypes = require('mongoose-types')
  , crypto = require('crypto')
  , nodemailer = require('nodemailer')
  , hbs = require('hbs');

mongoose.connect('mongodb://localhost/task_test');
mongooseTypes.loadTypes(mongoose);
var Email = mongoose.SchemaTypes.Email
  , Url = mongoose.SchemaTypes.Url;

var parseCookie = connect.utils.parseCookie
  , MemoryStore = express.session.MemoryStore
  , sessionStore = new MemoryStore()
  , Session = connect.middleware.session.Session;

var app = module.exports = express.createServer();
var io = io.listen(app);

//--Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'hbs');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  //app.use(connect.logger({ stream: logFile }));
  app.use(express.session({
      store: sessionStore //new RedisStore
    , secret: 'joy'
    , key: 'express.sid'
  }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

//--Javascript Definitions

//--Mongoose Models

function validatePresenceOf(value) {
  return value && value.length;
}

//Schemas
var Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

var LoginToken = new Schema({
    email           : { type: Email, index: true }
  , series          : { type: String, index: true }
  , token           : { type: String, index: true }
});

var AlphaRequestSchema = new Schema({
    email           : {
      type            : Email
    , validate        : [ validatePresenceOf, 'an email is required' ]
    , index           : { unique: true }
    , required        : true
    }
  , browser         : {
      appName         : String
    , appVersion      : String
    , userAgent       : String
    }
  , created_at      : Date
  , location        : {
      country_code    : String
    , country         : String
    , region          : String
    , city            : String
    }
});

var UserSchema = new Schema({
    email           : { 
      type            : Email
    , validate        : [ validatePresenceOf, 'an email is required' ]
    , index           : { unique: true }
    , required        : true
    }
  , firstName       : String
  , lastName        : String
  , hashed_password : String
  , salt            : String
  , projects        : [{ type: ObjectId, ref: 'Project' }]
  , created_at      : { type: Date, required: true }
  , last_modified   : Date
  , type            : String
  , modified_by     : { type: ObjectId }
  , groups          : [{ type: ObjectId, ref: 'Group' }]
  , invites         : [{ type: ObjectId, ref: 'Invite' }]
  , connections     : [{ type: ObjectId, ref: 'User' }]
  , appState        : String
  , inviteLimit     : Number
  , inviteCount     : Number
  , connectionLimit : Number
});

var InviteSchema = new Schema({
    invite_from     : { type: Email }
  , invite_to       : { type: Email }
  , target          : String
  , target_id       : { type: ObjectId, ref: 'Project' }
  , invite_date     : Date
});

var CodeSchema = new Schema({
    inviteCode       : String
  , invite_from      : { type: ObjectId, ref: 'User' }
});

var ProjectSchema = new Schema({
    created_at      : { type: Date, required: true }
  , last_modified   : Date
  , modified_by     : { type: ObjectId, ref: 'User' }
  , start_at        : Schema.Types.Mixed
  , end_at          : Schema.Types.Mixed
  , desc            : Schema.Types.Mixed
  , tags            : [ String ]
  , tasks           : [{ type: ObjectId, ref: 'Task' }]
  , title           : String
  , complete        : Boolean
  , archive         : Boolean
  , status          : String
  , privacy         : String
  , _creator        : { type: ObjectId, ref: 'User' }
  , users           : [{ type: ObjectId, ref: 'User' }]
});

var GroupSchema = new Schema({
    created_at      : { type: Date, required: true }
  , last_modified   : Date
  , type            : String
  , modified_by     : { type: ObjectId, ref: 'User' }
  , projects        : [{ type: ObjectId, ref: 'Project' }]
  , title           : String
  , _creator        : { type: ObjectId, ref: 'User' }
  , users           : [{ type: ObjectId, ref: 'User' }]
});

var TaskSchema = new Schema({
    created_at      : { type: Date, required: true }
  , start_at        : Schema.Types.Mixed
  , end_at          : Schema.Types.Mixed
  , last_modified   : Date
  , modified_by     : { type: ObjectId, ref: 'User' }
  , pid             : { type: ObjectId, ref: 'Project' }
  , title           : String
  , tags            : [ String ]
  , priority        : Boolean
  , notes           : Schema.Types.Mixed
  , complete        : Boolean
  , status          : String
  , milestone       : Boolean
  , _creator        : { type: ObjectId, ref: 'User' }
  , assigned_to     : {
      email            : { type: Email }
    , name             : String
  }
  , users           : [{ type: ObjectId, ref: 'User' }]
  , parent          : { type: ObjectId, ref: 'Task' }
});

//--Handlebars
function generateInviteCode(userId) {
  var salt = Math.round((new Date().valueOf() * Math.random())) + '';
  var hmac = crypto.createHmac('sha1', salt);
  var hex = hmac.digest('hex');
  var inviteCode = new Code();
  inviteCode.inviteCode = hex;
  if(userId) inviteCode.invite_from = userId;
  inviteCode.save(function(error) {
    if(error) console.log(error);
  });
  return hex;
}

function getInitials(name) {
  var initials;
  var splitName = name.split(' ');
  initials = splitName[0].charAt(0) + splitName[1].charAt(0);
  return initials.toUpperCase();
}

function renderDay(dateString) {
  switch(dateString) {
    case 0:
      return 'Sunday'
      break;
    case 1:
      return 'Monday'
      break;
    case 2:
      return 'Tuesday'
      break;
    case 3:
      return 'Wednesday'
      break;
    case 4:
      return 'Thursday'
      break;
    case 5:
      return 'Friday'
      break;
    case 6:
      return 'Saturday'
      break;
  }
}

function renderDate(dateString) {
  if(dateString === null || dateString == 'null' || dateString == undefined) return '';
  else {
    var parsedDate_ms = Date.parse(dateString);
    if(parsedDate_ms === null) return dateString;
    else {
      var oneDay_ms = 24*60*60*1000;
      var today = new Date().toLocaleDateString();
      var today_ms = Date.parse(today);
      var tomorrow_ms = today_ms + oneDay_ms;
      var yesterday_ms = today_ms - oneDay_ms;
      var oneWeek_ms = today_ms + (oneDay_ms * 7);
      var parsedDate = new Date(parsedDate_ms);
      if(today_ms == parsedDate_ms) return 'Today';
      else if(tomorrow_ms == parsedDate_ms) return 'Tomorrow';
      else if(yesterday_ms == parsedDate_ms) {
        return '<span class="overdue">Yesterday</span>';
      }
      else if(parsedDate_ms >= today_ms && parsedDate_ms <= oneWeek_ms) {
        return renderDay(parsedDate.getDay());
      }
      else if(parsedDate_ms < today_ms) {
        return '<span class="overdue">' + dateString + '</span>';
      }
      else return dateString;
    }
  }
}

var userDashboardFile = fs.readFileSync(__dirname + '/views/user/userDashboard.hbs', 'utf8');
var userDashboardTmpl = hbs.compile(userDashboardFile);

hbs.registerHelper('userGroupNav', function(groupsArray) {
  html = '';
  for(var x=0; x<groupsArray.length; x++) {
    var group = groupsArray[x];
    html += '<div data-list="group" data-groupId="' + group._id + '">' +
    '<li class="nav-header" data-navField="group" data-groupId="' + 
    group._id + '"><span>' + group.title + '</span>' +
    '<div class="groupOptions dropdown pull-right">' +
    '<button class="btn btn-mini dropdown-toggle" data-toggle="dropdown">' +
    '<i class="icon-cog icon-white"></i></button>' +
    '<ul class="dropdown-menu" data-for="navGroup">' +
    '<li><a href="#" data-action="removeFromGroup">Remove Me From Group</a>' +
    '</li></ul></div></li>'
    '<li><ul class="navGroupProjects unstyled" data-groupId="' + group._id +
    '">';
    for(var y=0; y<group.projects.length; y++) {
      var project = group.projects[y];
      html += '<li class="groupProject"><a href="#" data-projectTitle="' + 
      project.title + '" data-projectId="' + project._id + 
      '" class="navProject">' + project.title + '</a></li>';
    }      
    html += '<li class="groupActions">' +
    '<button class="btn btn-mini" data-groupId="' + group._id + 
    '" data-groupName="' + group.title + '" data-action="newProject">' +
    '<span class="newProjectSymbol">+<span> New Project</button>' +
    '</li></ul></li></div>';
  }
  return html;
});

hbs.registerHelper('projectTasks', function(tasksArray) {
  html = '';
  for(var x=0; x<tasksArray.length; x++) {
    var index = x+1;
    var task = tasksArray[x];
    html += '<li class="projectTask';
    if(task.complete) html += ' complete';
    if(task.milestone) html += ' milestone';
    html += '" data-taskId="' + task._id + '">' +
    '<ul class="taskFields">' +
    '<li data-taskField="index" data-index="' + index + '">' +
    '<div>' +
    '<i class="icon-th-list" style="display: none;"></i>' +
    '<span>' + index + '</span>' +
    '</div></li>' +
    '<li data-taskField="assignee" data-assignee="' + task.assigned_to.email +
    '">' + '<div>';
    if(task.assigned_to.name) {
      html += '<a href="#" rel="tooltip" title="' + task.assigned_to.name + 
      '">' + getInitials(task.assigned_to.name) + '</a>';
    }
    else html += '\u00A0';
    html += '</div></li>' +
    '<li data-taskField="checkbox">' +
    '<div rel="tooltip" title="Mark As Complete"><input type="checkbox" ' +
    'data-action="taskComplete" style="display: none;"';
    if(task.complete) html += ' checked';
    html += '>\u00A0</div></li>' +
    '<li data-taskField="title"><input data-taskId="' + task._id + 
    '" data-field="taskTitle" placeholder="(new task)" value="' + task.title +
    '"><div data-field="resizer"></div></li>' +
    '<li rel="tooltip" data-taskField="dueDate" title="' + task.end_at + 
    '" data-due="' + task.end_at + '">' + 
    renderDate(task.end_at) + '</li>' +
    '<li data-taskField="display" class="pull-right" rel="tooltip" ' +
    'title="View Details"><a href="#" data-action="displayTask" ' +
    'data-target="' + task._id + '" class="btn btn-mini hide">' +
    '<i class="icon-chevron-right"></i></a></li></ul></li>';
  }
  return html;
});

hbs.registerHelper('countRemaining', function(projectsArray) {
  html = '';
  var taskCount = 0;
  for(var x=0; x<projectsArray.length; x++) {
    var project = projectsArray[x];
    taskCount += project.tasks.length;
  }
  html += '<span class="countTasks">' + taskCount + 
          '<span class="remaining">TOTAL</span></span>';
  return html;
});

//--Nodemailer
var sesTransport = nodemailer.createTransport('SES', {
      AWSAccessKeyID:       ''
    , AWSSecretKey:         ''
    , ServiceURL:           ''
});

function sendWelcomeMail(targetEmail) {
  var welcomeMailOptions = {
    from                  : ''
  , to                    : targetEmail
  , bcc                   : ''
  , subject               : ''
  , generateTextFromHTML  : true
  , html                  : ''
  }
  
  sesTransport.sendMail(welcomeMailOptions, function(error, response) {
    if(error) console.log(error);
    else console.log('Message sent: ' + response.message);
  });
}

function sendInviteMail(targetEmail, inviteCode) {
  var inviteLink = '' + inviteCode;
  var messageHtml = '';
  var inviteMailOptions = {
    from                  : ''
  , to                    : targetEmail
  , subject               : ''
  , generateTextFromHTML  : true
  , html                  : messageHtml
  }
  
  sesTransport.sendMail(inviteMailOptions, function(error, response) {
    if(error) console.log(error);
    else console.log('Message sent: ' + response.message);
  });
}

function sendInviteMailFrom(targetEmail, inviteCode, fromUser) {
  var inviteLink = '' + inviteCode + '&email=' +
                    targetEmail;
  var messageHtml = '';
  var inviteMailOptions = {
    from                  : ''
  , to                    : targetEmail
  , subject               : ''
  , generateTextFromHTML  : true
  , html                  : messageHtml
  }
  
  sesTransport.sendMail(inviteMailOptions, function(error, response) {
    if(error) console.log(error);
    else console.log('Message sent: ' + response.message);
  });
}

//--Middleware
LoginToken.method('randomToken', function() {
  return Math.round((new Date().valueOf() * Math.random())) + '';
});

LoginToken.pre('save', function(next) {
  this.token = this.randomToken();
  this.series = this.randomToken();
  next();
});

LoginToken.virtual('cookieValue')
  .get(function() {
    return JSON.stringify(
      { 
        email: this.email
      , token: this.token
      , series: this.series
      })
  });

UserSchema.virtual('password')
  .set(function(password) {
    this._password = password;
    this.salt = this.makeSalt();
    this.hashed_password = this.encryptPassword(password);
  })
  .get(function() {
    return this._password;
  });

UserSchema.method('authenticate', function(plainText) {
  return this.encryptPassword(plainText) === this.hashed_password;
});

UserSchema.method('makeSalt', function() {
  return Math.round((new Date().valueOf() * Math.random())) + '';
});

UserSchema.method('encryptPassword', function(password) {
  return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
});

UserSchema.pre('save', function(next) {
  if(!validatePresenceOf(this.hashed_password)) next(new Error('Invalid Password'));
  else {
    next();
  }
});

//Models
var User = mongoose.model('User', UserSchema)
  , AlphaRequest = mongoose.model('AlphaRequest', AlphaRequestSchema)
  , Invite = mongoose.model('Invite', InviteSchema)
  , Code = mongoose.model('Code', CodeSchema)
  , Project = mongoose.model('Project', ProjectSchema)
  , Group = mongoose.model('Group', GroupSchema)
  , Task = mongoose.model('Task', TaskSchema);

//--Authenticate
function authenticateFromLoginToken(req, res, next) {
  var cookie = JSON.parse(req.cookies.logintoken);

  LoginToken.findOne({ email: cookie.email,
                       series: cookie.series,
                       token: cookie.token }, (function(err, token) {
    if (!token) {
      res.redirect('/sessions/new');
      return;
    }

    User.findOne({ email: token.email }, function(err, user) {
      if (user) {
        req.session.user_id = user.id;
        req.currentUser = user;

        token.token = token.randomToken();
        token.save(function() {
          res.cookie('logintoken', token.cookieValue, { expires: new Date(Date.now() + 2 * 604800000), path: '/' });
          next();
        });
      } else {
        res.redirect('/sessions/new');
      }
    });
  }));
}

function requiresLogin(req, res, next) {
  if(req.session.user) next();
  else if(req.params.user_id == 'default') {
    User.findOne({ email: '' }, function(err, user) {
      if(user && user.authenticate('test')) {
        req.session.user = user;
        res.redirect('/user/' + req.session.user._id + '/');
      }
    });
  }
  else {
    if(req.url) res.redirect('/login?redir=' + req.url);
    //else res.redirect('/user/' + req.session.user._id + '/');
  }
}

function restrictToSelf(req, res, next) {
  if(req.session.user._id == req.params.user_id) next();
  else res.redirect('/user/' + req.session.user._id + '/');
}

function restrictToAdmin(req, res, next) {
  if(req.session.user == undefined) res.redirect('/');
  else if(req.session.user.email == '') next();
  else if(req.session.user){
    res.redirect('/user/' + req.session.user._id + '/');
  }
  else res.redirect('/');
}

function fetchUserRefs(req, res, next) {
  if(!req.session.user) res.redirect('/login');
  else {
    User.findOne({ email: req.session.user.email })
    .populate('connections', ['_id', 'firstName', 'lastName', 'email'])
    .run(function(error, user) {
      Group.where('_id').in(user.groups)
      .populate('projects')
      .run(function(error, group) {
        if(error) return next(new Error('Cannot find group.'));
        user = user.toObject();
        user.groups = group;
        req.session.user = user;
        next();
      });
    });
  }
}

function fetchProject(projectId, callback) {
  Project.findOne({ _id: projectId })
  .populate('tasks')
  .populate('users', ['_id', 'email', 'firstName', 'lastName'])
  .run(function(error, project) {
    callback(error, project);
  });
}

function fetchTask(taskId, callback) {
  Task.findOne({ _id: taskId })
  .populate('_creator')
  .populate('project')
  .populate('users', ['_id', 'email', 'firstName', 'lastName'])
  .populate('modified_by')
  .run(function(error, task) {
    if(error) console.log(error);
    callback(error, task);
  });
}

function fetchRelevantTasks(taskId, callback) {
  Task.findOne({ _id: taskId }, function(error, task) {
    Task.where('tags').in(task.tags).nor({ _id: taskId })
    .run(function(error, tasks) {
      callback(error, tasks);
    });
  });
}

function fetchUserDashboard(userId, callback) {
  User.findOne({ _id: userId }, function(error, user) {
    var oneDay = 24*60*60*1000;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var tomorrow = today.getTime() + oneDay;
    var later = tomorrow + oneDay;
    tomorrow = new Date(tomorrow);
    later = new Date(later);
    today = today.toLocaleDateString();
    tomorrow = tomorrow.toLocaleDateString();
    later = later.toLocaleDateString();
    todayList = today.split(', ');
    today = todayList[1] + ', ' + todayList[2];
    tomorrowList = tomorrow.split(', ');
    tomorrow = tomorrowList[1] + ', ' + tomorrowList[2];
    laterList = later.split(', ');
    later = laterList[1] + ', ' + laterList[2];
    if(error) console.log(error);
    Project.find({ users: user._id })
    .populate(
      'tasks'
    , null
    , { 'end_at': today
      , $or: [ 
          { '_creator': user._id }
        , { 'assigned_to.email': user.email } 
        ]
      }
    , null
    )
    .run(function(error, projectsToday) {
      if(error) console.log(error);
      Project.find({ users: user._id })
      .populate(
        'tasks'
      , null
      , { 'end_at': tomorrow
        , $or: [
            { '_creator': user._id }
          , { 'assigned_to.email': user.email }
          ]
        }
      , null
      )
      .run(function(error, projectsTomorrow) {
        if(error) console.log(error);
        Project.find({ users: user._id })
        .populate(
          'tasks'
        , null
        , { 
            $and: [
              { $or: [
                { 'end_at': 'later' }
              , { 'end_at': 'Later' }
              , { 'end_at': { $gte: later } }
                ] }
              , { $or: [ 
                  { '_creator': user._id }
                , { 'assigned_to.email': user.email } 
                ] }
              , { complete: { $ne: true } }
            ]
          }
        , null
        )
        .run(function(error, projectsLater) {
          if(error) console.log(error);
          callback(projectsToday, projectsTomorrow, projectsLater);
        });
      });
    });
  });
}

function fetchInvites(user, callback) {
  Invite.find({ invite_to: user.email })
  .populate('target_id', ['_id', 'title'])
  .run(function(error, receivedInvites) {
    if(error) console.log(error);
    Invite.find({ invite_from: user.email })
    .populate('target_id', ['_id', 'title'])
    .run(function(error, sentInvites) {
      if(error) console.log(error);
      callback(error, receivedInvites, sentInvites);
    });
  });
}

function countInvites(receivedInvites, sentInvites) {
  var rCount, sCount, total;
  if(receivedInvites === null) rCount = 0;
  else rCount = receivedInvites.length;
  if(sentInvites === null) sCount = 0;
  else sCount = sentInvites.length;
  total = rCount + sCount;
  return total;
}

function objectify(id) {
  var objectId = new mongoose.Types.ObjectId(id);
  return objectId;
}

function checkUserCount(req, res, next) {
  User.find({}, ['_id'], function(error, users) {
    var count = users.length;
    if(count < 1000) next();
    else next(new Error('User limit reached!'));
  });
}

function setSubtasks(parentId, subtaskIds) {
  Task.update(
    { _id: { $in: subtaskIds }}
  , { $set: { parent: parentId }}
  , { multi: true }
  , function(error, numAffected) {
      if(error) console.log(error);
    }
  );
}

//--SOCKET.IO
io.set('authorization', function(data, accept) {
  if(data.headers.cookie) {
    data.cookie = parseCookie(data.headers.cookie);
    data.sessionId = data.cookie['express.sid'];
    data.sessionStore = sessionStore;
    sessionStore.get(data.sessionId, function(error, session) {
      if(error || !session) accept('Error', false);
      else {
        data.session = new Session(data, session);
        accept(null, true);
      }
    });
  }
  else return accept('No cookie transmitted.', false);
});

io.sockets.on('connection', function(socket) {
  //create a room for connected user using session ID
  var hs = socket.handshake;
  //console.log('A socket with session ID ' + hs.sessionId + ' connected!');
  socket.join(hs.sessionId);
  
  var intervalId = setInterval(function() {
    hs.session.reload(function() {
      hs.session.touch().save();
    });
  }, 60 * 1000);
  
  socket.on('userLoggedIn', function(userId) {
    User.findOne({ _id: userId }, function(error, user) {
      if(error) console.log(error);
      else {
        socket.join(user.email);
      }
    });
  });
  
  socket.on('joinProject', function(userId, projectId) {
    Project.findOne({ _id: projectId }, function(error, project) {
      if(error) console.log(error);
      else {
        if(socket.projectId !== projectId) {
          socket.leave(socket.projectId);
          socket.projectId = projectId;
          socket.join(socket.projectId);
          fetchProject(socket.projectId, function(error, loadedProject) {
            if(error) console.log(error);
            //console.log(project);
            socket.set(
              'cachedProject' + projectId
            , loadedProject
            , function() {
              fetchProject(projectId, function(error, fetchedProject) {
                socket.emit('loadProjectUsers', fetchedProject);
              });
            });
          })
        }
      }
    });
  });
  
  socket.on('disconnect', function() {
    console.log('disconnected!');
    clearInterval(intervalId);
  });
  
  //save apps state
  socket.on('updateAppState', function(userId, appState) {
    User.update(
      { _id: userId }
    , { $set: appState }
    , function(error, numAffected) {
        if(error) console.log(error);
      }
    );
  });
  
  //send sign-up invite to target user
  socket.on('sendInviteCode', function(userId, inviteToType, inviteToId, targetEmail) {
    User.findOne({ _id: userId }, function(error, user) {
      var inviteCount = user.inviteCount;
      var inviteLimit = user.inviteLimit;
      var connectionCount = user.connections.length;
      var connectionLimit = user.connectionLimit;
      if(connectionCount < connectionLimit) {
        //generate invite
        if(inviteToType == 'Project') {
          var newInvite = new Invite();
          newInvite.invite_from = user.email;
          newInvite.invite_to = targetEmail;
          newInvite.target_id = inviteToId;
          newInvite.target = inviteToType;
          //check to see if user already exists in system
          newInvite.save(function(error) {
            if(error) console.log(error);
            else {
              User.findOne({ email: targetEmail }, function(error, targetUser) {
                if(error) console.log(error);
                if(targetUser) {
                  Project.findOne({ _id: inviteToId }, function(error, project) {
                    socket.broadcast.to(targetUser.email)
                    .emit('receivedInvite', user, inviteToType, project, newInvite);
                  });
                }
                else {
                  if(inviteCount < inviteLimit) {
                    //if user doesn't exist, then send an invitation email
                    User.update(
                      { _id: userId }
                    , { $inc: { inviteCount: 1 }}
                    , function(error, numAffected) {
                      }
                    );
                    var inviteCode = generateInviteCode(userId);
                    sendInviteMailFrom(targetEmail, inviteCode, user);
                  }
                }
              });
            }
          });
        }
        else {
          var inviteCode = generateInviteCode(userId);
          sendInviteMailFrom(targetEmail, inviteCode, user);
        }
      }
      else socket.emit('inviteLimitReached');
    });
  });
  
  //get invite quota
  socket.on('getInviteQuota', function(userId) {
    User.findOne({ _id: userId }, function(error, user) {
      var count = user.inviteCount;
      var limit = user.inviteLimit;
      socket.emit('updateInviteQuota', count, limit);
    });
  });
  
  //get connection quota
  socket.on('getConnectionQuota', function(userId) {
    User.findOne({ _id: userId }, function(error, user) {
      var count = user.connections.length;
      var limit = user.connectionLimit;
      socket.emit('updateConnectionQuota', count, limit);
    });
  });
  
  //send invites to group or project
  socket.on('inviteUsers', function(userId, target, targetId, targetUserEmail) {
    User.findOne({ _id: userId }, function(error, user) {
      if(user.connections.length < user.connectionLimit) {
        User.findOne({ email: targetUserEmail }, function(error, targetUser) {
          if(targetUser.connections.length < user.connectionLimit) {
            var newInvite = new Invite();
            newInvite.invite_from = user.email;
            if(target == 'Project') {
              Project.findOne({ _id: targetId }, function(error, project) {
                User.findOne(
                  { email: targetUsers }
                , function(error, targetUser) {
                    if(error) console.log(error);
                    else {
                      newInvite.invite_to = targetUser.email;
                      newInvite.target = target;
                      newInvite.target_id = project._id;
                      newInvite.invite_date = new Date();
                      newInvite.save(function(error) {
                        if(error) console.log(error);
                        socket.broadcast.to(targetUser.email).emit(
                          'receivedInvite'
                        , user
                        , target
                        , project
                        , newInvite
                        );
                      });
                    }
                  }
                );
              });
            }
            else if(target == 'Group') {
              Group.findOne({ _id: targetId }, function(error, group) {
                User.findOne(
                  { email: targetUsers }
                , function(error, targetUser) {
                    if(error) console.log(error);
                    else {
                      newInvite.invite_to = targetUser.email;
                      newInvite.target = target;
                      newInvite.target_id = group._id;
                      newInvite.invite_date = new Date();
                      newInvite.save(function(error) {
                        if(error) console.log(error);
                        socket.broadcast.to(targetUser.email).emit(
                          'receivedInvite'
                        , user
                        , target
                        , group
                        , newInvite
                        );
                      });
                    }
                  }
                );
              });
            }
            socket.emit('sentInvites', target, targetUsers, newInvite._id);
          }
          else socket.emit('targetConnectionLimitReached');
        });
      }
      else socket.emit('connectionLimitReached');
    });
  });
  
  //accept invite to project or group
  socket.on('acceptInvite', function(userId, inviteId, groupId) {
    var userObjectId = new mongoose.Types.ObjectId(userId);
    Invite.findOne({ _id: inviteId }, function(error, invite) {
      User.findOne({ email: invite.invite_from }, function(error, inviteFrom) {
        User.findOne({ email: invite.invite_to }, function(error, inviteTo) {
          User.update(
            { _id: inviteFrom._id }
          , { $addToSet: { connections: inviteTo._id }}
          , function(error, numAffected) {
            }
          );
          User.update(
            { _id: inviteTo._id }
          , { $addToSet: { connections: inviteFrom._id }}
          , function(error, numAffected) {
            }
          );
        });
      });
      if(invite.target == 'Project') {
        Project.update(
          { _id: invite.target_id }
        , { $addToSet: { 'users': userObjectId }}
        , function(error, numAffected) {
          if(error) console.log(error);
        });
        Project.findOne({ _id: invite.target_id }, function(error, project) {
          if(error) console.log(error);
          Group.update(
            { _id: groupId }
          , { $addToSet: { 'projects': project._id }}
          , function(error, numAffected) {
            if(error) console.log(error);
            Invite.remove({ _id: inviteId }, function(error) {
              if(error) console.log(error);
              console.log('removed invite');
            });
            socket.emit('acceptedProjectInvite', groupId, project);
            socket.broadcast.to(project._id)
            .emit('userJoinedProject', userObjectId, inviteId);
          });
        });
      }
    });
  });
  
  socket.on('declineInvite', function(userId, projectId, inviteId) {
    Invite.findOne({ _id: inviteId }, function(error, invite) {
      socket.broadcast.to(invite.invite_from)
      .emit('declinedInvite', userId, inviteId);
      socket.broadcast.to(invite.invite_to)
      .emit('declinedInvite', userId, inviteId);
      socket.emit('declinedInvite', userId, inviteId);
      Invite.remove({ _id: inviteId }, function(error) {
        if(error) console.log(error);
      });
    });
  });
  
  //create new project
  socket.on('newProject', function(groupId, userId) {
    if(socket.projectId) socket.leave(socket.projectId);
    var newProject = new Project();
    socket.projectId = newProject._id;
    socket.join(socket.projectId);
    console.log(hs.sessionId + ' has joined ' + socket.projectId);
    Group.update(
      { _id: groupId }
    , { $addToSet: { 'projects': newProject._id }}
    , function(error, numAffected) {
      if(error) console.log(error);
    });
    User.update(
      { _id: userId }
    , { $addToSet: { 'projects': newProject._id }}
    , function(error, numAffected) {
      if(error) console.log(error);
    });
    User.findOne({ _id: userId }, function(error, user) {
      if(error) console.log(error);
      newProject._creator = user._id;
      newProject.users.push(user._id);
      newProject.created_at = new Date();
      newProject.title = 'New Project';
      newProject.save(function(error) {
        socket.set('cachedProject' + newProject._id, newProject, function() {
          fetchProject(newProject._id, function(error, fetchedNewProject) {
            socket.emit('newProjectCreated', fetchedNewProject, groupId);
          });
        })
      });
    });
  });
  
  //delete project
  socket.on('deleteProject', function(projectId, userId) {
    var projectObjectId = new mongoose.Types.ObjectId(projectId);
    User.findOne({ _id: userId }, function(error, user) {
      if(error) console.log(error);
      Project.findOne({ _id: projectId }, function(error, project) {
        User.update(
          { _id: userId }
        , { $pull: { 'projects': projectObjectId }}
        , function(error, numAffected) {
            if(error) console.log(error);
          }
        );
        Group.update(
          { projects: projectObjectId }
        , { $pull: { 'projects': projectObjectId }}
        , function(error, numAffected) {
          if(error) console.log(error);
          }
        );
        Project.remove({ _id: projectId }, function(error) {
          if(error) console.log(error);
          io.sockets.in(projectId).emit('projectDeleted', projectId);
        });
      });
    });
  });
  
  //remove member from project
  socket.on('removeProjectMember', function(userId, projectId, targetEmail) {
    User.findOne({ email: targetEmail }, function(error, targetUser) {
      Project.update(
        { _id: projectId }
      , { $pull: { 'users': targetUser._id }}
      , function(error, numAffected) {
          if(error) console.log(error);
          var projectObjectId = new mongoose.Types.ObjectId(projectId);
          Group.update(
            { _creator: targetUser._id }
          , { $pull: { 'projects': projectObjectId }}
          , function(error, numAffected) {
              if(error) console.log(error);
              Task.update(
                { pid: projectId, 'assigned_to.email': targetEmail}
              , { $unset: { 'assigned_to': 1 }}
              , function(error, numAffected) {
                  if(error) console.log(error);
                  socket.emit('removedProjectMember', userId);
                }
              );
            }
          );
        }
      );
    });
  });
  
  //load requested project and cache it
  socket.on('loadProject', function(projectId) {
    if(socket.projectId) socket.leave(socket.projectId);
    socket.projectId = projectId;
    socket.join(socket.projectId);
    fetchProject(socket.projectId, function(error, loadedProject) {
      if(error) console.log(error);
      //console.log(project);
      socket.set('cachedProject' + projectId, loadedProject, function() {
        socket.emit('projectLoaded', loadedProject);
      });
    });
  });
  
  //update project info
  socket.on('updateProject', function(projectId, updatedProject, userId) {
    User.findOne({ _id: userId }, function(error, user) {
      updatedProject.last_modified = new Date();
      updatedProject.modified_by = user._id;
      Project.update(
        { _id: projectId }
      , { $set: updatedProject }
      , function(error, numAffected) {
          if(error) console.log(error);
          socket.set('cachedProject' + projectId, updatedProject, function() {
            io.sockets.in(projectId)
            .emit('projectUpdated', updatedProject, projectId);
          });
        }
      );
    });
  });
  
  //update user profile
  socket.on('updateProfile', function(userId, updatedProfile) {
    updatedProfile.last_modified = new Date();
    User.update(
      { _id: userId }
    , { $set: updatedProfile }
    , function(error, numAffected) {
        if(error) console.log(error);
        socket.emit('profileUpdated', updatedProfile);
      }
    );
  });
  
  //check if user email already exists
  socket.on('validateNewUserEmail', function(email) {
    User.findOne({ email: email}, function(error, user) {
      if(error) console.log(error);
      if(user) socket.emit('validNewUserEmail', true);
      else socket.emit('validNewUserEmail', false);
    });
  });
  
  //validate invite code
  socket.on('validateInviteCode', function(inviteCode) {
    Code.findOne({ inviteCode: inviteCode }, function(error, inviteCode) {
      if(error) console.log(error);
      if(inviteCode) socket.emit('validInviteCode', true);
      else socket.emit('validInviteCode', false);
    });
  });
  
  //update task order
  socket.on('taskReorder', function(taskHtml, targetList, userId, projectId) {
    socket.broadcast.to(projectId).emit('taskReordered', taskHtml, targetList, userId);
  });
  
  socket.on('saveTaskOrder', function(newTaskList, userId, projectId) {
    var objNewTaskList = [];
    for(var x=0; x<newTaskList.length; x++) {
      var numId = newTaskList[x];
      var objId = objectify(numId);
      objNewTaskList.push(objId);
    }
    Project.update(
      { _id: projectId }
    , { $set: { tasks: objNewTaskList }}
    , function(error, numAffected) {
        if(error) console.log(error);
        socket.broadcast.to(projectId).emit('savedTaskOrder', userId);
      }
    );
  });
  
  //arrange tasks by view option
  socket.on('changeView', function(viewOption, projectId) {
    fetchProject(projectId, function(error, project) {
      socket.emit('changedView', viewOption, project.tasks);
    });
  });
  
  //load cached project
  socket.on('getCachedProject', function(projectId) {
    socket.get('cachedProject' + projectId, function(error, cachedProject) {
      if(cachedProject == null) {
        Project.findOne({ _id: projectId }, function(error, project) {
          if(error) console.log(error);
          socket.set('cachedProject' + projectId, project, function() {
            socket.emit('loadedProjectCache', project);
          });
        });
      }
      else {
        socket.emit('loadedProjectCache', cachedProject);
      }
    });
  });
  
  //create new group
  socket.on('newGroup', function(userId, groupTitle, groupType) {
    User.findOne({ _id: userId }, function(error, user) {
      if(error) console.log(error);
      var newGroup = new Group();
      newGroup.title = groupTitle;
      newGroup.type = groupType;
      newGroup._creator = user._id;
      newGroup.users.push(user._id);
      newGroup.created_at = new Date();
      newGroup.save(function(error) {
        if(error) console.log(error);
        User.update(
          { _id: user._id }
        , { $addToSet: { 'groups': newGroup._id }}
        , function(error, numAffected) {
          if(error) console.log(error);
          socket.emit('groupCreated', newGroup);
        }
      );
      });
    });
  });
  
  //remove user from group
  socket.on('removeFromGroup', function(userId, groupId) {
    var groupObjectId = new mongoose.Types.ObjectId(groupId);
    User.update(
      { _id: userId }
    , { $pull: { 'groups': groupObjectId }}
    , function(error, numAffected) {
        User.findOne({ _id: userId }, function(error, user) {
          socket.emit('removedFromGroup', groupId);
        });
      }
    )
  });
  
  //create new task
  socket.on('newTask', function(projectId, userId, task, selectedTaskId) {
    User.findOne({ _id: userId }, function(error, user) {
      if(error) console.log(error);
      var newTask = new Task(task);
      Project.update(
        { _id: projectId }
      , { $addToSet: { 'tasks': newTask._id }}
      , function(error, numAffected) {
          if(error) console.log(error);
          Project.findOne({ _id: projectId }, function(error, project) {
            if(error) console.log(error);
            user = user.toObject();
            newTask._creator = user._id;
            newTask.users.push(user._id);
            newTask.pid = project._id;
            newTask.created_at = new Date();
            newTask.save(function(error) {
              if(error) console.log(error);
              socket.set('cachedProject' + projectId, project, function() {
                io.sockets.in(projectId)
                .emit('newTaskCreated', newTask, selectedTaskId);
              });
            });
          });
        }
      );
    });
  });
  
  //task complete
  socket.on('taskComplete', function(taskId, userId, projectId) {
    var userObjectId = new mongoose.Types.ObjectId(userId);
    Task.update(
      { _id: taskId }
    , { $set:
        { 
          'complete'      : true
        , 'status'        : 'complete'
        , 'modified_by'   : userObjectId
        , 'last_modified' : new Date()
        }
      }
    , function(error, numAffected) {
        io.sockets.in(projectId).emit('taskCompleted', taskId, userId);
      }
    );
  });
  
  //task incomplete
  socket.on('taskNotComplete', function(taskId, userId, projectId) {
    var userObjectId = new mongoose.Types.ObjectId(userId);
    Task.update(
      { _id: taskId }
    , { $set:
        {
          'complete'      : false
        , 'status'        : null
        , 'modified_by'   : userObjectId
        , 'last_modified' : new Date()
        }
      }
    , function(error, numAffected) {
        io.sockets.in(projectId).emit('taskNotCompleted', taskId, userId);
      }
    );
  });
  
  //add task tag
  socket.on('addTaskTag', function(userId, taskId, tag) {
    Task.update(
      { _id: taskId }
    , { $addToSet: { 'tags': tag }}
    , function(error, numAffected) {
        if(error) console.log(error);
        Task.findOne({ _id: taskId }, function(error, task) {
          if(error) console.log(error);
            Project.update(
              { _id: task.pid }
            , { $push: { 'tags': tag }}
            , function(error, numAffected) {
                if(error) console.log(error);
                socket.emit('addedTaskTag', taskId, tag);
              }
            );
          }
        );
      }
    );
  });
  
  socket.on('getTaskAssignee', function(taskId) {
    Task.findOne({ _id: taskId }, ['assigned_to'], function(error, task) {
      if(error) console.log(error);
      socket.emit('gotTaskAssignee', task);
    });
  });
  
  //mark task as priority
  socket.on('setPriority', function(taskId, userId, projectId) {
    var userObjectId = new mongoose.Types.ObjectId(userId);
    Task.update(
      { _id: taskId }
    , { $set:
        {
          'priority'      : true
        , 'modified_by'   : userObjectId
        , 'last_modified' : new Date()
        }
      }
    , function(error, numAffected) {
        io.sockets.in(projectId).emit('prioritySet', taskId, userId);
      }
    );
  });
  
  //delete task
  socket.on('deleteTask', function(taskId, projectId, userId) {
    var taskObjectId = new mongoose.Types.ObjectId(taskId);
    Task.findOne({ _id: taskId }, function(error, task) {
      if(error) console.log(error);
      User.findOne({ _id: userId }, function(error, user) {
        Project.update(
          { _id: projectId }
        , { $pull: { 'tasks': taskObjectId }}
        , function(error, numAffected) {
            if(error) console.log(error);
          }  
        );
        io.sockets.in(projectId).emit('taskDeleted', taskId);
        socket.broadcast.to(projectId).emit(
          'userDeletedTask'
        , user.email
        , task.title
        );
        Task.remove({ _id: taskId }, function(error) {
          if(error) console.log(error);
        });
      });
    });
  });
  
  //load task
  socket.on('loadTask', function(taskId) {
    if(socket.taskId) socket.leave(socket.taskId);
    socket.taskId = taskId;
    socket.join(socket.taskId);
    console.log(hs.sessionId + ' has joined ' + socket.taskId);
    fetchTask(socket.taskId, function(error, loadedTask) {
      if(error) console.log(error);
      //console.log(task);
      socket.set('cachedTask' + taskId, loadedTask, function() {
        socket.emit('taskLoaded', loadedTask);
      });
    });
  });
  
  //load relevant tasks
  socket.on('loadRelevantTasks', function(taskId) {
    fetchRelevantTasks(tasksId, function(error, relevantTasks) {
      if(error) console.log(error);
      socket.emit('loadedRelevantTasks', relevantTasks);
    });
  });
  
  //update task
  socket.on('updateTask', function(taskId, updatedTask, userId, projectId) {
    User.findOne({ _id: userId}, function(error, user) {
      updatedTask.last_modified = new Date();
      updatedTask.modified_by = user._id;
      if(updatedTask.assigned_to) {
        User.findOne(
          { email: updatedTask.assigned_to.email }
        , function(error, user) {
            var userFullName = user.firstName + ' ' + user.lastName;
            updatedTask.assigned_to.name = userFullName;
            Task.update(
              { _id: taskId }
            , { $set: updatedTask }
            , function(error, numAffected) {
                if(error) console.log(error);
                Task.findOne({ _id: taskId }, function(error, task) {
                  if(error) console.log(error);
                  io.sockets.in(projectId).emit('taskUpdated', task, userId);
                });
              }
            );
          }
        );
      }
      else {
        Task.update(
          { _id: taskId }
        , { $set: updatedTask }
        , function(error, numAffected) {
            if(error) console.log(error);
            Task.findOne({ _id: taskId }, function(error, task) {
              if(error) console.log(error);
              io.sockets.in(projectId).emit('taskUpdated', task, userId);
            });
          }
        );
      }
    });
  });
  
  //set milestone
  socket.on('toggleMilestone', function(taskId, subtaskIds, userId, projectId) {
    Task.findOne({ _id: taskId }, function(error, task) {
      if(error) console.log(error);
      if(task.milestone) {
        task.milestone = false;
        setSubtasks(null, subtaskIds);
        task.save();
        io.sockets.in(projectId).emit('taskUpdated', task, userId);
      }
      else {
        task.milestone = true;
        setSubtasks(task._id, subtaskIds);
        task.save();
        io.sockets.in(projectId).emit('taskUpdated', task, userId);
      }
    });
  });
  
  //set subtasks
  socket.on('setSubtasks', function(milestoneId, subtaskIds, userId, projectId) {
    if(milestoneId !== null) {
      Task.findOne({ _id: milestoneId }, function(error, task) {
        setSubtasks(task._id, subtaskIds);
      });
    }
    else setSubtasks(milestoneId, subtaskIds);
  });
  
  //load user dashboard
  socket.on('loadUserDashboard', function(userId) {
    fetchUserDashboard(userId, function(projectsToday, projectsTomorrow, projectsLater) {
      userDashboardTmpl = hbs.compile(userDashboardFile);
      socket.emit(
        'loadedUserDashboard'
      , userDashboardTmpl({ 
          'projectsToday': projectsToday
        , 'projectsTomorrow': projectsTomorrow
        , 'projectsLater': projectsLater
      }));
    });
  });
  
});

//--DYNAMIC HELPERS

app.dynamicHelpers(
  {
    session: function(req, res) {
      return req.session;
    }
  , flash: function(req, res) {
      return req.flash();
    }
  }
);

//--Routes

//Base
app.get('/', function(req, res) {
  if(req.session.user) {
    if(req.session.user.appState) {
      res.redirect('/user/' + req.session.user._id + '/' + req.session.user.appState);
    }
    else res.redirect('/user/' + req.session.user._id + '/');
  }
  else {
    res.render('index', { code: req.query.code, email: req.query.email });
  }
});

app.get('/generateInviteCode', restrictToAdmin, function(req, res) {
  res.render('generateInviteCode');
});

app.post('/generateInviteCode/new', restrictToAdmin, function(req, res) {
  var inviteCode = generateInviteCode();
  var targetEmail = req.body.email;
  sendInviteMail(targetEmail, inviteCode);
  req.flash('info', 'Invite sent to ' + targetEmail + ' with code ' + inviteCode);
  res.render('generateInviteCode');
});

app.post('/alpharequest', function(req, res) {
  var alphaRequest = new AlphaRequest();
  alphaRequest.email = req.body.email;
  alphaRequest.browser.appName = req.body.browser;
  alphaRequest.browser.appVersion = req.body.browserVersion;
  alphaRequest.browser.userAgent = req.body.userAgent;
  alphaRequest.location.country_code = req.body.country_code;
  alphaRequest.location.country = req.body.country;
  alphaRequest.location.region = req.body.region;
  alphaRequest.location.city = req.body.city;
  alphaRequest.created_at = new Date();
  alphaRequest.save(function(error) {
    if(error) console.log(error);
    res.redirect('');
  });
});

app.post('/new', checkUserCount, function(req, res) {
  var newUser = new User()
    , defaultGroup = new Group()
    , defaultProject = new Project()
    , defaultTask = new Task();
  
  newUser.firstName = req.body.newUser_firstName;
  newUser.lastName = req.body.newUser_lastName;
  newUser.email = req.body.newUser_email;
  newUser.password = req.body.newUser_pw;
  newUser.created_at = new Date();
  newUser.inviteLimit = 10;
  newUser.inviteCount = 0;
  newUser.connectionLimit = 30;
  
  defaultGroup.title = 'Personal';
  defaultGroup.created_at = new Date();
  defaultGroup.projects.push(defaultProject);
  defaultGroup._creator = newUser._id;
  
  defaultProject.title = 'New Project';
  defaultProject.created_at = new Date();
  defaultProject._creator = newUser._id;
  defaultProject.tasks.push(defaultTask._id);
  defaultProject.users.push(newUser._id);
  
  /*
  defaultTask.title = 'Unnamed Task';
  defaultTask.created_at = new Date();
  defaultTask._creator = newUser._id;
  defaultTask.project = defaultProject._id;
  */
  
  newUser.groups.push(defaultGroup._id);
  newUser.projects.push(defaultProject._id);
  newUser.save(function(error) {
    if(error) console.log(error);
    else {
      defaultGroup.save(function(error) {if(error) console.log(error);});
      defaultProject.save(function(error) {if(error) console.log(error);});
      sendWelcomeMail(newUser.email);
    }
  });
  Code.findOne({ inviteCode: req.body.inviteCode }, function(error, code) {
    if(code) {
      if(code.invite_from) {
        User.update(
          { _id: code.invite_from }
        , { $addToSet: { connections: newUser._id }}
        , function(error, numAffected) {
          }
        );
        User.update(
          { _id: newUser._id }
        , { $addToSet: { connections: code.invite_from }}
        , function(error, numAffected) {
          }
        );
      }
      Code.remove({ inviteCode: req.body.inviteCode }, function(error) {
        if(error) console.log(error);
      });
    }
  });
  User.findOne({ _id: newUser._id }, function(error, user) {
    if(error) console.log(error);
    else {
      req.session.user = user;
      res.redirect('/user/' + user._id + '/');
    }
  });
});

app.get('/login', function(req, res) {
  if(req.session.user) {
    if(req.session.user.appState) {
      res.redirect('/user/' + req.session.user._id + '/' + req.session.user.appState);
    }
    else res.redirect('/user/' + req.session.user._id + '/');
  }
  else {
    res.render('login', { title: 'Login', redir: req.query.redir });
  }
});

app.post('/login', function(req, res) {
  User.findOne({ email: req.body.login_email }, function(error, user) {
    if(user && user.authenticate(req.body.login_pw)) {
      req.session.user = user;
      if(req.body.rememberMe === 'yes') {
        var loginToken = new LoginToken({ email: user.email });
        loginToken.save(function() {
          res.cookie(
              'loginToken'
            , loginToken.cookieValue
            , { expires: new Date(Date.now() + 2 * 6048000000), path: '/'}
          );
        });
      }
      if(req.body.redir) res.redirect(req.body.redir);
      else if(user.appState) res.redirect('/user/' + req.session.user._id + '/' + user.appState);
      else res.redirect('/user/' + req.session.user._id + '/');
    }
    else {
      req.flash('warn', 'Incorrect credentials.');
      res.render('login', { title: 'Login', redir: req.body.redir })
    }
  });
});

app.get('/logout', function(req, res) {
  delete req.session.user;
  res.redirect('/');
});

//User
app.get('/user/:user_id'
, requiresLogin
, fetchUserRefs
, restrictToSelf
, function(req, res) {
  fetchInvites(req.session.user, function(error, receivedInvites, sentInvites) {
    var inviteCount = countInvites(receivedInvites, sentInvites);
    res.render('user/userMain',
      { 
        locals: 
        { 
          user: req.session.user
        , groups: req.session.user.groups
        , receivedInvites: receivedInvites
        , sentInvites: sentInvites
        , inviteCount: inviteCount
        }
      }
    );
  });
  //console.log(req.session.user);
});

app.get('/user/:user_id/dashboard'
, requiresLogin
, fetchUserRefs
, restrictToSelf
, function(req, res) {
  fetchInvites(req.session.user, function(error, receivedInvites, sentInvites) {
    var inviteCount = countInvites(receivedInvites, sentInvites);
    fetchUserDashboard(req.session.user._id, function(projectsToday, projectsTomorrow, projectsLater) {
      var inviteCount = countInvites(receivedInvites, sentInvites);
      var connectionCount = req.session.user.connections.length;
      var connectionLimit = req.session.user.connectionLimit;
      res.render('user/userDashboard',
        {
          locals:
          {
            user: req.session.user
          , groups: req.session.user.groups
          , receivedInvites: receivedInvites
          , sentInvites: sentInvites
          , inviteCount: inviteCount
          , connectionCount: connectionCount
          , connectionLimit: connectionLimit
          , projectsToday: projectsToday
          , projectsTomorrow: projectsTomorrow
          , projectsLater: projectsLater
          }
        }
      );
    });
  });
});

app.get('/user/:user_id/:project_id'
, requiresLogin
, fetchUserRefs
, restrictToSelf
, function(req, res) {
  fetchProject(req.params.project_id, function(error, loadedProject) {
    fetchInvites(req.session.user, function(error, receivedInvites, sentInvites) {
      var inviteCount = countInvites(receivedInvites, sentInvites);
      var connectionCount = req.session.user.connections.length;
      var connectionLimit = req.session.user.connectionLimit;
      if(req.query.tid) {
        Task.findOne({ _id: req.query.tid}, function(error, task) {
          res.render('user/userMain',
            {
              locals:
              {
                user: req.session.user
              , groups: req.session.user.groups
              , project: loadedProject
              , receivedInvites: receivedInvites
              , sentInvites: sentInvites
              , task: task
              , inviteCount: inviteCount
              , connectionCount: connectionCount
              , connectionLimit: connectionLimit
              }
            }
          );
        });
      }
      else {
        res.render('user/userMain',
          {
            locals:
            {
              user: req.session.user
            , groups: req.session.user.groups
            , project: loadedProject
            , receivedInvites: receivedInvites
            , sentInvites: sentInvites
            , inviteCount: inviteCount
            , connectionCount: connectionCount
            , connectionLimit: connectionLimit
            }
          }
        );
      }
    });
  });
});

//Group

//Project

//Task

app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
