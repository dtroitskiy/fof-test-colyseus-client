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
const CREATURE_SIZE_FACTOR = 0.75;
const CREATURE_COLOR = 'rgb(0, 0, 255)';
const CREATURE_NAME_FONT = '16px Arial';
const CREATURE_NAME_COLOR = 'black';
const CREATURE_NAME_OFFSET_Y = 15;

let loadingLabel = 'Initializing', loadingPercentage = 0;

let canvas = null, canvas2d = null;

let connected = false;
let send = function() {};

let universalTileMap = null, combatSystem = null;

let creatureIDs = [], playerID = 0;

let tileSize = 0, creatureSize = 0;

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
		load('test').then(initCombatSystem, () =>
		{
			loadingLabel = 'Loading error';
		});
	}
};

// NETWORKING
function connect()
{
	let url = '';
	if (location.hostname == 'localhost')
	{
		// used for local testing
		url = 'ws://localhost:8080';
	}
	else if (location.hostname == '192.168.1.200')
	{
		// used for LAN testing
		url = 'ws://192.168.1.200:8080';
	}
	else
	{
		// used for remote testing on something like Heroku
		url = 'wss://' + location.hostname.replace('client', 'server');
	}
	const client = new Colyseus.Client(url);

	client.joinOrCreate('test').then(room =>
	{
		console.log('Joined room %s', room.name);

		playerID = room.sessionId;
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
}

function handleMessage(data)
{
	switch (data.message)
	{
		case 'load':
			load(data.map).then(() =>
			{
				loadingLabel = 'Waiting for server';
				initCombatSystem();
			}, () =>
			{
				loadingLabel = 'Loading error';
			});
		break;
		case 'addSelf':
			loadingLabel = null;
			addSelf(data.position);
		break;
		case 'addCreature':
			addCreature(data.creatureID, data.combatData, data.position)
		break;
		case 'movement':
			// TODO: check may be temporary because server should check whether client is ready to send him movements
			if (combatSystem)
			{
				combatSystem.setCreatureMovement(data.creatureID, data.movementX, data.movementY);
			}
		break;
	}
}

// LOGIC
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

function initCombatSystem()
{
	universalTileMap = Loader.universalTileMap;
	combatSystem = new FoFcombat.CombatSystem(universalTileMap, '/res/scripts/');

	let playerCombatData = combatSystem.preparePlayerCombatData(0);
	playerCombatData = convertCreatureCombatDataToPlainObject(playerCombatData);

	send({ 'message': 'addMe', 'combatData': playerCombatData });

	resize(); // needed to update tile and other objects sizes based on map size
}

function convertCreatureCombatDataToPlainObject(combatData)
{
	const converted = {};
	
	converted.creatureObjectID = combatData.creatureObjectID;
	converted.exp = combatData.exp;
	converted.level = combatData.level;
	
	converted.abilities = {};
	for (let i in combatData.abilities)
	{
		const a = combatData.abilities[i];
		if (typeof(a) == 'number')
		{
			converted.abilities[i] = a;
		}
	}

	converted.equipment = {};
	for (let i in combatData.equipment)
	{
		const e = combatData.equipment[i];
		if (typeof(e) == 'number')
		{
			converted.equipment[i] = e;
		}
	}

	converted.spells = [];
	for (let i = 0; i < combatData.spells.size(); ++i)
	{
		const s = combatData.spells.get(i);
		converted.spells.push({ 'id': s.id, 'level': s.level });
	}

	converted.talents = [];
	for (let i = 0; i < combatData.talents.size(); ++i)
	{
		const t = combatData.talents.get(i);
		converted.talents.push({ 'id': t.id, 'level': t.level });
	}

	return converted;
}

function makeCreatureCombatDataFromPlainObject(data)
{
	const combatData = new FoFcombat.CreatureCombatData();

	combatData.creatureObjectID = data.creatureObjectID;
	combatData.exp = data.exp;
	combatData.level = data.level;
	
	const abilities = new FoFcombat.CombatAbilities();
	for (let i in data.abilities)
	{
		const a = data.abilities[i];
		abilities[i] = a;
	}
	combatData.abilities = abilities;
	
	const equipment = new FoFcombat.CombatEquipment();
	for (let i in data.equipment)
	{
		const e = data.equipment[i];
		equipment[i] = e;
	}
	combatData.equipment = equipment;

	const spells = new FoFcombat.VectorCombatSpell();
	for (let i in data.spells)
	{
		const s = data.spells[i];
		const cs = new FoFcombat.CombatSpell();
		cs.id = s.id;
		cs.level = s.level;
		spells.push_back(cs);
	}
	combatData.spells = spells;

	const talents = new FoFcombat.VectorCombatTalent();
	for (let i in data.talents)
	{
		const t = data.talents[i];
		const ct = new FoFcombat.CombatTalent();
		ct.id = t.id;
		ct.level = t.level;
		talents.push_back(ct);
	}
	combatData.talents = talents;

	return combatData;
}

function addSelf(pos)
{
	combatSystem.addPlayer(playerID, 0);
	combatSystem.setCreatureFloor(playerID, pos.z);
	combatSystem.setCreaturePosition(playerID, new FoFcombat.Vector2(pos.x, pos.y));
	creatureIDs.push(playerID);
}

function addCreature(creatureID, combatData, position)
{
	combatSystem.addCreature(creatureID, makeCreatureCombatDataFromPlainObject(combatData));
	combatSystem.setCreatureFloor(creatureID, position.z);
	combatSystem.setCreaturePosition(creatureID, new FoFcombat.Vector2(position.x, position.y));
	creatureIDs.push(creatureID);
}

function handleMovement()
{
	if (!combatSystem) return;

	let movementX = 0, movementY = 0;
	if (leftPressed) movementX -= 1;
	if (rightPressed) movementX += 1;
	if (upPressed) movementY -= 1;
	if (downPressed) movementY += 1;

	combatSystem.setCreatureMovement(playerID, movementX, movementY);

	send({ 'message': 'movement', 'movementX': movementX, 'movementY': movementY });
}

function update(time)
{
	let dt = (time - lastUpdateTime) / 1000;
	lastUpdateTime = time;
	
	handleMovement();
	
	if (combatSystem) combatSystem.update(dt);
	
	draw();
	
	requestAnimationFrame(update);
}

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
		creatureSize = tileSize * CREATURE_SIZE_FACTOR;
	}
}

