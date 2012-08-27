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

$.extend({
  getUserPath: function(){
    var urlList = window.location.href.split('/');
    var lastPos = urlList.length - 1;
    return urlList[lastPos];
  },
  getUrlVars: function(){
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
      hash = hashes[i].split('=');
      vars.push(hash[0]);
      vars[hash[0]] = hash[1];
    }
    return vars;
  },
  getUrlVar: function(name){
    return $.getUrlVars()[name];
  }
});

var emailReg = /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/;

var socket = io.connect('http://localhost');

var projectUsersObj = {};
var projectUsersList = [];
var selectedTaskId;
var tempAssignee, reconnect;

function setSelectedTaskId(id) {
  selectedTaskId = id;
}

function isInDocument(elem) {
  var html = document.body.parentNode;
  while(elem) {
    if(html === elem) return true;
    elem = elem.parentNode;
  }
  return false;
}

function initiateUX() {
  initiateSortable();
  $('[rel="tooltip"]').tooltip();
  $('[data-field="taskDueDate"]').datepicker({
    dateFormat: 'MM d, yy'
  });
  resizeTextarea();
}

function initiateTaskAssigneeToken(assignee) {
  var projectId = $('.projectInfo').attr('data-projectId');
  var taskId = $('#infoPane').attr('data-infoId');
  var userId = $('.navProfile').attr('data-userId');
  var updatedTask;
  $('[data-input="assignTo"]').tokenInput(projectUsersList, {
    propertyToSearch: 'name email'
  , minChars: 0
  , animateDropdown: false
  , tokenLimit: 1
  , tokenValue: 'name'
  , prePopulate: assignee
  , preventDuplicates: true
  , resultsFormatter: function(item) { 
      html = '<li><div data-field="projectMember">' +
      '<div data-name="' + item.name + '" data-field="name">' + 
      item.name + '</div>' +
      '<div data-email="' + item.email + '" data-field="email">' + 
      item.email + '</div></div></li>';
      return html;
    }
  , tokenFormatter: function(item) {
      if(item) {
        html = '<li><div rel="tooltip" title="' + item.email + '" ' +
        'data-assigneeEmail="' + item.email + '" data-assigneeName="' +
        item.name + '">' + item.name + '</div></li>';
        return html;
      }
    }
  , onAdd: function() {
      $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
      .hide();
    }
  });
  $('[rel="tooltip"]').tooltip();
}

function validateNewUserForm() {
  var formFieldsArray = $('form[name="newUserSignUp"]').find('.control-group');
  var formLength = formFieldsArray.length;
  var successCount = 0;
  formFieldsArray.each(function() {
    if($(this).hasClass('success')) successCount++;
  });
  if(successCount === formLength) {
    $('form[name="newUserSignUp"]').find('#createUserSubmit')
    .removeAttr('disabled');
  }
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
      return 'Satuday'
      break;
  }
}

function renderDate(dateString) {
  if(dateString === null || dateString == 'null' || dateString == undefined || dateString == 'undefined') return '';
  else {
    var parsedDate = Date.parse(dateString);
    if(parsedDate === null) return dateString;
    else {
      var today = Date.today();
      var tomorrow = Date.today().add(1).days();
      var yesterday = Date.today().add(-1).days();
      var oneWeek = Date.today().add(7).days();
      if(today.compareTo(parsedDate) === 0) return 'Today';
      else if(tomorrow.compareTo(parsedDate) === 0) return 'Tomorrow';
      else if(yesterday.compareTo(parsedDate) === 0) {
        return '<span class="overdue">Yesterday</span>';
      }
      else if(parsedDate.between(today, oneWeek)) {
        return renderDay(parsedDate.getDay());
      }
      else if(today.compareTo(parsedDate) === 1) {
        return '<span class="overdue">' + dateString + '</span>';
      }
      else return dateString;
    }
  }
}

function calcDaysBetween(theDate) {
  var parsedDate = Date.parse(theDate);
  if(parsedDate === null) return null;
  else {
    var today = Date.today();
    var dayToday = today.getDayOfYear();
    var dayParsed = parsedDate.getDayOfYear();
    return dayParsed - dayToday;
  }
}

//render list of tasks
function renderTheTask(task, index) {
  var html = '';
  html += '<li class="projectTask';
  if(task.complete) html += ' complete';
  if(task.milestone) html += ' milestone';
  html += '" data-taskId="' + task._id + '">' +
    '<ul class="taskFields">' +
    '<li data-taskField="index" data-index="' + index + '">' +
    '<div>' +
    '<i class="icon-th-list" style="display: none;"></i>' +
    '<span>' + index + '</span>' +
    '</div></li>';
    if(task.assigned_to) {
      if(task.assigned_to.hasOwnProperty('email')) {
        html += '<li data-taskField="assignee" data-assignee="' + task.assigned_to.email +
        '"><div><a href="#" rel="tooltip" title="' + task.assigned_to.name + 
        '">' + getInitials(task.assigned_to.name) + '</a></div></li>';
      }
      else {
        html += '<li data-taskField="assignee" data-assignee=""><div>\u00A0' +
        '</div></li>';
      }
    }
    else {
      html += '<li data-taskField="assignee" data-assignee=""><div>\u00A0' +
      '</div></li>';
    }
    html += '<li data-taskField="checkbox">' +
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
  return html;
}

function renderTasks(taskList) {
  var html = '<ul class="unstyled" data-list="taskList">';
  for(var x=0; x<taskList.length; x++) {
    html += renderTheTask(taskList[x], x+1);
  }
  //html += '<li><input type="text" name="newTask" placeholder="New Task..."></li>';
  html += '</ul>';
  return html;
}

function renderTaskList(taskList, list, headerLabel) {
  var html = '<div class="taskList"';
  if(headerLabel) html += ' data-list="' + list + '"';
  html += '>';
  if(headerLabel) html += '<h3 class="lead">' + headerLabel + '</h3>';
  html += renderTasks(taskList) + '</div>';
  return html;
}

function renderProjectTitle(project) {
  var html = '<div class="projectInfo" data-projectId="' + project._id +
  '">' +
  '<input data-field="projectTitle" data-action="editProjectTitle" value="' +
  project.title + '"></div>' +
  '<div class="projectOptions"><ul>' +
  '<li class="optionLabel">Arrange By: </li>' +
  '<li class="optionBtn">' +
  '<button class="btn btn-mini" data-action="viewBy" ' +
  'data-view="priority">Priority</button></li> ' +
  '<li class="optionBtn">' +
  '<button class="btn btn-mini" data-action="viewBy" ' +
  'data-view="dueToday">Due Date</button></li> ' +
  '<li class="optionBtnEmbed dropdown pull-right">' +
  '<button class="btn dropdown-toggle" data-toggle="dropdown">' +
  '<i class="icon-cog"></i></button>' +
  '<ul class="dropdown-menu" data-for="projectOptionsNew">' +
  '<li><a href="#" data-toggle="modal" data-projectId="' + project._id +
  '" data-target="#deleteProject">Delete Project</a></li>' +
  '<!--<li><a href="#" data-toggle="modal" data-projectId="' + project._id +
  '" data-target="#inviteUserToProject">Invite Users</a></li>-->' +
  '</ul></li>' +
  '<li class="optionBtnEmbed dropdown pull-right">' +
  '<button class="btn dropdown-toggle" data-toggle="dropdown">' +
  'New <i class="icon-chevron-down"></i></button>' +
  '<ul class="dropdown-menu" data-for="projectOptionsNew">' +
  '<li><a href="#" data-action="newTask">New Task</a></li>' +
  '</ul></li></ul></div>';
  return html;
}

function displayInfoPane(bool, html) {
  if(!$('.mainPane').hasClass('span8')) $('.mainPane').toggleClass('span8');
  if($('.infoPane').hasClass('span4')) {
    if($('.infoPane').hasClass('hide')) {
      $('.infoPane').toggleClass('hide');
    }
  }
  else {
    $('.infoPane').toggleClass('span4');
    if($('.infoPane').hasClass('hide')) {
      $('.infoPane').toggleClass('hide');
    }
  }
  resizeTextarea();
}

