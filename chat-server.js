//Global variables the server will use
//userList has the key of username and value of occupied room and socketid
userList = {};
//roomList has the key of room name and value of creator and password
roomList = {lobby:['root', '']};
//banned list
banList = {lobby:[]};
//From the CSE330 Website
// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.

	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.

		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);

//from the wiki
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.

	//code for adduser derived from https://github.com/mmukhin/psitsmike_example_2/blob/master/app.js and
	//https://github.com/socketio/socket.io/blob/master/examples/chat/index.js
	// when the client emits 'adduser', this listens and executes
	socket.on('adduser', function(username){
		// store the username and room name in the socket session for this client
		socket.username = username;
		socket.room = 'lobby';
		//set the key (name) to have the value (room and id)
		userList[username] = ['lobby',socket.id];
		//have the socket join the room
		socket.join('lobby');
		//end borrowed code segment
		var roomUserList = {};
		for(var k in userList){
			if(userList[k][0]== 'lobby'){
				roomUserList[k] = 'lobby';
			}
		}
		//update lobby list for all others
		socket.broadcast.to('lobby').emit('updateusers',roomUserList)
		//update room list and user list for the logged in user
		socket.emit('updateusers',roomUserList);
		socket.emit('updaterooms',roomList,'lobby');
	});

	//Send message to server callback
	socket.on('message_to_server', function(data) {
		//This callback runs when the server receives a new message from the client.
		//send back to client.html
		io.sockets.in(socket.room).emit("message_to_client",{user:socket.username,message:data["message"], color:data["color"] }); // broadcast the message to other users
	});

	socket.on('sendPM',function(data){
		//data["user"] is the user who is getting the message. socket.username is the user sending the message.
		var recieverId = userList[data["user"]][1];
		//send it to both the reciver and the sender
		socket.broadcast.to(recieverId).emit("message_to_client",{user:socket.username + " (PM)",message: data["message"], color:'black'});
		socket.emit("message_to_client",{user:socket.username + " (PM)",message: data["message"], color:'black'});
	});

	socket.on('inviteToRoom',function(data){
		var recieverId = userList[data["user"]][1];
		var room = data["room"];
		socket.broadcast.to(recieverId).emit("invite_to_client",{user:socket.username + " invites you to a room. Click to accept",message: room});
	})

	socket.on('banUser',function(user){
		if(socket.username == roomList[socket.room][0]){
			//there should be a banlist for this room. otherwise, make one.
			if(banList[socket.room]){
				banList[socket.room].push(user);
			}
			else{
				banList[socket.room] = [user];
			}
			//push this to EVERYONE in the room
			io.sockets.in(socket.room).emit("returnToLobby",user);
		}
		else{
			socket.emit("message_to_client",{user:"SERVER",message: 'you cant ban since you dont own the room', color:'black'});
		}
	});

	socket.on('makeRoom',function(data){
		var create = true;
		for(var room in roomList){
			if(data["room"] == room){
				socket.emit("message_to_client",{user:"SERVER",message: 'room already exists. Try another name', color:'black'});
				create = false;
			}
		}
		if(create == true){
			roomList[data["room"]] = [data["creator"],data["password"]];
			banList[data["room"]] = [];
			socket.emit('updaterooms', roomList, socket.room);
			for(var k in userList){
				//update room list for other people
				socket.broadcast.to(userList[k][1]).emit('updaterooms',roomList,userList[k][0]);
			}
		}
	});

	socket.on('kickUser',function(user){
		if(socket.username == roomList[socket.room][0]){
			//push this to EVERYONE in the room
			io.sockets.in(socket.room).emit("returnToLobby",user);
		}
		else{
			socket.emit("message_to_client",{user:"SERVER",message: 'you cant kick since you dont own the room', color:'black'});
		}
	});

	socket.on('checkForPassword',function(room){
		var password = false;
		if(roomList[room][1] != ''){
			password = true;
		}
		socket.emit("passwordCheck",password,room);
	});
	//this operates just like the switch room function, but overrides password and ban lists
	socket.on('switchRoomOverRide', function(newRoom){
		oldRoom = socket.room;
		// leave the current room (stored in session)
		socket.leave(oldRoom);
		// join new room, received as function parameter
		socket.join(newRoom);
		//update the room location on userList
		userList[socket.username][0] = newRoom;
		// update socket session room title
		socket.room = newRoom;
		//update the room list for the person who just switched rooms
		socket.emit('updaterooms', roomList, newRoom);
		//end derived code
		//now update the user lists in the new and old room
		var newRoomUserList = {};
		var oldRoomUserList = {};
		for(var k in userList){
			if(userList[k][0]== newRoom){
				newRoomUserList[k] = newRoom;
			}
			else if(userList[k][0] == oldRoom){
				oldRoomUserList[k] = oldRoom;
			}
		}
		socket.emit('updateusers',newRoomUserList);
		socket.broadcast.to(newRoom).emit('updateusers',newRoomUserList);
		socket.broadcast.to(oldRoom).emit('updateusers',oldRoomUserList);
	});
	//part of the switch room function derived from code from http://psitsmike.com/2011/10/node-js-and-socket-io-multiroom-chat-tutorial/
	socket.on('switchRoom',function(data){
		newRoom = data["room"];
		password = data["password"];
		var banned = false;
		var passwordWrong = false;
		for(var v in banList[newRoom]){
			if(banList[newRoom][v] == socket.username){
				banned = true;
			}
		}
		if(password != roomList[newRoom][1]){
			passwordWrong = true;
		}
		//now check for banned or wrong password
		if(banned == true){
			socket.emit("message_to_client",{user:"SERVER",message: 'you are banned from this room.', color:'black'});
		}
		else if(passwordWrong == true){
			socket.emit("message_to_client",{user:"SERVER",message: 'wrong password.', color:'black'});
		}
		else{
			//code derived from http://psitsmike.com/2011/10/node-js-and-socket-io-multiroom-chat-tutorial/
			oldRoom = socket.room;
			// leave the current room (stored in session)
			socket.leave(oldRoom);
			// join new room, received as function parameter
			socket.join(newRoom);
			//update the room location on userList
			userList[socket.username][0] = newRoom;
			// update socket session room title
			socket.room = newRoom;
			//update the room list for the person who just switched rooms
			socket.emit('updaterooms', roomList, newRoom);
			//end derived code

			//now update the user lists in the new and old room
			var newRoomUserList = {};
			var oldRoomUserList = {};
			for(var k in userList){
				if(userList[k][0]== newRoom){
					newRoomUserList[k] = newRoom;
				}
				else if(userList[k][0] == oldRoom){
					oldRoomUserList[k] = oldRoom;
				}
			}

			socket.emit('updateusers',newRoomUserList);
			socket.broadcast.to(newRoom).emit('updateusers',newRoomUserList);
			socket.broadcast.to(oldRoom).emit('updateusers',oldRoomUserList);
		}
	});
	//code derived from http://psitsmike.com/2011/10/node-js-and-socket-io-multiroom-chat-tutorial/
	socket.on('disconnect', function(){
		// remove the username from global usernames list
		delete userList[socket.username];
		// update list of users in chat, client-side
		io.sockets.emit('updateusers', userList);
		// echo globally that this client has left
		socket.leave(socket.room);
	});
	//end derived code
});
