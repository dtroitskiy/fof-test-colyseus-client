'use strict';

const CONNECT = true;
const TEST_PLAYER_POS = { 'x': 20, 'y': 15 };

const LOADING_COLOR = 'rgb(0, 255, 0)';
const LOADING_FONT = '36px Arial';
const LOADING_PROGRESS_BAR_SIZE_FACTORS = { 'width': 0.3, 'height': 0.15 };
const LOADING_V_SPACING_FACTOR = 0.02;
const TILE_SPACING = 1;
const TILE_FREE_COLOR = 'rgb(192, 255, 192)';
const TILE_BLOCKING_COLOR = 'rgb(255, 192, 192)';
const PLAYER_SIZE_FACTOR = 0.75;
const PLAYER_COLOR = 'rgb(0, 0, 255)';
const PLAYER_NAME_FONT = '16px Arial';
const PLAYER_NAME_COLOR = 'black';
const PLAYER_NAME_OFFSET_Y = 15;

const FoFcombat = Module;

let loadingLabel = 'Initializing', loadingPercentage = 0;

let canvas = null, canvas2d = null;

let connected = false;
let send = function() {};

let universalTileMap = null, combatSystem = null;

let tileSize = 0, playerSize = 0;

let players = {}, pendingPlayersToAdd = [], me = null;

let lastUpdateTime = 0;

let leftPressed = false, rightPressed = false, upPressed = false, downPressed = false;

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () =>
{
	loadingLabel = 'Loading combat module';
	initCanvas();
	update(0);
});

FoFcombat.onRuntimeInitialized = () =>
{
	if (CONNECT)
	{
		loadingLabel = 'Connecting to server';
		connect();
	}
	else
	{
		load('test').then(setupCombat, () =>
		{
			loadingLabel = 'Loading error';
		});
	}
};

function load(mapName)
{
	return new Promise((resolve, reject) =>
	{
		if (!mapName) mapName = 'test';
		loadingLabel = 'Loading resources';
		const loadFuncs = [Loader.loadDB, Loader.loadData, Loader.loadSpritesRGB, Loader.loadSpritesAlpha,
		                   Loader.loadSpritesBlockingStatesAndElevations, Loader.loadAdvancedObjectAttributes,
		                   Loader.loadOTBMap.bind(Loader, mapName + '.otbm'), Loader.buildUniversalTileMap];
		let step = 0;
		const intervalID = setInterval(() =>
		{
			const func = loadFuncs[step++];
			if (!func())
			{
				clearInterval(intervalID);
				loadingPercentage = 0;
				reject();
			}
			if (func == Loader.loadAdvancedObjectAttributes)
			{
				loadingLabel = 'Loading map';
			}
			if (func == Loader.loadOTBMap)
			{
				loadingLabel = 'Building map';
			}
			loadingPercentage = step / loadFuncs.length;
			if (step == loadFuncs.length)
			{
				clearInterval(intervalID);
				loadingPercentage = 0;
				resolve();
			}
		}, 0);
	});
}

// NETWORKING
function connect()
{
	let url = '';
	if (location.hostname == 'localhost')
	{
		url = 'ws://localhost:8080';
	}
	else
	{
		url = 'wss://' + location.hostname.replace('client', 'server');
	}
	const client = new Colyseus.Client(url);

	client.joinOrCreate('test').then(room =>
	{
		console.log('Joined room %s', room.name);

		send = room.send.bind(room);
		room.onMessage(handleMessage);

		room.onLeave(() =>
		{
		  console.log('Left room %s', room.name);
		});
	}).catch(e =>
	{
		console.log('Failed to join room!', e);
	});

	/*client.onOpen.add(function()
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
	});*/
	
	/*room.onMessage.add(function(data)
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
	});*/

	/*room.listen('players/:id', function(change)
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
	});*/
	
	/*room.listen('players/:id/mapPos/:coord', function(change)
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
	});*/
}

function handleMessage(data)
{
	switch (data.message)
	{
		case 'load':
			load(data.map).then(() =>
			{
				loadingLabel = 'Waiting for server';
				send({ 'message': 'ready' });
			}, () =>
			{
				loadingLabel = 'Loading error';
			});
		break;
		case 'init':
			loadingLabel = null;
			setupCombat();
		break;
	}
}

// LOGIC
function setupCombat()
{
	universalTileMap = Loader.universalTileMap;
	combatSystem = new FoFcombat.CombatSystem(universalTileMap, '/res/scripts/');

	resize(); // needed to update tile and other objects sizes based on map size
}

function update(time)
{
	let dt = (time - lastUpdateTime) / 1000;
	lastUpdateTime = time;
	
	//handleMovement();
	
	//combatSystem.tick(dt);
	
	draw();
	
	requestAnimationFrame(update);
}