function renderProjectInfo(project) {
  var html = '<div class="infoOptions" data-infoId="' + project._id + '">' +
    '<ul><li class="optionBtnEmbed pull-right">' +
    '<button class="btn" data-action="closeInfoPane">&times;</button></li>' +
    '<li class="optionBtnEmbed dropdown pull-right">' +
    '<button class="btn dropdown-toggle" data-toggle="dropdown">' +
    '<i class="icon-cog"></i>' +
    '<ul class="dropdown-menu">' +
    '<li><a href="#" data-toggle="modal" data-projectId="' + project._id +
    '" data-target="#deleteProject">' +
    'Delete Project' +
    '</a></li>' +
    '<!--<li><a href="#" data-toggle="modal" data-projectId="' + project._id +
    '" data-target="#inviteUserToProject">' +
    'Invite Users</a></li>--></ul></button></li></ul></div>' +
    '<div class="infoTitle">' +
    '<input data-target="' + project._id +
    '" data-action="displayProjectTitle" data-field="displayInfoTitle" ' +
    'value="' + project.title + '">' +
    '</div>' +
    '<div class="infoDetail">' +
    '<div><textarea data-type="notesDesc" data-field="projectDesc"' +
    ' placeholder="Description">';
    if(project.desc) html+= project.desc;
    html+= '</textarea><div id="textareaResize" contenteditable></div></div>' +
    '<div data-infoField="members"><dl><dt>Members</dt>' + '<dd><ul ' +
    'data-list="projectMembers">';
    for(var x=0; x<project.users.length; x++) {
      html+= '<li data-field="projectUser" rel="tooltip" title="' +
      project.users[x].email + '" data-userId="' + project.users[x]._id + 
      '">' + project.users[x].firstName + ' ' + project.users[x].lastName + 
      ' <a href="#" data-action="removeProjectMember" ' +
      'data-toggle="modal" data-target="#removeProjectMember" ' +
      'data-action="removeProjectMember"' + '>&times;</a></li>';
    }
    html += '<li data-toggle="modal" data-target="#inviteUserToProject">' +
    '<button class="btn btn-mini"><i class="icon-plus"></i></button>' +
    '</li></ul></dd></dl></div></div>';
  return html;
}

function renderTaskInfo(task) {
  var html = '<div class="infoOptions" data-infoId="' + task._id + '">' +
    '<ul><li class="optionBtn"><button class="btn btn-mini" ' +
    'data-action="taskComplete">' +
    'Mark Complete</button></li>' +
    '<li class="optionBtn dropdown">' +
    '<button class="btn btn-mini dropdown-toggle" data-toggle="dropdown">' +
    '<i class="icon-chevron-down"></i>' +
    '<ul class="dropdown-menu"><li>' +
    '<a href="#" data-action="toggleMilestone">';
    if(task.milestone) html += 'Un-Make Milestone';
    else html += 'Make Milestone';
    html += '</a></li></ul></button></li>' +
    '<li class="optionBtnEmbed pull-right">' +
    '<button class="btn" data-action="closeInfoPane">&times;</button></li>' +
    '<li class="optionBtnEmbed dropdown pull-right" ' +
    'data-infoId="' + task._id + '">' +
    '<button class="btn dropdown-toggle" data-toggle="dropdown">' +
    '<i class="icon-cog"></i>' +
    '<ul class="dropdown-menu">' +
    '<li><a href="#" data-target="' + task._id +
    '" data-action="deleteTask">' +
    'Delete Task' +
    '</a></li></ul></button></li></ul></div>' +
    '<div class="infoTitle">' +
    '<input data-target="' + task._id + '"' +
    ' data-field="displayInfoTitle"' +
    ' placeholder="(new task)" value="' + task.title + '">' +
    '</div>' +
    '<div class="infoDetail">' +
    '<div><textarea data-type="notesDesc" ' +
    'data-field="taskNotes" placeholder="Notes">';
    if(task.notes) html += task.notes;
    html += '</textarea><div id="textareaResize" contenteditable></div></div>' +
    '<dl>' +
    '<div data-infoField="taskAssignee"><dt>Assigned To:</dt>' +
    '<dd><span data-field="placeholder">assign to teammate</span>';
    if(task.assigned_to) {
      html += '<input type=text data-input="assignTo" style="display: none;">';
    }
    html += '<a href="#" class="btn btn-mini" data-action="assignTo">' +
    '<i class="icon-user"></i></a></dd></div>' +
    '<div data-infoField="taskDueDate"><dt>Due Date:</dt>' +
    '<dd><input class="input-small" data-field="taskDueDate" type="text" ';
    if(task.end_at) html += 'value="' + task.end_at + '"';
    html += '></dd></div></dl></div>';
    /*
    '<div data-infoField="taskTags">' +
    '<dt>Tags:</dt><dd><ul class="unstyled" data-list="taskTags">';
    for(var x=0; x<task.tags.length; x++) {
      html += '<li data-field="tag"><span class="badge badge-info">' +
      task.tags[x] +
      '</span></li>'
    }
    html += '<li><a href="#" data-action="addTag" class="btn btn-mini">' +
    '<i class="icon-plus"></i></a></li>' +
    '</ul></dd></div>' +
    '<div class="infoStreamOptions"><ul class="unstyled">' +
    '<li class="streamOption">Activity</li>' +
    '<li class="streamOption">Related</li>' +
    '</ul></div>' +
    '<div class="infoStream"></div>' +
    '</div>';
    */
  return html;
}

function getGroups() {
  var groupList = [];
  $('[data-navField="group"]').each(function(index) {
    groupList.push({
      'title': $(this).children('span').text()
    , 'id': $(this).attr('data-groupId')
    });
  });
  return groupList;
}

function renderInvite(invite_by, target, invite_to, invite) {
  var groupList = getGroups();
  var html = '';
  html += '<div class="alert alert-info fade in">' +
  '<a class="close" href="#" data-dismiss="alert">x</a>' +
  'Received invite from ' + invite_by.email +
  ' to join the ' + target +
  ' ' + invite_to.title + '.' + '<p>' +
  '<select data-action="addToGroup" data-field="group">';
  for(var x=0; x<groupList.length; x++) {
    html += '<option ';
    if(groupList[x].title == 'Personal') html+= 'selected';
    html += ' value="' + groupList[x].id + '">' +
    groupList[x].title + '</option>';
  }
  html += '</select></p>' + '<p>' +
  '<a class="btn" href="#" data-dismiss="alert" data-inviteBy="' +
  invite_by._id +'" data-target="' + target + '" data-inviteTo="' +
  invite_to + ' data-inviteId="' + invite._id +
  '" data-action="declineInvite">' + 'Decline</a>' +
  '<a class="btn btn-primary" data-dismiss="alert"' +
  ' data-action="acceptInvite" data-inviteBy="' +
  invite_by._id + '" data-target="' + target + '" data-inviteTo="' +
  invite_to + '" data-inviteId="' + invite._id +'" href="#">' +
  'Accept</a>' +
  '</p>' +
  '</div>';
  return html;
}

function updateInviteList(invite_by, target, invite_to, invite) {
  var html = '<li data-inviteId="' + invite._id + '"></li>';
  var $inviteModal = $('#myInvites');
  $inviteModal.find('#receivedInvites').append(
    html
  );
}

function resizeTextarea() {
  var text = $('#infoPane').find('textarea[data-type="notesDesc"]').val();
  $('#infoPane').find('#textareaResize').html(text);
  var newHeight = $('#infoPane').find('div#textareaResize').height();
  $('#infoPane').find('textarea[data-type="notesDesc"]')
  .css('height', newHeight * 2);
}

function renderViewByDue(taskList) {
  var dueToday = []
    , dueTomorrow = []
    , dueLater = []
    , noDate = []
    , pastDue = []
    , complete = [];
  for(var x=0; x<taskList.length; x++) {
    var task = taskList[x]
      , taskDate = task.end_at
    var daysBetween = calcDaysBetween(taskDate);
    if(task.complete) {
      complete.push(task);
      continue;
    }
    if(daysBetween == 0 || taskDate == 'Today') dueToday.push(task);
    else if(daysBetween == 1 || taskDate == 'Tomorrow') dueTomorrow.push(task);
    else if(daysBetween > 1 || taskDate == 'Later') dueLater.push(task);
    else if((daysBetween < 0 || taskDate == 'Overdue') && !task.complete) pastDue.push(task);
    else if(
    isNaN(daysBetween) || 
    daysBetween === null || 
    daysBetween == 'null') noDate.push(task);
  }
  //$('.mainPane').append(renderTaskList(pastDue, 'Overdue', 'Backlog:'));
  var completeAndDue = complete.concat(pastDue);
  if(completeAndDue.length > 0) {
    $('.mainPane').append(renderTaskList(completeAndDue, null, null));
  }
  $('.mainPane').append(renderTaskList(dueToday, 'Today', 'Today:'));
  $('.mainPane').append(renderTaskList(dueTomorrow, 'Tomorrow', 'Tomorrow:'));
  $('.mainPane').append(renderTaskList(dueLater, 'Later', 'Later:'));
  $('.mainPane').append(renderTaskList(noDate, 'noDate', 'No Due Date:'));
}

