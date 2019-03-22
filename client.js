'use strict';

const CONNECT = true;
const TEST_MAP_WIDTH = 40, TEST_MAP_HEIGHT = 30;
const TEST_PLAYER_POS = { 'x': 20, 'y': 15 };
const TEST_PLAYER_ABILITIES = { 'moveSpeed': 64 };

const TILE_SPACING = 1;
const TILE_FREE_COLOR = 'rgb(192, 255, 192)';
const TILE_BLOCKING_COLOR = 'rgb(255, 192, 192)';
const PLAYER_SIZE_FACTOR = 0.75;
const PLAYER_COLOR = 'rgb(0, 0, 255)';
const PLAYER_NAME_FONT = '16px Arial';
const PLAYER_NAME_COLOR = 'black';
const PLAYER_NAME_OFFSET_Y = 15;

let combatSystem = null;

let canvas = null, canvas2d = null;

let connected = false;
let send = function() {};

let tileSize = 0, playerSize = 0;

let players = {}, pendingPlayersToAdd = [], me = null;

let leftPressed = false, rightPressed = false, upPressed = false, downPressed = false;

let lastUpdateTime = 0;

function connect()
{
	const client = new Colyseus.Client('ws://localhost:8080');

	client.onOpen.add(function()
	{
		console.log('Connected!');
		connected = true;
	});

	client.onClose.add(function()
	{
		console.log('Disconnected!');
		connected = false;
	});

	const room = client.join('test');
	
	room.onJoin.add(function()
	{
		send = room.send.bind(room);
	});
	
	room.onLeave.add(function()
	{
		send = function() {};
	});
	
	room.onMessage.add(function(data)
	{
		switch (data.message)
		{
			case 'initCombatSystem':
				initCombatSystem(data);
				for (let i in pendingPlayersToAdd)
				{
					createPlayer(pendingPlayersToAdd[i]);
				}
				pendingPlayersToAdd = [];
				resize();
				update(0);
			break;
		}
	});

	room.listen('players/:id', function(change)
	{
		if (change.operation === 'add')
		{
			const data = change.value;
			data.me = false;
			if (data.id == room.sessionId) data.me = true;
			if (combatSystem)
			{
				createPlayer(data);
			}
			else
			{
				pendingPlayersToAdd.push(data);
			}
		}
		else if (change.operation === 'remove')
		{
			removePlayer(change.path.id);
		}
	});
	
	room.listen('players/:id/mapPos/:coord', function(change)
	{
		if (change.operation != 'replace') return;
		
		const player = players[change.path.id];
		// making current player position copy
		const pos = { 'x': player.mapPos.x, 'y': player.mapPos.y };
		pos[change.path.coord] = change.value;
		
		// we manually set our own position only if it got desynchronized on more than 1 tile
		if (player.id == room.sessionId)
		{
			if (Math.abs(pos.x - me.mapPos.x) >= CombatConsts.MAP_TILE_SIZE || Math.abs(pos.y - me.mapPos.y) >= CombatConsts.MAP_TILE_SIZE)
			{
				console.log('Desynchronized!');
				combatSystem.setCreaturePos(player.id, pos);
			}
		}
		else
		{
			combatSystem.setCreaturePos(player.id, pos);
		}
	});
}

function initCombatSystem(data)
{
	combatSystem = new CombatSystem(data.mapWidth, data.mapHeight);
	
	const pm = data.passMap;
	if (pm)
	{
		for (let i in pm)
		{
			combatSystem.setTileStateByIndex(i, pm[i]);
		}
	}
}

function createPlayer(data)
{
	let player = {};
	player.id = data.id;
	player.mapTileX = data.mapTileX;
	player.mapTileY = data.mapTileY;
	player.mapTileZ = data.mapTileZ;
	player.abilities = data.abilities;
	
	if (data.me) me = player;
	players[player.id] = player;
	combatSystem.addPlayer(player);
}

function removePlayer(id)
{
	combatSystem.removePlayerByID(id);
	delete players[id];
}

function initCanvas()
{
	canvas = document.querySelector('canvas');
	canvas2d = canvas.getContext('2d');
	window.addEventListener('resize', resize);
}

function resize()
{
	canvas.width = document.body.clientWidth;
	canvas.height = document.body.clientHeight;

	let mapAspect = combatSystem.mapWidth / combatSystem.mapHeight, canvasAspect = canvas.clientWidth / canvas.clientHeight;
	tileSize = (mapAspect >= canvasAspect) ? (canvas.clientWidth / combatSystem.mapWidth) : (canvas.clientHeight / combatSystem.mapHeight);
	playerSize = tileSize * PLAYER_SIZE_FACTOR;
}

