'use strict';

const CONNECT = true;
const TEST_PLAYER_POS = { 'x': 20, 'y': 15 };

const LOADING_COLOR = 'rgb(0, 255, 0)';
const LOADING_FONT = '36px Arial';
const LOADING_PROGRESS_BAR_SIZE_FACTORS = { 'width': 0.2, 'height': 0.1 };
const LOADING_V_SPACING_FACTOR = 0.02;
const TILE_SPACING = 1;
const TILE_FREE_COLOR = 'rgb(192, 255, 192)';
const TILE_BLOCKING_COLOR = 'rgb(255, 192, 192)';
const CREATURE_SIZE_FACTOR = 0.75;
const CREATURE_DIR_TRIANGLE_ANGLE = Math.PI / 4;
const CREATURE_COLOR = 'rgb(0, 0, 255)';
const CREATURE_NAME_FONT = '12px Arial';
const CREATURE_NAME_COLOR = 'black';
const CREATURE_HP_BAR_BG_COLOR = 'rgb(128, 128, 128)';
const CREATURE_HP_BAR_FILL_COLOR = 'rgb(255, 0, 0)';
const CREATURE_HP_BAR_LINE_WIDTH = 2;
const ACTION_BUTTON_SIZE_FACTOR = 0.075;
const ACTION_BUTTON_SPACING_FACTOR = 0.15;
const ACTION_BUTTON_Y_FACTOR = 0.9;
const ACTION_BUTTON_BG_COLOR = 'rgb(243, 183, 0)';
const ACTION_BUTTON_BG_HL_COLOR = 'rgb(255, 200, 33)';
const ACTION_BUTTON_LABEL_COLOR = 'rgb(255, 255, 255)';
const ACTION_BUTTON_LABEL_FONT_SIZE_FACTOR = 0.2;

let loadingLabel = 'Initializing', loadingPercentage = 0;

let canvas = null, canvas2d = null;

let connected = false;
let send = function() {};

let universalTileMap = null, combatSystem = null;

let creatures = {};
let playerID = 0;

let tileSize = 0, creatureSize = 0;
let mapPixelWidth = 0, mapPixelHeight = 0;
let mapDrawX = 0, mapDrawY = 0;

let actionButtons = [];
let actionButtonSize = 0, actionButtonSpacing = 0;
let actionButtonsPanelWidth = 0, actionButtonsPanelX = 0, actionButtonsPanelY = 0;
let actionButtonLabelFont = null;
let selectedActionButton = null;

let lastUpdateTime = 0;

let leftPressed = false, rightPressed = false, upPressed = false, downPressed = false;
let lastMovementX = 0, lastMovementY = 0;

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
			addCreature(data.creatureID, data.combatData, data.position);
		break;
		case 'addCreatures':
			for (let i in data.creaturesData)
			{
				const cd = data.creaturesData[i];
				addCreature(cd.creatureID, cd.combatData, cd.position);
			}
		break;
		case 'movement':
			combatSystem.setCreatureMovement(data.creatureID, data.movementX, data.movementY);
		break;
		case 'sync':
			sync(data.syncData);
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
			if (func.name == 'loadAdvancedObjectAttributes')
			{
				loadingLabel = 'Loading map';
			}
			if (func.name == 'bound loadOTBMap')
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

	const onCreaturePositionChangedHandler = new FoFcombat.CreaturePositionChangedCallback(onCreaturePositionChanged);
	combatSystem.addCreatureOnPositionChangedHandler(onCreaturePositionChangedHandler);

	const onCreatureHPChangedHandler = new FoFcombat.CreatureHPChangedCallback(onCreatureHPChanged);
	combatSystem.addCreatureOnHPChangedHandler(onCreatureHPChangedHandler);

	let playerCombatData = combatSystem.preparePlayerCombatData(0);
	playerCombatData = convertCreatureCombatDataToPlainObject(playerCombatData);

	send({ 'message': 'addPlayer', 'combatData': playerCombatData });

	resize(); // needed to update tile and other objects sizes based on map size
}