function updateTaskOrder() {
  var userId = $('.navProfile').attr('data-userId');
  var projectId = $('.projectInfo').attr('data-projectId');
  $('.taskList').each(function(listIndex) {
    var targetTaskList = [];
    target = $(this).attr('data-list');
    $(this).find('.projectTask').each(function(taskIndex) {
      taskIndex += 1;
      targetTaskList.push($(this).attr('data-taskId'));
      $(this).find('[data-taskField="index"]').attr('data-index', taskIndex);
      $(this).find('[data-taskField="index"]').children('div').children('span')
      .html(taskIndex);
    });
    var taskListHtml = $(this).html();
    socket.emit('taskReorder', taskListHtml, target, userId, projectId);
  });
}

function saveTaskOrder() {
  var newTaskList = [];
  var userId = $('.navProfile').attr('data-userId');
  var projectId = $('.projectInfo').attr('data-projectId');
  $('.taskList').each(function(listIndex) {
    var targetTaskList = [];
    $(this).find('.projectTask').each(function(taskIndex) {
      taskIndex += 1;
      targetTaskList.push($(this).attr('data-taskId'));
      $(this).find('[data-taskField="index"]').attr('data-index', taskIndex);
      $(this).find('[data-taskField="index"]').children('div').children('span')
      .html(taskIndex);
    });
    var taskListHtml = $(this).html();
    newTaskList = newTaskList.concat(targetTaskList);
  });
  socket.emit('saveTaskOrder', newTaskList, userId, projectId);
}

function updateTaskDue(task) {
  var oneDay = 24*60*60*1000;
  var newDue = $(task).parents('.taskList').attr('data-list');
  var newDueDate = new Date().clearTime();
  if(newDue == 'Today') {
    var tempDate = newDueDate.toLocaleDateString();
    tempDateList = tempDate.split(', ');
    newDueDate = tempDateList[1] + ', ' + tempDateList[2];
  }
  else if(newDue == 'Tomorrow') {
    var tempDate = Date.parse('Tomorrow');
    tempDate = tempDate.toLocaleDateString();
    tempDateList = tempDate.split(', ');
    newDueDate = tempDateList[1] + ', ' + tempDateList[2];
  }
  else if(newDue == 'Later') newDueDate = newDue;
  else if(newDue == 'noDate') newDueDate = null;
  var updatedTask = { 'end_at': newDueDate };
  var userId = $('.navProfile').attr('data-userId');
  var taskId = $(task).attr('data-taskId');
  var projectId = $('.projectInfo').attr('data-projectId');
  socket.emit('updateTask', taskId, updatedTask, userId, projectId);
}

function checkIfSubtask(task) {
  var userId = $('.navProfile').attr('data-userId');
  var taskId = $(task).attr('data-taskId');
  var projectId = $('.projectInfo').attr('data-projectId');
  var updatedTask, milestoneId, subtasks, subtaskId, subtaskIds = []
    , prevTaskId, prevTaskIds = [], prev, prevTasks = [], prevMilestone
    , prevMilestoneId;
  if(!$(task).hasClass('milestone')) {
    //checks if sorted is a task, then sets new parent milestone
    //or null if no parent milestone
    while(task.length !== 0 && !task.hasClass('milestone')) {
      task = $(task).prev();
    }
    if(task.length === 0) {
      updatedTask = { 'parent': null };
      socket.emit('updateTask', taskId, updatedTask, userId, projectId);
    }
    else {
      milestoneId = task.attr('data-taskId');
      updatedTask = { 'parent': milestoneId };
      socket.emit('updateTask', taskId, updatedTask, userId, projectId);
    }
  }
  else if($(task).hasClass('milestone')) {
    //if sorted is a milestone, then sets all following tasks to current
    //milestone until next milestone
    milestoneId = $(task).attr('data-taskId');
    subtasks = $(task).nextUntil('.milestone');
    for(var x=0; x<subtasks.length; x++) {
      subtaskId = $(subtasks[x]).attr('data-taskId');
      subtaskIds.push(subtaskId);
    }
    socket.emit('setSubtasks', milestoneId, subtaskIds, userId, projectId);
    //set all preceding tasks to new parent milestone or null if none
    prev = $(task).prev();
    while(prev.length !== 0 && !prev.hasClass('milestone')) {
      prevTasks.push(prev[0]);
      prev = prev.prev();
    }
    if(prev.hasClass('milestone')) prevMilestoneId = prev.attr('data-taskId');
    else prevMilestoneId = null;
    for(var y=0; y<prevTasks.length; y++) {
      prevTaskId = $(prevTasks[y]).attr('data-taskId');
      prevTaskIds.push(prevTaskId);
    }
    socket.emit('setSubtasks', prevMilestoneId, prevTaskIds, userId, projectId);
  }
}

function initiateSortable() {
  $('ul[data-list="taskList"]').sortable({
    connectWith:        '[data-list="taskList"]'
  , stop:             function(event, ui) {
                        updateTaskOrder();
                        saveTaskOrder();
                      }
  , receive:          function(event, ui) {
                        updateTaskDue(ui.item);
                        updateTaskOrder();
                      }
  , update:          function(event, ui) {
                        checkIfSubtask(ui.item);
                        updateTaskOrder();
                        saveTaskOrder();
                      }
  });
}