function update(time)
{
	let dt = (time - lastUpdateTime) / 1000;
	lastUpdateTime = time;
	
	handleMovement();
	
	combatSystem.tick(dt);
	
	draw();
	
	if (!CONNECT || connected) requestAnimationFrame(update);
}

function handleMovement()
{
	if (!me) return;

	me.movementX = me.movementY = 0;
	if (leftPressed) me.movementX -= 1;
	if (rightPressed) me.movementX += 1;
	if (upPressed) me.movementY -= 1;
	if (downPressed) me.movementY += 1;

	send({ 'message': 'movement', 'movementX': me.movementX, 'movementY': me.movementY });
}

function draw()
{
	canvas2d.clearRect(0, 0, canvas.width, canvas.height);

	drawMap();
	drawPlayers();
}

function drawMap()
{
	let tileState = 0;
	for (let tileX = 0; tileX < combatSystem.mapWidth; ++tileX)
	{
		for (let tileY = 0; tileY < combatSystem.mapHeight; ++tileY)
		{
			tileState = combatSystem.getTileState(tileX, tileY, CombatConsts.MAP_GROUND_FLOOR);
			canvas2d.fillStyle = tileState == CombatConsts.MAP_TILE_BLOCKING ? TILE_BLOCKING_COLOR : TILE_FREE_COLOR;
			canvas2d.fillRect(tileX * tileSize + TILE_SPACING, tileY * tileSize + TILE_SPACING, tileSize - TILE_SPACING * 2, tileSize - TILE_SPACING * 2);
		}
	}
}

function drawPlayers()
{
	let tileSizeFactor = tileSize / CombatConsts.MAP_TILE_SIZE;
	canvas2d.font = PLAYER_NAME_FONT;
	for (let id in players)
	{
		let player = players[id], pos = player.mapPos;
		let x = pos.x * tileSizeFactor, y = pos.y * tileSizeFactor;
		canvas2d.beginPath();
		canvas2d.arc(x, y, playerSize / 2, 0, Math.PI * 2);
		canvas2d.fillStyle = PLAYER_COLOR;
		canvas2d.fill();
	}
	
	for (let id in players)
	{
		let player = players[id], pos = player.mapPos;
		let x = pos.x * tileSizeFactor, y = pos.y * tileSizeFactor;
		let nameText = player.id + (me && player.id == me.id ? ' (me)' : '');
		canvas2d.fillStyle = PLAYER_NAME_COLOR;
		canvas2d.fillText(nameText, x - canvas2d.measureText(nameText).width / 2, y - PLAYER_NAME_OFFSET_Y);
	}
}

document.addEventListener('DOMContentLoaded', function()
{
	initCanvas();
	if (CONNECT)
	{
		connect();
	}
	else
	{
		const data = { 'mapWidth': TEST_MAP_WIDTH, 'mapHeight': TEST_MAP_HEIGHT };
		initCombatSystem(data);
		data = {
			'id': 'player',
			'me': true,
			'mapTileX': TEST_PLAYER_POS.x,
			'mapTileY': TEST_PLAYER_POS.y,
			'mapTileZ': CombatConsts.GROUND_FLOOR,
			'abilities': TEST_PLAYER_ABILITIES
		};
		createPlayer(data);
		resize();
		update(0);
	}
});


document.addEventListener('keydown', function(event)
{
	if (event.code == "ArrowLeft" || event.code == "KeyA")
	{
		leftPressed = true;
	}
	else if (event.code == "ArrowRight" || event.code == "KeyD")
	{
		rightPressed = true;
	}
	if (event.code == "ArrowUp" || event.code == "KeyW")
	{
		upPressed = true;
	}
	else if (event.code == "ArrowDown" || event.code == "KeyS")
	{
		downPressed = true;
	}
});

document.addEventListener('keyup', function(event)
{
	if (event.code == "ArrowLeft" || event.code == "KeyA")
	{
		leftPressed = false;
	}
	else if (event.code == "ArrowRight" || event.code == "KeyD")
	{
		rightPressed = false;
	}
	if (event.code == "ArrowUp" || event.code == "KeyW")
	{
		upPressed = false;
	}
	else if (event.code == "ArrowDown" || event.code == "KeyS")
	{
		downPressed = false;
	}
});