function onCreaturePositionChanged(creatureID, position, direction)
{
	const creature = creatures[creatureID];
	creature.position.x = position.x;
	creature.position.y = position.y;
	if (direction.x != 0 || direction.y != 0)
	{
		creature.direction.x = direction.x;
		creature.direction.y = direction.y;
	}
}

function onCreatureHPChanged(creatureID, currentHP, totalHP, changeType)
{
	const creature = creatures[creatureID];
	creature.HP.current = currentHP;
	creature.HP.total = totalHP;
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

function makeCreatureBase()
{
	return {
		'id': 0,
		'position': { 'x': 0, 'y': 0 },
		'direction': { 'x': 0, 'y': -1 },
		'HP': { 'current': 0, 'total': 0 }
	};
}

function addSelf(position)
{
	const creature = makeCreatureBase();
	creature.id = playerID;
	creatures[creature.id] = creature;

	combatSystem.addPlayer(playerID, 0);
	combatSystem.setCreatureFloor(playerID, position.z);
	combatSystem.setCreaturePosition(playerID, new FoFcombat.Vector2(position.x, position.y));

	// for now not using real spells, instead making two action buttons, one for melee attack and one for ranged attack
	actionButtons.push({
		'spellID': 1,
		'spellStrID': 'melee_attack',
		'label': "1\nMelee\nAttack"
	});
	actionButtons.push({
		'spellID': 1,
		'spellStrID': 'ranged_attack',
		'label': '2\nRanged\nAttack'
	});

	resize();
}

function addCreature(creatureID, combatData, position)
{
	const creature = makeCreatureBase();
	creature.id = creatureID;
	creatures[creature.id] = creature;

	combatSystem.addCreature(creatureID, makeCreatureCombatDataFromPlainObject(combatData));
	combatSystem.setCreatureFloor(creatureID, position.z);
	combatSystem.setCreaturePosition(creatureID, new FoFcombat.Vector2(position.x, position.y));
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

	if (movementX != lastMovementX || movementY != lastMovementY)
	{
		send({ 'message': 'movement', 'movementX': movementX, 'movementY': movementY });
		lastMovementX = movementX;
		lastMovementY = movementY;
	}
}

function handlePlayerUsedSpell(position)
{
	combatSystem.setCreatureUsedSpell(playerID, selectedActionButton.spellID, new FoFcombat.Vector2(position.x, position.y));
	send({ 'message': 'spellUsed', 'spellID': selectedActionButton.spellID, 'position': position });
}

function sync(data)
{
	const halfTileSize = FoFcombat.FoFSprite.SIZE / 2;
	for (let i in data)
	{
		const d = data[i];
		const creature = creatures[d.creatureID];
		if (Math.abs(creature.position.x - d.position.x) > halfTileSize || Math.abs(creature.position.y - d.position.y) > halfTileSize)
		{
			console.log('Synchronizing position for %s', d.creatureID);
			creature.position.x = d.position.x;
			creature.position.y = d.position.y;
			combatSystem.setCreaturePosition(d.creatureID, new FoFcombat.Vector2(creature.position.x, creature.position.y));
			combatSystem.resetCreatureMovementDirection(d.creatureID);
		}
	}
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

	const numKey = parseInt(event.key);
	if (!isNaN(numKey) && actionButtons.length > numKey - 1)
	{
		selectedActionButton = actionButtons[numKey - 1];
	}
});