socket.on('connect', function() {
  var userId = $('.navProfile').attr('data-userId');
  var projectId = $('.projectInfo').attr('data-projectId');
  //--ACTIONS
  if(typeof(userId) !== 'undefined' && typeof(userId) !== undefined) {
    socket.emit('userLoggedIn', userId);
  }
  if(typeof(projectId) !== 'undefined' && typeof(projectId) !== undefined) {
    socket.emit('joinProject', userId, projectId);
  }
  $(window)
  .resize(function() {
    //console.log($(window).height());
    //console.log('nav: ' + $('.nav').height());
  });
  $(document)
  //update profile
  .on('click', '[data-action="updateProfile"]', function() {
    var updatedProfile = {};
    var profileInfo = $('[data-for="profile"]').serializeArray();
    jQuery.map(profileInfo, function(index, element) {
      updatedProfile[index['name']] = index['value'];
    });
    socket.emit('updateProfile', userId, updatedProfile);
  })
  //select task on click
  .on('click', '.projectTask', function() {
    selectedTaskId = $(this).attr('data-taskId');
    if(!$('.infoPane').hasClass('hide')) {
      socket.emit('loadTask', selectedTaskId);
    }
  })
  //mouse over highlight project task
  .on('mouseover', '.projectTask', function() {
    $(this).find('[data-action="displayTask"]').show();
    $(this).find('[data-action="taskComplete"]').show();
    $(this).find('[data-taskField="index"]').children('div').children('span')
    .hide();
    $(this).find('.icon-th-list').show();
  })
  .on('mouseout', '.projectTask', function() {
    $(this).find('[data-action="displayTask"]').hide();
    $(this).find('[data-action="taskComplete"]').hide();
    $(this).find('[data-taskField="index"]').children('div').children('span')
    .show();
    $(this).find('.icon-th-list').hide();
  })
  //mouse over highlight info detail fields
  .on('mouseover', '[data-infoField="taskAssignee"]', function() {
    $(this).find('input').toggleClass('hover');
  })
  .on('mouseout', '[data-infoField="taskAssignee"]', function() {
    $(this).find('input').toggleClass('hover');
  })
  .on('mouseover', '[data-infoField="taskDueDate"]', function() {
    $(this).find('input').toggleClass('hover');
  })
  .on('mouseout', '[data-infoField="taskDueDate"]', function() {
    $(this).find('input').toggleClass('hover');
  })
  //authenticate new user form
  .on('blur', '#newUser_firstName', function() {
    if($(this).val() != '' && $('#newUser_lastName').val() != '') {
      if(!$(this).parents('.control-group').hasClass('success')) {
        $(this).parents('.control-group').removeClass('error');
        $(this).parents('.control-group').addClass('success');
      }
    }
    else {
      $(this).parents('.control-group').removeClass('success');
      $(this).parents('.control-group').addClass('error');
    }
    validateNewUserForm();
  })
  .on('blur', '#newUser_lastName', function() {
    if($(this).val() != '' && $('#newUser_firstName').val() != '') {
      if(!$(this).parents('.control-group').hasClass('success')) {
        $(this).parents('.control-group').removeClass('error');
        $(this).parents('.control-group').addClass('success');
      }
    }
    else {
      $(this).parents('.control-group').removeClass('success');
      $(this).parents('.control-group').addClass('error');
    }
    validateNewUserForm();
  })
  .on('blur', '#newUser_email', function() {
    var newUserEmail = $(this).val();
    if(emailReg.test(newUserEmail) && newUserEmail != '') {
      socket.emit('validateNewUserEmail', newUserEmail);
    }
    else {
      $(this).parents('.control-group').removeClass('success');
      $(this).parents('.control-group').addClass('error');
      if($(this).next().is('.help-block')) {
        $(this).after(
          '<p class="help-block">Please enter a valid email address.</p>'
        );
      }
    }
    validateNewUserForm();
  })
  .on('blur', '#newUser_pw', function() {
    var pw = $(this).val();
    var pwConfirm = $('#newUser_pwConfirm').val();
    if(!pw == '') {
      if(pw === pwConfirm) {
        $(this).parents('.control-group').removeClass('error');
        $(this).parents('.control-group').addClass('success');
        $(this).next().next('.help-block').remove();
      }
      else {
        $(this).parents('.control-group').removeClass('success');
        $(this).parents('.control-group').addClass('error');
        if(!$(this).next().next().is('.help-block')) {
          $(this).next().after(
            '<p class="help-block">Passwords don\'t match!</p>'
          );
        }
      }
    }
    validateNewUserForm();
  })
  .on('blur', '#newUser_pwConfirm', function() {
    var pw = $('#newUser_pw').val();
    var pwConfirm = $(this).val();
    if(!pw == '') {
      if(pw === pwConfirm) {
        $(this).parents('.control-group').removeClass('error');
        $(this).parents('.control-group').addClass('success');
        $(this).next('.help-block').remove();
      }
      else {
        $(this).parents('.control-group').removeClass('success');
        $(this).parents('.control-group').addClass('error');
        if(!$(this).next().is('.help-block')) {
          $(this).after(
            '<p class="help-block">Passwords don\'t match!</p>'
          );
        }
      }
    }
    validateNewUserForm();
  })
  .on('blur', '#inviteCode', function() {
    var inviteCode = $(this).val();
    socket.emit('validateInviteCode', inviteCode);
  })
  //add new task
  .on('keypress', '.projectTask', function(e) {
    if(e.which == 13) {
      var newTask = { 'title' : '' };
      var projectId = $('.projectInfo').attr('data-projectId');
      var due = $(this).parents('.taskList').attr('data-list');
      if(due) newTask.end_at = due;
      socket.emit('newTask', projectId, userId, newTask, selectedTaskId);
    }
  })
  .on('mouseup', '[data-action="newTask"]', function() {
    var projectId = $('.projectInfo').attr('data-projectId');
    var newTask = { 'title' : '' };
    selectedTaskId = null;
    socket.emit('newTask', projectId, userId, newTask, selectedTaskId);
  })
  //add new milestone
  .on('mouseup', '[data-action="newMilestone"]', function() {
    var projectId = $('.projectInfo').attr('data-projectId');
    var newTask = { 'title': '', 'milestone': 'true' };
    selectedTaskId = null;
    socket.emit('newTask', projectId, userId, newTask, selectedTaskId);
  })
  //toggle milestone
  .on('mouseup', '[data-action="toggleMilestone"]', function() {
    var taskId = $(this).parents('#infoPane').attr('data-infoId');
    var checkMilestone = $('.projectTask[data-taskId="' + taskId + '"]')
                        .hasClass('milestone');
    var milestone = !checkMilestone;
    var updatedTask = { 'milestone': milestone };
    var projectId = $('.projectInfo').attr('data-projectId');
    var subtasks = $('.projectTask[data-taskId="' + taskId + '"]')
                    .nextUntil('.milestone');
    var subtaskIds = [];
    for(var x=0; x<subtasks.length; x++) {
      var subId = $(subtasks[x]).attr('data-taskId');
      subtaskIds.push(subId);
    }
    //socket.emit('updateTask', taskId, updatedTask, userId, projectId);
    socket.emit('toggleMilestone', taskId, subtaskIds, userId, projectId);
  })
  //show task info
  .on('click', '[data-action="displayTask"]', function() {
    var taskId = $(this).parents('.projectTask').attr('data-taskId');
    //console.log(taskId);
    socket.emit('loadTask', taskId);
  })
  .on('focus', 'input[data-taskId]', function() {
    var taskId = $(this).parents('.projectTask').attr('data-taskId');
    if(!$('.infoPane').hasClass('hide')) {
      socket.emit('loadTask', taskId);
    }
  })
  //delete task
  .on('mouseup keypress', '[data-action="deleteTask"]', function() {
    var taskId = $(this).attr('data-target');
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('deleteTask', taskId, projectId, userId);
  })
  //mark task as complete
  .on('change', 'input[data-action="taskComplete"]', function() {
    var taskId = $(this).parents('.projectTask').attr('data-taskId');
    var checked = $(this).attr('checked');
    var projectId = $('.projectInfo').attr('data-projectId');
    if(checked == 'checked' || checked === true) {
      socket.emit('taskComplete', taskId, userId, projectId);
    }
    else {
      socket.emit('taskNotComplete', taskId, userId, projectId);
    }
    //$(this).parent('fieldset').toggleClass('success');
  })
  .on('click', '.btn[data-action="taskComplete"]', function() {
    var taskId = $(this).parents('.infoOptions').attr('data-infoId');
    var projectId = $('.projectInfo').attr('data-projectId');
    var checked = $('.projectTask[data-taskId="' + taskId + '"]')
                  .find('input[data-action="taskComplete"]')
                  .attr('checked');
    if(checked == 'checked' || checked === true) {
      socket.emit('taskNotComplete', taskId, userId, projectId);
    }
    else {
      socket.emit('taskComplete', taskId, userId, projectId);
    }
  })
  //mark task as priority
  .on('click', 'btn[data-action="priority"]', function() {
    var taskId = $(this).parents('.infoOptions').attr('data-infoId');
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('setPriority', taskId, userId, projectId);
  })
  //real-time update task info
  .on('keyup', 'input[data-field="taskTitle"]', function() {
    var taskTitle = $(this);
    $('input[data-field="displayInfoTitle"]').val(function(index, val) {
      return taskTitle.val();
    });
    if(taskTitle.parents('.projectTask').hasClass('milestone')) {
      var resizer = taskTitle.next();
      resizer.html(taskTitle.val());
      taskTitle.width(resizer.width());
      taskTitle.parents('.projectTask').width(resizer.width() + 100);
    }
  })
  .on('keyup', 'input[data-field="displayInfoTitle"]', function() {
    var taskTitle = $(this).val();
    var taskId = $(this).attr('data-target');
    $('input[data-taskId="' + taskId + '"]').val(function(index, val) {
      return taskTitle;
    });
  })
  //update task if info changes
  .on('change', 'input[data-field="taskTitle"]', function() {
    //console.log($(this).val());
    var taskId = $(this).attr('data-taskId');
    var updatedTitle = $(this).val();
    var updatedTask = { 'title': updatedTitle };
    var projectId = $('.projectInfo').attr('data-projectId');
    //console.log(updatedTask);
    socket.emit('updateTask', taskId, updatedTask, userId, projectId);
  })
  .on('change', 'input[data-action="displayTask"]', function() {
    var updatedTitle = $(this).val();
    var taskId = $(this).attr('data-target');
    var updatedTask = { 'title': updatedTitle };
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('updateTask', taskId, updatedTask, userId, projectId);
  })
  .on('change', 'input[data-field="taskDueDate"]', function() {
    var taskDueDate = $(this).val();
    var taskId = $(this).parents('#infoPane').attr('data-infoId');
    var updatedTask = { 'end_at': taskDueDate };
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('updateTask', taskId, updatedTask, userId, projectId);
  })
  .on('click keydown', '[data-action="assignTo"]', function() {
    var el = $('.token-input-token');
    if(isInDocument(el[0])) {
      var $assigneeNode = $('[data-assigneeEmail]');
      var $parentNode = $assigneeNode.parent().parent('.token-input-list');
      var assignee = $assigneeNode.text();
      var name = $assigneeNode.attr('data-assigneeName');
      var email = $assigneeNode.attr('data-assigneeEmail');
      tempAssignee = { name: name, email: email };
      $parentNode.find('#token-input-').next().html(assignee);
      $parentNode.find('#token-input-').width($parentNode.find('#token-input-').next().width() + 30);
      $parentNode.find('#token-input-').val(assignee);
      $('[data-input="assignTo"]').tokenInput('clear');
    }
    else {
      var checkAssign = $('[data-input="assignTo"]');
      if(!isInDocument(checkAssign[0])) {
        $(this).before(
          '<input type="text" data-input="assignTo">'
        );
      }
      var checkList = $('.token-input-list');
      if(isInDocument(checkList[0])) {
        $('.token-input-list').remove();
        $('#token-input-').remove();
        $('.token-input-dropdown').remove();
      }
      initiateTaskAssigneeToken();
      $(this).prev().focus();
    }
    $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
    .hide();
  })
  .on('blur', '#token-input-', function() {
    var val = $(this).val();
    if(val !== '') {
      var current = $('.token-input-dropdown')
      .find('[data-name="' + val + '"]');
      if(current.length > 0) {
        var name = current.attr('data-name');
        var email = current.next().attr('data-email');
        var temp = { name: name, email: email };
        $('[data-input="assignTo"]').tokenInput('add', temp);
      }
      else {
        $(this).hide();
        document.activeElement.blur();
      }
    }
    else if(val == '') {
      if(tempAssignee) {
        if(tempAssignee.hasOwnProperty('email')) {
          $('[data-input="assignTo"]').tokenInput('add', tempAssignee);
          $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
          .hide();
        }
        else {
          $(this).hide();
          document.activeElement.blur();
          $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
          .show();
        }
      }
      else {
        $(this).hide();
        document.activeElement.blur();
        $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
        .show();
      }
    }
  })
  .on('mousedown keydown', '[data-field="projectMember"]', function() {
    var projectId = $('.projectInfo').attr('data-projectId');
    var taskId = $('#infoPane').attr('data-infoId');
    var userId = $('.navProfile').attr('data-userId');
    var updatedTask;
    var name = $('[data-infoField="taskAssignee"]')
    .find('li.token-input-token').children('div').attr('data-assigneeName');
    var email = $('[data-infoField="taskAssignee"]')
    .find('li.token-input-token').children('div')
    .attr('data-assigneeEmail');
    var newAssignee = { name: name, email: email };
    tempAssignee = newAssignee;
    updatedTask = { assigned_to: newAssignee };
    $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
    .hide();
    socket.emit('updateTask', taskId, updatedTask, userId, projectId);
  })
  .on('mousedown', '.token-input-delete-token', function() {
    var projectId = $('.projectInfo').attr('data-projectId');
    var taskId = $('#infoPane').attr('data-infoId');
    var userId = $('.navProfile').attr('data-userId');
    var updatedTask;
    tempAssignee = {};
    updatedTask = { assigned_to: null };
    socket.emit('updateTask', taskId, updatedTask, userId, projectId);
  })
  /*
  .on('change', 'input[data-field="taskAssignee"]', function() {
    var taskAssignee;
    if($(this).attr('data-assignee')) taskAssignee = $(this).attr('data-assignee');
    else taskAssignee = $(this).val();
    var taskId = $(this).parents('#infoPane').attr('data-infoId');
    var updatedTask = { 'assigned_to': { 'email': taskAssignee }};
    var projectId = $('.projectInfo').attr('data-projectId');
    if((taskAssignee.indexOf('@')!==-1)
    && (taskAssignee.indexOf('.com')!==-1)) {
      socket.emit('updateTask', taskId, updatedTask, userId, projectId);
    }
  })
  */
  .on('change', '[data-field="taskNotes"]', function() {
    var taskNotes = $(this).val();
    var taskId = $(this).parents('#infoPane').attr('data-infoId');
    var updatedTask = { 'notes': taskNotes };
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('updateTask', taskId, updatedTask, userId, projectId);
  })
  //add tags to task
  .on('click', '[data-action="addTag"]', function() {
    $(this).parent('li').before(
      '<li><input type="text" data-input="tag" class="input-small"></li>'
    );
  })
  .on('change', '[data-input="tag"]', function() {
    var projectId = $('.projectInfo').attr('data-projectId');
    var targetId = $(this).parents('#infoPane').attr('data-infoId');
    var tag = $(this).val();
    if(projectId == targetId) {
      socket.emit('addProjectTag', userId, targetId, tag);
    }
    else socket.emit('addTaskTag', userId, targetId, tag);
  })
  //real-time update project info
  .on('keyup', 'input[data-field="projectTitle"]', function() {
    var projectTitle = $(this).val();
    if(!$('.infoPane').hasClass('hide')) {
      $('input[data-action="displayProjectTitle"]').val(function(index, val) {
        return projectTitle;
      });
    }
  })
  .on('keyup', 'input[data-action="displayProjectTitle"]', function() {
    var projectTitle = $(this).val();
    var projectId = $(this).attr('data-target');
    $('input[data-field="projectTitle"]').val(function(index, val) {
      return projectTitle;
    });
  })
  //update project if info changes
  .on('change', 'input[data-field="projectTitle"]', function() {
    var updatedTitle = $(this).val();
    var projectId = $(this).parents('.projectInfo').attr('data-projectId');
    var updatedProject = { 'title': updatedTitle };
    socket.emit('updateProject', projectId, updatedProject, userId);
  })
  .on('change', 'input[data-action="displayProjectTitle"]', function() {
    var updatedTitle = $(this).val();
    var projectId = $(this).parents('#infoPane').attr('data-infoId');
    var updatedProject = { 'title': updatedTitle };
    socket.emit('updateProject', projectId, updatedProject, userId);
  })
  .on('change', '[data-field="projectDesc"]', function() {
    var updatedDesc = $(this).val();
    var projectId = $(this).parents('#infoPane').attr('data-infoId');
    var updatedProject = { 'desc': updatedDesc };
    socket.emit('updateProject', projectId, updatedProject, userId);
  })
  //new project
  .on('click', 'button[data-action="newProject"]', function() {
    var groupId = $(this).attr('data-groupId');
    socket.emit('newProject', groupId, userId);
  })
  //remove project member
  .on('click', '[data-action="removeProjectMember"]', function() {
    var textName = $(this).parent('[data-field="projectUser"]').text();
    var strLen = textName.length;
    var userName = textName.substr(0, strLen - 2);
    var targetEmail = $(this).parent('[data-field="projectUser"]')
                  .attr('data-original-title');
    $('#removeProjectMember').find('[data-field="projectMember"]')
    .html(userName);
    $('#removeProjectMember')
    .find('[data-action="confirmRemoveProjectMember"]')
    .attr('data-userEmail', targetEmail);
  })
  .on('click', '[data-action="confirmRemoveProjectMember"]', function() {
    var projectId = $('.projectInfo').attr('data-projectId');
    var targetEmail = $(this).attr('data-userEmail');
    socket.emit('removeProjectMember', userId, projectId, targetEmail);
  })
  //delete project
  .on('mouseup keypress', '[data-target="#deleteProject"]', function() {
    var projectId = $(this).attr('data-projectId');
    $('a[data-action="deleteProject"]').attr('data-projectId', projectId);
  })
  .on('click', '[data-action="deleteProject"]', function() {
    var projectId = $(this).attr('data-projectId');
    //console.log(projectId);
    socket.emit('deleteProject', projectId, userId);
  })
  //load project
  .on('click', '.navProject', function() {
    //$(this).parent().addClass('active');
    var projectId = $(this).attr('data-projectId');
    //var projectTitle = $(this).attr('data-projectTitle');
    socket.emit('loadProject', projectId);
  })
  //show project info
  .on('focus', '.projectInfo', function() {
    var projectId = $(this).attr('data-projectId');
    socket.emit('getCachedProject', projectId);
  })
  //real-time adjust height of textarea desc and notes
  .on('keyup', '[data-type="notesDesc"]', function() {
    resizeTextarea();
  })
  //hide info pane
  .on('click', '[data-action="closeInfoPane"]', function() {
    if(!$('.infoPane').hasClass('hide')) {
      if($('.mainPane').hasClass('span8')) {
        $('.mainPane').toggleClass('span8');
      }
      $('.infoPane').toggleClass('hide');
    }
  }) 
  //new group
  .on('click', '[data-action="newGroup"]', function() {
    var groupTitle = $('input[data-field="groupTitle"]').val();
    $('input[data-field="groupTitle"]').val('');
    var groupType = $('select[data-field="groupType"]').val();
    $('select[data-field="groupType"]').val('');
    socket.emit('newGroup', userId, groupTitle, groupType);
  })
  //delete group
  .on('mouseup keypress', '[data-action="removeFromGroup"]', function() {
    var groupId = $(this).parents('[data-navField="group"]')
                  .attr('data-groupId');
    socket.emit('removeFromGroup', userId, groupId);
  })
  //view by +priority +dueToday
  .on('click', '[data-action="viewBy"]', function() {
    var viewOption = $(this).attr('data-view');
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('changeView', viewOption, projectId);
  })
  //invite existing connection
  .on('click', '[data-action="inviteConnection"]', function() {
    var connectionEmail = $(this).parent().attr('data-connectionEmail');
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('inviteUsers', userId, 'Project', projectId, connectionEmail);
  })
  //send invite to user
  .on('blur', '[data-field="inviteeEmail"]', function() {
    var targetEmail = $(this).val();
    var remainingInvites = Number($('[data-field="invitesRemaining"]').html());
    if(emailReg.test(targetEmail) && targetEmail != '' && remainingInvites > 0) {
      $('[data-action="sendInviteCode"]').removeAttr('disabled');
    }
  })
  .on('click', '[data-action="sendInviteCode"]', function() {
    var projectId = $('.projectInfo').attr('data-projectId');
    var targetEmail = $('[data-field="inviteeEmail"]').val();
    var modal = $(this).parents('.modal');
    if(modal.is('#myConnections')) {
      socket.emit('sendInviteCode', userId, null, null, targetEmail);
    }
    else if(modal.is('#inviteUserToProject')) {
      socket.emit('sendInviteCode', userId, 'Project', projectId, targetEmail);
    }
  })
  //update invite quota
  .on('click', '[data-target="#inviteUserToProject"]', function() {
    socket.emit('getInviteQuota', userId);
  })
  .on('click', '[data-target="#myConnections"]', function() {
    socket.emit('getInviteQuota', userId);
  })
  //decline invite to project or group
  .on('click', '[data-action="declineInvite"]', function() {
    var inviteId = $(this).attr('data-inviteId');
    var projectId = $('.projectInfo').attr('data-projectId');
    socket.emit('declineInvite', userId, projectId, inviteId);
  })
  //accept invite to project or group
  .on('click', '[data-action="acceptInvite"]', function() {
    var inviteId = $(this).attr('data-inviteId');
    var groupId = $('[data-action="addToGroup"]').val();
    socket.emit('acceptInvite', userId, inviteId, groupId);
  })
  //load user dashboard
  .on('click', '[data-action="loadUserDashboard"]', function() {
    socket.emit('loadUserDashboard', userId);
  })
  .ready(function() {
    initiateUX();
    var taskId = $.getUrlVar('tid');
    if(taskId) {
      if(taskId.indexOf('#') > -1) {
        taskId = taskId.slice(0, taskId.indexOf('#'));
      }
      socket.emit('getTaskAssignee', taskId);
    }
    else {
      initiateTaskAssigneeToken();
    }
    if(!$('#newUser_email').val() == '') {
      $('#newUser_email').blur();
    }
    if(!$('#inviteCode').val() == '') {
      $('#inviteCode').blur();
    }
  });
});

