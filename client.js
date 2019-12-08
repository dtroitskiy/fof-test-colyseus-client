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
const PROJECTILE_SIZE_FACTOR = 0.1;
const PROJECTILE_COLOR = 'rgb(51, 17, 0)';
const ACTION_BUTTON_SIZE_FACTOR = 0.075;
const ACTION_BUTTON_SPACING_FACTOR = 0.15;
const ACTION_BUTTON_Y_FACTOR = 0.9;
const ACTION_BUTTON_BG_COLOR = 'rgb(243, 183, 0)';
const ACTION_BUTTON_BG_HL_COLOR = 'rgb(255, 200, 33)';
const ACTION_BUTTON_LABEL_COLOR = 'rgb(255, 255, 255)';
const ACTION_BUTTON_LABEL_FONT_SIZE_FACTOR = 0.2;
const DEATH_MESSAGE_TEXT_COLOR = 'rgb(200, 0, 0)';
const DEATH_MESSAGE_TITLE_FONT = '36px Arial';
const DEATH_MESSAGE_HINT_FONT = '18px Arial';
const DEATH_MESSAGE_FRAME_COLOR = 'rgb(200, 0, 0)';
const DEATH_MESSAGE_BG_COLOR = 'rgb(255, 255, 255)';
const DEATH_MESSAGE_FRAME_WIDTH_FACTOR = 0.01;
const DEATH_MESSAGE_SPACING_FACTOR = 1.0;
const BLOOD_EFFECT_COLOR = 'rgb(255, 0, 0)';
const BLOOD_EFFECT_CHARACTER = '*';
const BLOOD_EFFECT_FONT = 'Arial';
const BLOOD_EFFECT_MIN_FONT_SIZE_FACTOR = 1;
const BLOOD_EFFECT_MAX_FONT_SIZE_FACTOR = 4;
const BLOOD_EFFECT_TIME = 0.25;

let loadingLabel = 'Initializing', loadingPercentage = 0;

let canvas = null, canvas2d = null;

let isConnected = false;
let send = function() {};

let universalTileMap = null, combatSystem = null;

let creatures = {};
let playerID = 0;
let isDead = false;
let projectiles = {};
let effects = {};