document.addEventListener('mouseup', function(event)
{
	if (event.button != 0) return;

	let actionButtonSelected = false;
	for (let i = 0; i < actionButtons.length; ++i)
	{
		const buttonX = actionButtonsPanelX + i * (actionButtonSize + actionButtonSpacing);
		if (event.x >= buttonX && event.x <= buttonX + actionButtonSize &&
		    event.y >= actionButtonsPanelY && event.y <= actionButtonsPanelY + actionButtonSize)
		{
			selectedActionButton = actionButtons[i];
			actionButtonSelected = true;
			break;
		}
	}
	// if action button wasn't clicked, then it's click on the map
	// and we must handle spell usage if it's already selected
	if (!actionButtonSelected && selectedActionButton)
	{
		const tileSizeFactor = tileSize / FoFcombat.FoFSprite.SIZE;
		const pos = { 'x': (event.x - mapDrawX) / tileSizeFactor, 'y': (event.y - mapDrawY) / tileSizeFactor };
		handlePlayerUsedSpell(pos);
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
		mapPixelWidth = tileSize * universalTileMap.width;
		mapPixelHeight = tileSize * universalTileMap.height;
		mapDrawX = (canvas.clientWidth - mapPixelWidth) / 2;
		mapDrawY = (canvas.clientHeight - mapPixelHeight) / 2;

		creatureSize = tileSize * CREATURE_SIZE_FACTOR;
	}

	if (actionButtons.length)
	{
		actionButtonSize = mapPixelHeight * ACTION_BUTTON_SIZE_FACTOR;
		actionButtonSpacing = actionButtonSize * ACTION_BUTTON_SPACING_FACTOR;
		actionButtonsPanelWidth = actionButtons.length * (actionButtonSize + actionButtonSpacing) - actionButtonSpacing;
		actionButtonsPanelX = mapDrawX + (mapPixelWidth - actionButtonsPanelWidth) / 2;
		actionButtonsPanelY = mapDrawY + mapPixelHeight * ACTION_BUTTON_Y_FACTOR;
		actionButtonLabelFont = 'bold ' + Math.round(actionButtonSize * ACTION_BUTTON_LABEL_FONT_SIZE_FACTOR) + 'px Arial';
	}
}

function draw()
{
	canvas2d.clearRect(0, 0, canvas.width, canvas.height);

	drawLoading();
	drawMap();
	drawCreatures();
	drawUI();
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
	
	const vSpacing = canvas.width * LOADING_V_SPACING_FACTOR;

	const totalLoadingHeight = textMetrics.height + vSpacing + progressBarSize.height;

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

	for (let tileX = 0; tileX < universalTileMap.width; ++tileX)
	{
		for (let tileY = 0; tileY < universalTileMap.height; ++tileY)
		{
			const tile = universalTileMap.getTile(tileX, tileY, FoFcombat.UniversalTileMap.GROUND_FLOOR); // for now always drawing only ground floor
			canvas2d.fillStyle = tile.isBlocking ? TILE_BLOCKING_COLOR : TILE_FREE_COLOR;
			canvas2d.fillRect(mapDrawX + tileX * tileSize + TILE_SPACING, mapDrawY + tileY * tileSize + TILE_SPACING,
			                  tileSize - TILE_SPACING * 2, tileSize - TILE_SPACING * 2);
		}
	}
}

function drawCreatures()
{
	if (!combatSystem) return;

	const tileSizeFactor = tileSize / FoFcombat.FoFSprite.SIZE;
	const halfTileSize = tileSize / 2, creatureHalfSize = creatureSize / 2;
	const plusAngleSin = Math.sin(CREATURE_DIR_TRIANGLE_ANGLE), plusAngleCos = Math.cos(CREATURE_DIR_TRIANGLE_ANGLE);
	const minusAngleSin = Math.sin(-CREATURE_DIR_TRIANGLE_ANGLE), minusAngleCos = Math.cos(-CREATURE_DIR_TRIANGLE_ANGLE);
	canvas2d.fillStyle = canvas2d.strokeStyle = CREATURE_COLOR;
	canvas2d.font = CREATURE_NAME_FONT;
	const nameTextMetrics = canvas2d.measureText('A');
	const nameTextHeight = nameTextMetrics.actualBoundingBoxAscent + nameTextMetrics.actualBoundingBoxDescent;

	for (let id in creatures)
	{
		const creature = creatures[id];

		// drawing creature circle
		const x = mapDrawX + creature.position.x * tileSizeFactor, y = mapDrawY + creature.position.y * tileSizeFactor;
		canvas2d.beginPath();
		canvas2d.arc(x, y, creatureHalfSize, 0, Math.PI * 2);
		canvas2d.fill();

		// drawing direction triangle
		canvas2d.beginPath();
		const tipX = x + creature.direction.x * halfTileSize, tipY = y + creature.direction.y * halfTileSize;
		canvas2d.moveTo(tipX, tipY);
		const side1X = x + (creature.direction.x * minusAngleCos - creature.direction.y * minusAngleSin) * creatureHalfSize;
		const side1Y = y + (creature.direction.x * minusAngleSin + creature.direction.y * minusAngleCos) * creatureHalfSize;
		canvas2d.lineTo(side1X, side1Y);
		const side2X = x + (creature.direction.x * plusAngleCos - creature.direction.y * plusAngleSin) * creatureHalfSize;
		const side2Y = y + (creature.direction.x * plusAngleSin + creature.direction.y * plusAngleCos) * creatureHalfSize;
		canvas2d.lineTo(side2X, side2Y);
		canvas2d.closePath();
		canvas2d.fill();
	}
	
	// drawing creature name and HP bar
	canvas2d.fillStyle = CREATURE_NAME_COLOR;
	canvas2d.lineWidth = CREATURE_HP_BAR_LINE_WIDTH;
	for (let id in creatures)
	{
		const creature = creatures[id];
		const x = mapDrawX + creature.position.x * tileSizeFactor, y = mapDrawY + creature.position.y * tileSizeFactor;
		const nameText = id + (id == playerID ? ' (me)' : '');
		canvas2d.fillText(nameText, x - canvas2d.measureText(nameText).width / 2, y + halfTileSize + nameTextHeight);

		let hpBarStartX = x - halfTileSize, hpBarEndX = hpBarStartX + tileSize, hpBarY = y - halfTileSize - CREATURE_HP_BAR_LINE_WIDTH;
		canvas2d.strokeStyle = CREATURE_HP_BAR_BG_COLOR;
		canvas2d.beginPath();
		canvas2d.moveTo(hpBarStartX, hpBarY);
		canvas2d.lineTo(hpBarEndX, hpBarY);
		canvas2d.stroke();
		hpBarEndX = hpBarStartX + tileSize * (creature.HP.current / creature.HP.total);
		canvas2d.strokeStyle = CREATURE_HP_BAR_FILL_COLOR;
		canvas2d.beginPath();
		canvas2d.moveTo(hpBarStartX, hpBarY);
		canvas2d.lineTo(hpBarEndX, hpBarY);
		canvas2d.stroke();
	}
}

function drawUI()
{
	if (actionButtons.length == 0) return;

	canvas2d.font = actionButtonLabelFont;
	const labelTextMetrics = canvas2d.measureText('A');
	const labelTextHeight = (labelTextMetrics.actualBoundingBoxAscent + labelTextMetrics.actualBoundingBoxDescent);
	const labelTextLineHeight = labelTextHeight * 0.5;

	for (let i = 0; i < actionButtons.length; ++i)
	{
		const button = actionButtons[i];
		const buttonX = actionButtonsPanelX + i * (actionButtonSize + actionButtonSpacing);
		canvas2d.fillStyle = (button == selectedActionButton ? ACTION_BUTTON_BG_HL_COLOR : ACTION_BUTTON_BG_COLOR);
		canvas2d.fillRect(buttonX, actionButtonsPanelY, actionButtonSize, actionButtonSize);

		const buttonCenterX = buttonX + actionButtonSize / 2;
		const labelParts = button.label.split('\n');
		canvas2d.fillStyle = ACTION_BUTTON_LABEL_COLOR;
		let labelY = actionButtonsPanelY + labelTextHeight + labelTextLineHeight
		           + (actionButtonSize - labelParts.length * (labelTextHeight + labelTextLineHeight)- labelTextLineHeight) / 2;
		for (let j = 0; j < labelParts.length; ++j)
		{
			const part = labelParts[j];
			canvas2d.fillText(part, buttonCenterX - canvas2d.measureText(part).width / 2, labelY);
			labelY += labelTextHeight + labelTextLineHeight;
		}
	}
}