//--RESPONSE
//show current task assignee
socket.on('gotTaskAssignee', function(task) {
  if(task.assigned_to) {
    if(task.assigned_to.hasOwnProperty('email')) {
      initiateTaskAssigneeToken([task.assigned_to]);
      $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
      .hide();
    }
    else {
      initiateTaskAssigneeToken();
    }
  }
  else initiateTaskAssigneeToken();
});

//update invite quota
socket.on('updateInviteQuota', function(count, limit) {
  var remaining = limit - count;
  $('[data-field="invitesRemaining"]').html(remaining);
});

//validate new user email
socket.on('validNewUserEmail', function(validBool) {
  if(validBool) {
    $('#newUser_email').parents('.control-group').removeClass('success');
    $('#newUser_email').parents('.control-group').addClass('error');
    if(!$('#newUser_email').next().is('.help-block')) {
      $('#newUser_email').after(
        '<p class="help-block">An account with this email already exists!</p>'
      );
    }
  }
  else {
    $('#newUser_email').next('.help-block').remove();
    $('#newUser_email').parents('.control-group').removeClass('error');
    $('#newUser_email').parents('.control-group').addClass('success');
  }
  validateNewUserForm();
});

//validate invite code
socket.on('validInviteCode', function(validBool) {
  if(validBool) {
    $('#inviteCode').parents('.control-group').removeClass('error');
    $('#inviteCode').parents('.control-group').addClass('success');
    $('#inviteCode').next('.help-block').remove();
  }
  else {
    $('#inviteCode').parents('.control-group').removeClass('success');
    $('#inviteCode').parents('.control-group').addClass('error');
    if(!$('#inviteCode').next().is('.help-block')) {
      $('#inviteCode').after(
        '<p class="help-block">Invalid invite code!</p>'
      );
    }
  }
  validateNewUserForm();
});