function draw()
{
	canvas2d.clearRect(0, 0, canvas.width, canvas.height);

	drawLoading();
	drawMap();
	drawCreatures();
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

function drawCreatures()
{
	if (!combatSystem) return;

	let tileSizeFactor = tileSize / FoFcombat.FoFSprite.SIZE;
	canvas2d.fillStyle = CREATURE_COLOR;
	for (let i in creatureIDs)
	{
		const creatureID = creatureIDs[i];
		const pos = combatSystem.getCreaturePosition(creatureID);
		let x = pos.x * tileSizeFactor, y = pos.y * tileSizeFactor;
		canvas2d.beginPath();
		canvas2d.arc(x, y, creatureSize / 2, 0, Math.PI * 2);
		canvas2d.fill();
	}
	
	canvas2d.font = CREATURE_NAME_FONT;
	canvas2d.fillStyle = CREATURE_NAME_COLOR;
	for (let i in creatureIDs)
	{
		const creatureID = creatureIDs[i];
		const pos = combatSystem.getCreaturePosition(creatureID);
		let x = pos.x * tileSizeFactor, y = pos.y * tileSizeFactor;
		let nameText = creatureID + (creatureID == playerID ? ' (me)' : '');
		canvas2d.fillText(nameText, x - canvas2d.measureText(nameText).width / 2, y - CREATURE_NAME_OFFSET_Y);
	}
}
