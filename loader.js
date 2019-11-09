window.Loader = {
	loadDB: () =>
	{
		const db = FoFcombat.DB.getInstance();
		return db.open('/res/data.db');
	},

	loadData: () =>
	{
		const progressCallback = new FoFcombat.ProgressCallback(() => {});
		return FoFcombat.ObjectsCollection.getInstance().loadData('/res/fof.dat', progressCallback);
	},

	loadSpritesRGB: () =>
	{
		const progressCallback = new FoFcombat.ProgressCallback(() => {});
		return FoFcombat.ObjectsCollection.getInstance().loadSpritesRGB('/res/fof.spr', progressCallback, false);
	},

	loadSpritesAlpha: () =>
	{
		const progressCallback = new FoFcombat.ProgressCallback(() => {});
		return FoFcombat.ObjectsCollection.getInstance().loadSpritesAlpha('/res/fof.alp', progressCallback, false);
	},
		
	loadSpritesBlockingStatesAndElevations: () =>
	{
		const progressCallback = new FoFcombat.ProgressCallback(() => {});
		return FoFcombat.ObjectsCollection.getInstance().loadSpritesBlockingStatesAndElevations('/res/fof.blk', progressCallback);
	},

	loadAdvancedObjectAttributes: () =>
	{
		const progressCallback = new FoFcombat.ProgressCallback(() => {});
		return FoFcombat.ObjectsCollection.getInstance().loadAdvancedObjectAttributes('/res/fof.aoa', progressCallback);
	},

	loadOTBMap: (mapFilename) =>
	{
		if (!mapFilename) mapFilename = 'test.otbm';

		const progressCallback = new FoFcombat.ProgressCallback(() => {});
		Loader.otbMap = new FoFcombat.OTBMap();
		return Loader.otbMap.load('/res/maps/' + mapFilename, progressCallback);
	},

	buildUniversalTileMap: () =>
	{
		const progressCallback = new FoFcombat.ProgressCallback(() => {});
		Loader.universalTileMap = new FoFcombat.UniversalTileMap();
		return Loader.universalTileMap.build(Loader.otbMap, progressCallback);
	}
}