//render new task list order
socket.on('taskReordered', function(taskHtml, targetList, userId) {
  var intendedTarget = $('.taskList').attr('data-list');
  if(targetList) {
    if(intendedTarget) {
      $('.taskList[data-list="' + intendedTarget + '"]').html(taskHtml);
    }
  }
  else {
    $('.taskList').html(taskHtml);
  }
  initiateUX();
});

//render task list with new view option
socket.on('changedView', function(viewOption, newTaskList) {
  $('.taskList').remove();
  if(viewOption == 'dueToday') renderViewByDue(newTaskList);
  else if(viewOption == 'priority') $('.mainPane').append(renderTaskList(newTaskList));
  initiateUX();
});

//notify user that invites were sent
socket.on('sentInvites', function(target, targetUsers, inviteId) {
  html = '<li data-inviteId="' + inviteId + '">' + '<span>' + target + 
  '</span>' + '<a class="btn" href="#" data-inviteId="' + inviteId + 
  '" data-action="declineInvite">Cancel</a></li>';
  $('[data-list="sentInvites"]').append(html);
  var countString = $('[data-field="inviteCount"]').html();
  var count = Number(countString);
  count++;
  $('[data-field="inviteCount"]').html(count);
});

//notify user of an invitation
socket.on('receivedInvite', function(invite_by, target, invite_to, invite) {
  $('.mainPane').prepend(
    renderInvite(invite_by, target, invite_to, invite)
  );
  var groupList = getGroups();
  html = '<li data-inviteId="' + invite._id + '">' +
  '<span>' + invite_to.title + '</span>' +
  '<select data-action="addToGroup" data-field="group">';
  for(var x=0; x<groupList.length; x++) {
    html += '<option ';
    if(groupList[x].title == 'Personal') html+= 'selected';
    html += ' value="' + groupList[x].id + '">' +
    groupList[x].title + '</option>';
  }
  html += '</select>' + 
  '<a class="btn" href="#" data-inviteId="' + invite._id + 
  '" data-action="declineInvite">Decline</a>' +
  '<a class="btn btn-primary" href="#" data-inviteId="' + invite._id +
  '" data-action="acceptInvite">Accept</a></li>';
  $('[data-list="receivedInvites"]').append(html);
  var countString = $('[data-field="inviteCount"]').html();
  var count = Number(countString);
  count++;
  $('[data-field="inviteCount"]').html(count);
});

//update nav with accepted invite group or project
socket.on('acceptedProjectInvite', function(groupId, project) {
  $('.navGroupProjects[data-groupId="' + groupId + '"]')
  .find('.groupActions').before(
    '<li class="groupProject"><a href="#" data-projectId="' + project._id +
    '" class="navProject">' +
    project.title + '</a></li>'
  );
});

//user joined project
socket.on('userJoinedProject', function(userId, inviteId) {
  $('[data-inviteId="' + inviteId + '"]').remove();
});