/*function createPlayer(data)
{
	const player = new CombatPlayer();
	player.id = data.id;
	player.mapTileX = data.mapTileX;
	player.mapTileY = data.mapTileY;
	player.mapTileZ = data.mapTileZ;
	player.abilities = new CombatAbilities();
	for (let i in data.abilities)
	{
		player.abilities[i] = data.abilities[i];
	}
	
	if (data.me) me = player;
	players[player.id] = player;
	combatSystem.addPlayer(player);
}

function removePlayer(id)
{
	combatSystem.removePlayerByID(id);
	delete players[id];
}*/

/*function handleMovement()
{
	if (!me) return;

	me.movementX = me.movementY = 0;
	if (leftPressed) me.movementX -= 1;
	if (rightPressed) me.movementX += 1;
	if (upPressed) me.movementY -= 1;
	if (downPressed) me.movementY += 1;

	send({ 'message': 'movement', 'movementX': me.movementX, 'movementY': me.movementY });
}*/

// INPUT
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

// PRESENTATION
function initCanvas()
{
	canvas = document.querySelector('canvas');
	canvas2d = canvas.getContext('2d');
	window.addEventListener('resize', resize);
	resize();
}

function resize()
{
	canvas.width = document.body.clientWidth;
	canvas.height = document.body.clientHeight;

	if (universalTileMap)
	{
		let mapAspect = universalTileMap.width / universalTileMap.height, canvasAspect = canvas.clientWidth / canvas.clientHeight;
		tileSize = (mapAspect >= canvasAspect) ? (canvas.clientWidth / universalTileMap.width) : (canvas.clientHeight / universalTileMap.height);
		playerSize = tileSize * PLAYER_SIZE_FACTOR;
	}
}

function draw()
{
	canvas2d.clearRect(0, 0, canvas.width, canvas.height);

	drawLoading();
	drawMap();
	// drawPlayers();
}

function drawLoading()
{
	if (!loadingLabel) return;

	canvas2d.fillStyle = canvas2d.strokeStyle = LOADING_COLOR;
	canvas2d.font = LOADING_FONT;

	let textMetrics = canvas2d.measureText(loadingLabel);
	textMetrics.height = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;

	let progressBarSize = {};
	progressBarSize.width = canvas.width * LOADING_PROGRESS_BAR_SIZE_FACTORS.width;
	progressBarSize.height = progressBarSize.width * LOADING_PROGRESS_BAR_SIZE_FACTORS.height;
	
	let vSpacing = canvas.width * LOADING_V_SPACING_FACTOR;

	let totalLoadingHeight = textMetrics.height + vSpacing + progressBarSize.height;

	let x = (canvas.width - textMetrics.width) / 2, y = (canvas.height - totalLoadingHeight) / 2;
	canvas2d.fillText(loadingLabel, x, y);

	if (loadingPercentage)
	{
		y += vSpacing;
		x = (canvas.width - progressBarSize.width) / 2;
		canvas2d.strokeRect(x, y, progressBarSize.width, progressBarSize.height);
		canvas2d.fillRect(x, y, progressBarSize.width * loadingPercentage, progressBarSize.height);
	}
}

function drawMap()
{
	if (!universalTileMap) return;

	let tileState = 0;
	for (let tileX = 0; tileX < universalTileMap.width; ++tileX)
	{
		for (let tileY = 0; tileY < universalTileMap.height; ++tileY)
		{
			const tile = universalTileMap.getTile(tileX, tileY, FoFcombat.UniversalTileMap.GROUND_FLOOR); // for now always drawing only ground floor
			canvas2d.fillStyle = tile.isBlocking ? TILE_BLOCKING_COLOR : TILE_FREE_COLOR;
			canvas2d.fillRect(tileX * tileSize + TILE_SPACING, tileY * tileSize + TILE_SPACING, tileSize - TILE_SPACING * 2, tileSize - TILE_SPACING * 2);
		}
	}
}

/*function drawPlayers()
{
	let tileSizeFactor = tileSize / CombatConsts.MAP_TILE_SIZE;
	canvas2d.fillStyle = PLAYER_COLOR;
	for (let id in players)
	{
		let player = players[id], pos = player.mapPos;
		let x = pos.x * tileSizeFactor, y = pos.y * tileSizeFactor;
		canvas2d.beginPath();
		canvas2d.arc(x, y, playerSize / 2, 0, Math.PI * 2);
		canvas2d.fill();
	}
	
	canvas2d.font = PLAYER_NAME_FONT;
	canvas2d.fillStyle = PLAYER_NAME_COLOR;
	for (let id in players)
	{
		let player = players[id], pos = player.mapPos;
		let x = pos.x * tileSizeFactor, y = pos.y * tileSizeFactor;
		let nameText = player.id + (me && player.id == me.id ? ' (me)' : '');
		canvas2d.fillText(nameText, x - canvas2d.measureText(nameText).width / 2, y - PLAYER_NAME_OFFSET_Y);
	}
}*/