let tileSize = 0, creatureSize = 0, projectileSize = 0;
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
		isConnected = true;

		playerID = room.sessionId;
		send = room.send.bind(room);
		room.onMessage(handleMessage);

		room.onLeave(() =>
		{
		  console.log('Left room %s', room.name);
		  isConnected = false;
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
			addSelf(data.creature);
		break;
		case 'addCreature':
			addCreature(data.creature);
		break;
		case 'addCreatures':
			for (let id in data.creatures)
			{
				addCreature(data.creatures[id]);
			}
		break;
		case 'removeCreature':
			delete creatures[data.creatureID];
			combatSystem.removeCreature(data.creatureID);
		break;
		case 'movement':
			combatSystem.setCreatureMovement(data.creatureID, data.movementX, data.movementY);
		break;
		case 'swapWeapon':
			combatSystem.swapCreatureWeapon(data.creatureID);
		break;
		case 'swapAmmo':
			combatSystem.swapCreatureAmmo(data.creatureID);
		break;
		case 'spellUsed':
			combatSystem.setCreatureUsedSpell(data.creatureID, data.spellID, new FoFcombat.Vector2(data.position.x, data.position.y));
		break;
		case 'abilityChanged':
			handleAbilityChanged(data);
		break;
		case 'creatureKilled':
			delete creatures[data.killedCreatureID];
			combatSystem.removeCreature(data.killedCreatureID);
			isDead = (data.killedCreatureID == playerID);
		break;
		case 'effectRequested':
			handleEffectPlayRequested(data);
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
	if (CONNECT) combatSystem.setSlave(true);

	const onCreaturePositionChangedHandler = new FoFcombat.CreaturePositionChangedCallback(onCreaturePositionChanged);
	combatSystem.addCreatureOnPositionChangedHandler(onCreaturePositionChangedHandler);

	if (!CONNECT)
	{
		const onCreatureHPChangedHandler = new FoFcombat.CreatureHPChangedCallback(onCreatureHPChanged);
		combatSystem.addCreatureOnHPChangedHandler(onCreatureHPChangedHandler);
	}

	const onCreatureAttackHandler = new FoFcombat.CreatureAttackCallback(onCreatureAttack);
	combatSystem.addCreatureOnAttackHandler(onCreatureAttackHandler);

	const onProjectileAddedHandler = new FoFcombat.ProjectileAddedCallback(onProjectileAdded);
	combatSystem.addProjectileOnAddedHandler(onProjectileAddedHandler);

	const onProjectilePositionChangedHandler = new FoFcombat.ProjectilePositionChangedCallback(onProjectilePositionChanged);
	combatSystem.addProjectileOnPositionChangedHandler(onProjectilePositionChangedHandler);

	const onProjectileRemovedHandler = new FoFcombat.ProjectileRemovedCallback(onProjectileRemoved);
	combatSystem.addProjectileOnRemovedHandler(onProjectileRemovedHandler);

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

function onCreatureAttack(creatureID, animSetName, direction)
{
	const creature = creatures[creatureID];
	creature.direction.x = direction.x;
	creature.direction.y = direction.y;
}

function onProjectileAdded(projectileID, projectileObjectID, position, floor, direction, length)
{
	projectiles[projectileID] = {
		'id': projectileID,
		'position': { 'x': position.x, 'y': position.y }
	};
}

function onProjectilePositionChanged(projectileID, position)
{
	const projectile = projectiles[projectileID];
	projectile.position.x = position.x;
	projectile.position.y = position.y;
}

function onProjectileRemoved(projectileID)
{
	delete projectiles[projectileID];
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

function addSelf(creature)
{
	delete creature.combatData; // we don't need this field locally
	creature.direction = { 'x': 0, 'y': -1 };
	creatures[creature.id] = creature;

	combatSystem.addPlayer(playerID, 0);
	combatSystem.setCreatureFloor(playerID, creature.position.z);
	combatSystem.setCreaturePosition(playerID, new FoFcombat.Vector2(creature.position.x, creature.position.y));

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

function addCreature(creature)
{
	const combatData = makeCreatureCombatDataFromPlainObject(creature.combatData);
	delete creature.combatData; // we don't need this field anymore
	creature.direction = { 'x': 0, 'y': -1 };
	creatures[creature.id] = creature;

	combatSystem.addCreature(creature.id, combatData);
	combatSystem.setCreatureFloor(creature.id, creature.position.z);
	combatSystem.setCreaturePosition(creature.id, new FoFcombat.Vector2(creature.position.x, creature.position.y));
}

function handleAbilityChanged(data)
{
	const creature = creatures[data.creatureID];
	if (creature)
	{
		if (data.HP)
		{
			creature.HP.current = data.HP.current;
			creature.HP.total = data.HP.total;
			combatSystem.setCreatureHP(data.creatureID, data.HP.current, data.HP.total);
		}
	}
}

function handleEffectPlayRequested(data)
{
	// here we imitate handling blood effect
	if (data.effectObjectID >= 5 && data.effectObjectID <= 14)
	{
		effects[data.effectID] = {
			'position': data.position,
			'time': BLOOD_EFFECT_TIME
		};
	}
}

function handleMovement()
{
	if (!combatSystem) return;

	let movementX = 0, movementY = 0;
	if (leftPressed) movementX -= 1;
	if (rightPressed) movementX += 1;
	if (upPressed) movementY -= 1;
	if (downPressed) movementY += 1;

	if (movementX != lastMovementX || movementY != lastMovementY)
	{
		combatSystem.setCreatureMovement(playerID, movementX, movementY);

		send({ 'message': 'movement', 'movementX': movementX, 'movementY': movementY });
		
		lastMovementX = movementX;
		lastMovementY = movementY;
	}
}

function handlePlayerUsedSpell(position)
{
	// because we're using artificial melee & ranged attack buttons
	// we manually verify selected button and currently equipped weapon (assuming that default melee weapon - sword - has ID 1)
	const weaponID = combatSystem.getCreatureCurrentWeaponID(playerID);
	if ((selectedActionButton.spellStrID == 'melee_attack' && weaponID != 1) ||
	    (selectedActionButton.spellStrID == 'ranged_attack' && weaponID == 1))
	{
		combatSystem.swapCreatureWeapon(playerID);
		send({ 'message': 'swapWeapon' });
	}

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

	updateEffects(dt);
	
	draw();
	
	requestAnimationFrame(update);
}

function updateEffects(dt)
{
	for (let id in effects)
	{
		const effect = effects[id];
		effect.time -= dt;
		if (effect.time <= 0)
		{
			delete effects[id];
		}
	}
}

// INPUT
document.addEventListener('keydown', function(event)
{
	if (!isConnected || isDead) return;
	
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
	if (!isConnected || isDead) return;
	
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
	if (!isConnected || isDead) return;
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
		projectileSize = tileSize * PROJECTILE_SIZE_FACTOR;
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
	drawProjectiles();
	drawEffects();
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

function drawProjectiles()
{
	if (!combatSystem) return;

	const tileSizeFactor = tileSize / FoFcombat.FoFSprite.SIZE;
	canvas2d.fillStyle = PROJECTILE_COLOR;
	for (let id in projectiles)
	{
		const projectile = projectiles[id];
		const x = mapDrawX + projectile.position.x * tileSizeFactor, y = mapDrawY + projectile.position.y * tileSizeFactor;
		canvas2d.beginPath();
		canvas2d.arc(x, y, projectileSize, 0, Math.PI * 2);
		canvas2d.fill();
	}
}

function drawEffects()
{
	if (!combatSystem) return;

	const tileSizeFactor = tileSize / FoFcombat.FoFSprite.SIZE;
	canvas2d.fillStyle = BLOOD_EFFECT_COLOR;
	for (let id in effects)
	{
		const effect = effects[id];
		const x = mapDrawX + effect.position.x * tileSizeFactor, y = mapDrawY + effect.position.y * tileSizeFactor;
		const effectTimeFactor = (1 - effect.time / BLOOD_EFFECT_TIME);
		const fontSize = tileSize * (BLOOD_EFFECT_MIN_FONT_SIZE_FACTOR + (BLOOD_EFFECT_MAX_FONT_SIZE_FACTOR
		               - BLOOD_EFFECT_MIN_FONT_SIZE_FACTOR) * effectTimeFactor);
		canvas2d.font = fontSize + 'px ' + BLOOD_EFFECT_FONT;
		const textMetrics = canvas2d.measureText(BLOOD_EFFECT_CHARACTER);
		textMetrics.height = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
		canvas2d.save();
		canvas2d.translate(x, y);
		canvas2d.rotate(Math.PI * effectTimeFactor);
		canvas2d.fillText(BLOOD_EFFECT_CHARACTER, -textMetrics.width / 2, textMetrics.height * 0.8);
		canvas2d.restore();
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

	if (!isConnected || isDead)
	{
		canvas2d.font = DEATH_MESSAGE_TITLE_FONT;
		let title = '';
		if (isDead) title = "You're dead!";
		else if (!isConnected) title = "You're disconnected!";
		const titleMetrics = canvas2d.measureText(title);
		titleMetrics.height = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;

		canvas2d.font = DEATH_MESSAGE_HINT_FONT;
		const hint = 'Reload page to restart.';
		const hintMetrics = canvas2d.measureText(hint);
		hintMetrics.height = hintMetrics.actualBoundingBoxAscent + hintMetrics.actualBoundingBoxDescent;

		const spacing = titleMetrics.height * DEATH_MESSAGE_SPACING_FACTOR;
		const boxWidth = Math.max(titleMetrics.width, hintMetrics.width) + spacing * 2;
		const boxHeight = titleMetrics.height + hintMetrics.height + spacing * 2;

		let x = (canvas.width - boxWidth) / 2, y = (canvas.height - boxHeight) / 2;
		canvas2d.fillStyle = DEATH_MESSAGE_FRAME_COLOR;
		canvas2d.fillRect(x, y, boxWidth, boxHeight);
		
		const frameThickness = boxWidth * DEATH_MESSAGE_FRAME_WIDTH_FACTOR;
		canvas2d.fillStyle = DEATH_MESSAGE_BG_COLOR;
		canvas2d.fillRect(x + frameThickness, y + frameThickness, boxWidth - frameThickness * 2, boxHeight - frameThickness * 2);

		x = (canvas.width - titleMetrics.width) / 2;
		y = canvas.height / 2;
		canvas2d.fillStyle = DEATH_MESSAGE_TEXT_COLOR;
		canvas2d.font = DEATH_MESSAGE_TITLE_FONT;
		canvas2d.fillText(title, x, y);

		x = (canvas.width - hintMetrics.width) / 2;
		y += hintMetrics.height * 1.5;
		canvas2d.font = DEATH_MESSAGE_HINT_FONT;
		canvas2d.fillText(hint, x, y);
	}
}