//user declined invite
socket.on('declinedInvite', function(userId, inviteId) {
  $('[data-inviteId="' + inviteId + '"]').remove();
  var countString = $('[data-field="inviteCount"]').html();
  var count = Number(countString);
  count--;
  $('[data-field="inviteCount"]').html(count);
});

//add new project to the nav with proper group and show new project
socket.on('newProjectCreated', function(newProject, groupId) {
  //set browser history to new project route
  history.pushState(newProject, '', newProject._id);
  //save pid to user
  var userId = $('.navProfile').attr('data-userId');
  var appState = { 'appState': $.getUserPath() };
  socket.emit('updateAppState', userId, appState);
  $('.mainPane').empty();
  $('.navGroupProjects[data-groupId="' + groupId +'"]')
  .children('.groupActions')
  .before(
    '<li class="groupProject"><a href="#" data-projectId="' + newProject._id +
    '" class="navProject">' +
    newProject.title +
    '</a></li>'
  );
  var currentProjectId = $('.projectInfo').attr('data-projectId');
  if(currentProjectId == null || currentProjectId == 'undefined') {
    $('.mainPane').prepend(
      renderProjectTitle(newProject)
    );
    if(!$('.infoPane').hasClass('hide')) {
      $('.infoPane').html(renderProjectInfo(newProject));
    }
    $('.mainPane').append(renderTaskList(newProject.tasks));
  }
  else if(currentProjectId != newProject._id) {
    $('.projectInfo').replaceWith(
      renderProjectTitle(newProject)
    );
    if(!$('.infoPane').hasClass('hide')) {
      $('.infoPane').html(renderProjectInfo(newProject));
    }
    $('.mainPane').append(renderTaskList(newProject.tasks));
  }
});

//show loaded project
socket.on('projectLoaded', function(loadedProject) {
  //set browser history to project route
  history.pushState(loadedProject, '', loadedProject._id);
  //save pid to user
  var userId = $('.navProfile').attr('data-userId');
  var appState = { 'appState': $.getUserPath() };
  socket.emit('updateAppState', userId, appState);
  $('#infoPane').attr('data-infoId', loadedProject._id);
  for(var x=0; x<loadedProject.users.length;x++) {
    var email = loadedProject.users[x].email;
    var id = loadedProject.users[x]._id;
    projectUsersObj[email] = id;
    projectUsersList.push(email);
  }
  $('.mainPane').empty();
  var currentProjectId = $('.projectInfo').attr('data-projectId');
  if(currentProjectId == null || currentProjectId == 'undefined') {
    $('.mainPane').prepend(
      renderProjectTitle(loadedProject)
    );
  }
  else if(currentProjectId != loadedProject._id) {
    $('.projectInfo').replaceWith(
      renderProjectTitle(loadedProject)
    );
  }
  $('.infoPane').html(renderProjectInfo(loadedProject));
  $('.mainPane').append(renderTaskList(loadedProject.tasks));
  initiateUX();
  resizeTextarea();
});

//add new group to nav
socket.on('groupCreated', function(newGroup) {
  $('.nav').append(
    '<div data-list="group" data-groupId="' + newGroup._id + '">' +
    '<li class="nav-header" data-navField="group" data-groupId="' +
    newGroup._id + '">' + newGroup.title + 
    ' <span class="groupOptions dropdown"><button class="btn btn-mini dropdown-toggle">' +
    '<i class="icon-cog icon-white"></i></button>' +
    '<ul class="dropdown-menu" data-for="navGroup"><li>' +
    '<a href="#" data-action="removeFromGroup">Remove Me From Group</a></li>' +
    '</ul>' +
    '</span></li>' +
    '<li><ul class="navGroupProjects unstyled" data-groupId="' +
    newGroup._id + '"><li class="groupActions">' +
    '<button class="btn btn-mini" data-groupId="' + newGroup._id +
    '" data-groupName="' + newGroup.title + '" data-action="newProject">' +
    '<span class="newProjectSymbol">+</span> New Project' +
    '</button></li></ul></li></div>'
  );
  if(newGroup.projects) {
    for(var x=0; x<newGroup.projects.length; x++) {
      $('.navGroupProjects[data-groupId="' + newGroup._id + '"]')
      .children('.groupActions')
      .before(
        '<li><a href="#" data-projectTitle="' + newGroup.projects[x].title +
        '" data-projectId="' + newGroup.projects[x]._id +
        '" class="navProject">' + newGroup.projects[x].title + '</a></li>'
      );
    }
  }
});

//remove group from user nav
socket.on('removedFromGroup', function(groupId) {
  $('[data-list="group"][data-groupId="' + groupId + '"]').remove();
});

//delete project, notify group and project members, and load previous project
socket.on('projectDeleted', function(projectId) {
  var nextGroupProjectId = $('.nav')
    .find('[data-projectId="' + projectId + '"]')
    .parent().siblings('.groupProject').first().children()
    .attr('data-projectId');
  $('.nav').find('[data-projectId="' + projectId + '"]').parent('li').remove();
  if(nextGroupProjectId) {
    socket.emit('loadProject', nextGroupProjectId);
  }
  else {
    $('.mainPane').empty().toggleClass('span8');
    $('.infoPane').toggleClass('hide');
  }
});

//removed project member
socket.on('removedProjectMember', function(userId) {
  console.log('done');
});

//update task list with newly created task
socket.on('newTaskCreated', function(newTask, selectedTaskId) {
  var selectedTask = $('.projectTask[data-taskId="' + selectedTaskId + '"]');
  if(selectedTask === null || selectedTask === 'null' || selectedTask === '')
  {
    var getLastIndex = $('.projectTask').last()
                .find('[data-taskField="index"]').attr('data-index');
    if(!getLastIndex) getLastIndex = 0;
    var index = Number(getLastIndex) + 1;
  }
  else {
    var index = Number(selectedTask
                      .find('[data-taskField="index"]')
                      .attr('data-index')) + 1;
  }
  var noDate = $('.taskList[data-list="noDate"]').html();
  if(noDate === null || noDate === 'null') {
    if(selectedTaskId === null || selectedTaskId === 'null' || selectedTaskId == '')
    {
      $('.taskList').children('[data-list="taskList"]').append(
        renderTheTask(newTask, index)
      );
      $('.taskList').children('[data-list="taskList"]').last('li')
      .find('input[data-field="taskTitle"]').focus();
    }
    else {
      selectedTask.after(renderTheTask(newTask, index));
      selectedTaskId = selectedTask.next().attr('data-taskId');
      selectedTask.next().find('input[data-field="taskTitle"]').focus();
      setSelectedTaskId(selectedTaskId);
    }
  }
  else {
    if(selectedTask === null || selectedTask === 'null' || selectedTask == '') {
      $('.taskList[data-list="noDate"]').children('[data-list="taskList"]')
      .append(
        renderTheTask(newTask, index)
      );
      $('.taskList[data-list="noDate"]')
      .children('[data-list="taskList"]').last('li')
      .find('input[data-field="taskTitle"]').focus();
    }
    else {
      selectedTaskId = newTask._id;
      selectedTask.after(renderTheTask(newTask, index));
      selectedTaskId = selectedTask.next().attr('data-taskId');
      selectedTask.next().find('input[data-field="taskTitle"]').focus();
      setSelectedTaskId(selectedTaskId);
    }
  }
  saveTaskOrder();
  initiateUX();
});

//mark task as complete
socket.on('taskCompleted', function(taskId, userId) {
  var $targetTask = $('.projectTask[data-taskId="' + taskId + '"]');
  $targetTask.find('[data-action="taskComplete"]').parent().tooltip('hide');
  var $completeTask = $targetTask.clone();
  $completeTask.find('[data-action="displayTask"]').hide();
  $completeTask.find('[data-action="taskComplete"]').hide();
  $completeTask.find('[data-action="taskComplete"]').parent()
  .attr('data-original-title', 'Mark as Incomplete');
  $completeTask.find('[data-taskField="index"]').children('div').children('span')
  .show();
  $completeTask.find('.icon-th-list').hide();
  $completeTask.toggleClass('complete');
  var checked = $completeTask.find('input[data-action="taskComplete"]')
                .attr('checked');
  if(checked !== 'checked' || checked !== true) {
    $completeTask.find('input[data-action="taskComplete"]')
    .attr('checked', true);
  }
  $targetTask.remove();
  if($('.projectTask').first().hasClass('complete')) {
    $('.projectTask.complete').last().after($completeTask);
  }
  else $('.projectTask').first().before($completeTask);
  updateTaskOrder();
  saveTaskOrder();
});

//mark task as not completed
socket.on('taskNotCompleted', function(taskId, userId) {
  var $targetTask = $('.projectTask[data-taskId="' + taskId + '"]');
  $targetTask.toggleClass('complete');
  $targetTask.find('[data-action="taskComplete"]').parent()
  .attr('data-original-title', 'Mark as Complete');
  $targetTask.find('input[data-action="taskComplete"]').removeAttr('checked');
});

socket.on('prioritySet', function(taskId, userId) {
  
});

//delete task and load previous task
socket.on('taskDeleted', function(taskId) {
  var prevTask = $('.projectTask[data-taskId="' + taskId + '"]')
  .prev('.projectTask').attr('data-taskId');
  $('.projectTask').remove('[data-taskId="' + taskId + '"]');
  updateTaskOrder();
  socket.emit('loadTask', prevTask);
});


//updated task
socket.on('taskUpdated', function(updatedTask) {
  document.activeElement.blur();
  var targetTask = $('.projectTask[data-taskId="' + updatedTask._id + '"]');
  $('input[data-field="taskTitle"][data-taskId="' + updatedTask._id + '"]')
  .val(function(index, val) {
    return updatedTask.title;
  });
  $('input[data-field="taskTitle"][data-taskId="' + updatedTask._id + '"]')
  .attr('value', updatedTask.title);
  $('input[data-field="taskDueDate"]').val(function(index, val) {
    return updatedTask.end_at;
  });
  if(updatedTask.milestone) {
    var resizer = targetTask.find('[data-field="resizer"]');
    resizer.html(targetTask.find('input[data-field="taskTitle"]').val());
    //targetTask.find('input[data-field="taskTitle"]').width(resizer.width() + 10);
    //targetTask.width(resizer.width() + 10);
    if(!targetTask.hasClass('milestone')) {
      targetTask.addClass('milestone');
    }
    $('[data-action="toggleMilestone"]').html('Un-Make Milestone');
  }
  if(!updatedTask.milestone) {
    targetTask.removeAttr('style');
    targetTask.find('input[data-field="taskTitle"]').removeAttr('style');
    targetTask.children('.taskFields').removeAttr('style');
    targetTask.removeClass('milestone');
    $('[data-action="toggleMilestone"]').html('Make Milestone');
  }
  if(updatedTask.end_at) {
    targetTask.find('[data-taskField="dueDate"]')
    .attr('data-due', updatedTask.end_at);
    targetTask.find('[data-taskField="dueDate"]')
    .html(renderDate(updatedTask.end_at));
  }
  if(updatedTask.assigned_to) {
    if(updatedTask.assigned_to.email) {
      var el = $('.token-input-token');
      if(isInDocument(el[0])) {
        var getAssignee = $('[data-input="assignTo"]').tokenInput('get');
        if(getAssignee.length > 0) {
          if(getAssignee[0].email != updatedTask.assigned_to.email) {
            $('[data-input="assignTo"]').tokenInput('clear');
            $('[data-input="assignTo"]').tokenInput('add', updatedTask.assigned_to);
          }
        }
      }
      else {
        var checkAssign = $('[data-input="assignTo"]');
        if(!isInDocument(checkAssign[0])) {
          $('[data-infoField="taskAssignee"]').find('[data-action="assignTo"]')
          .before('<input type="text" data-input="assignTo">');
        }
        var checkList = $('.token-input-list');
        if(isInDocument(checkList[0])) {
          $('.token-input-list').remove();
          $('#token-input-').remove();
          $('.token-input-dropdown').remove();
        }
        initiateTaskAssigneeToken([updatedTask.assigned_to]);
        $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
        .hide();
      }
      targetTask.find('[data-taskField="assignee"]')
      .attr('data-assignee', updatedTask.assigned_to.email);
      targetTask.find('[data-taskField="assignee"]').children()
      .html(
        '<a href="#" rel="tooltip" title="' + updatedTask.assigned_to.name +
        '">' + getInitials(updatedTask.assigned_to.name) + '</a>'
      );
    }
  }
  else {
    //initiateTaskAssigneeToken();
    targetTask.find('[data-taskField="assignee"]').attr('data-assignee', null);
    targetTask.find('[data-taskField="assignee"]').children()
    .replaceWith('<div>\u00A0</div>');
    $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
    .show();
  }
  $('textarea[data-field="taskNotes"]').val(function(index, val) {
    return updatedTask.notes;
  });
  initiateUX();
});

//added tag to task
socket.on('addedTaskTag', function(taskId, tag) {
  $('[data-input="tag"]').parent('li').replaceWith(
    '<li data-field="tag"><span class="badge badge-info">' +
    tag +
    '</span></li>'
  );
});

//loaded relevant tasks
socket.on('loadedRelevantTasks', function(error, tasks) {
  $('.infoStream').html();
});

//update project info, specifically in the nav
socket.on('projectUpdated', function(updatedProject, projectId) {
  $('.navProject[data-projectId="' + projectId + '"]')
  .attr('data-projectTitle', updatedProject.title);
  $('.navProject[data-projectId="' + projectId + '"]')
  .text(updatedProject.title);
});

//display the task info
socket.on('taskLoaded', function(loadedTask) {
  var userId = $('.navProfile').attr('data-userId');
  //set browser history to task route
  var taskRoute = '?tid=' + loadedTask._id;
  history.pushState(loadedTask, '', taskRoute);
  var userId = $('.navProfile').attr('data-userId');
  var appState = { 'appState': $.getUserPath() };
  socket.emit('updateAppState', userId, appState);
  $('#infoPane').attr('data-infoId', loadedTask._id);
  $('.infoPane').html(
    renderTaskInfo(loadedTask)
  );
  if(!$('.mainPane').hasClass('span8')) $('.mainPane').toggleClass('span8');
  if($('.infoPane').hasClass('span4')) {
    if($('.infoPane').hasClass('hide')) {
      $('.infoPane').toggleClass('hide');
    }
  }
  else {
    $('.infoPane').toggleClass('span4');
    if($('.infoPane').hasClass('hide')) {
      $('.infoPane').toggleClass('hide');
    }
  }
  /*
  var typeaheadLength;
  if(projectUsersList.length > 8) typeaheadLength = 8;
  else typeaheadLength = projectUsersList.length;
  $('[data-provide="typeahead"]').typeahead({
    source: projectUsersList,
    items: typeaheadLength
  });
  */
  var assignee = [];
  if(loadedTask.assigned_to) {
    if(loadedTask.assigned_to.hasOwnProperty('email')) {
      assignee.push(loadedTask.assigned_to);
      initiateTaskAssigneeToken(assignee);
      $('[data-infoField="taskAssignee"]').find('[data-field="placeholder"]')
      .hide();
    }
  }

  initiateUX();
});

//display the project info
socket.on('loadedProjectCache', function(cachedProject) {
  //set browser history to project route
  history.pushState(cachedProject, '', cachedProject._id);
  $('#infoPane').attr('data-infoId', cachedProject._id);
  for(var x=0; x<cachedProject.users.length;x++) {
    var email = cachedProject.users[x].email;
    var id = cachedProject.users[x]._id;
    projectUsersObj[email] = id;
    projectUsersList.push(email);
  }
  $('.infoPane').html(
    renderProjectInfo(cachedProject)
  );
  if(!$('.mainPane').hasClass('span8')) $('.mainPane').toggleClass('span8');
  if($('.infoPane').hasClass('span4')) {
    if($('.infoPane').hasClass('hide')) {
      $('.infoPane').toggleClass('hide');
    }
  }
  else {
    $('.infoPane').toggleClass('span4');
    if($('.infoPane').hasClass('hide')) {
      $('.infoPane').toggleClass('hide');
    }
  }
  resizeTextarea();
});

socket.on('loadProjectUsers', function(project) {
  for(var x=0; x<project.users.length; x++) {
    var userObj = {};
    userObj.email = project.users[x].email;
    userObj.name = project.users[x].firstName + ' ' + project.users[x].lastName;
    projectUsersList.push(userObj);
  }
});

//load user dashboard
socket.on('loadedUserDashboard', function(dashboardHtml) {
  $('#appMain').empty().append(dashboardHtml);
  initiateUX();
});