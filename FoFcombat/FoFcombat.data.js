
var Module = typeof FoFcombat !== 'undefined' ? FoFcombat : {};

if (!Module.expectedDataFileDownloads) {
  Module.expectedDataFileDownloads = 0;
  Module.finishedDataFileDownloads = 0;
}
Module.expectedDataFileDownloads++;
(function() {
 var loadPackage = function(metadata) {

    var PACKAGE_PATH;
    if (typeof window === 'object') {
      PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/');
    } else if (typeof location !== 'undefined') {
      // worker
      PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) + '/');
    } else {
      throw 'using preloaded data can only be done on a web page or in a web worker';
    }
    var PACKAGE_NAME = 'out/release/js/FoFcombat.data';
    var REMOTE_PACKAGE_BASE = 'FoFcombat.data';
    if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
      Module['locateFile'] = Module['locateFilePackage'];
      err('warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)');
    }
    var REMOTE_PACKAGE_NAME = Module['locateFile'] ? Module['locateFile'](REMOTE_PACKAGE_BASE, '') : REMOTE_PACKAGE_BASE;
  
    var REMOTE_PACKAGE_SIZE = metadata.remote_package_size;
    var PACKAGE_UUID = metadata.package_uuid;
  
    function fetchRemotePackage(packageName, packageSize, callback, errback) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', packageName, true);
      xhr.responseType = 'arraybuffer';
      xhr.onprogress = function(event) {
        var url = packageName;
        var size = packageSize;
        if (event.total) size = event.total;
        if (event.loaded) {
          if (!xhr.addedTotal) {
            xhr.addedTotal = true;
            if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
            Module.dataFileDownloads[url] = {
              loaded: event.loaded,
              total: size
            };
          } else {
            Module.dataFileDownloads[url].loaded = event.loaded;
          }
          var total = 0;
          var loaded = 0;
          var num = 0;
          for (var download in Module.dataFileDownloads) {
          var data = Module.dataFileDownloads[download];
            total += data.total;
            loaded += data.loaded;
            num++;
          }
          total = Math.ceil(total * Module.expectedDataFileDownloads/num);
          if (Module['setStatus']) Module['setStatus']('Downloading data... (' + loaded + '/' + total + ')');
        } else if (!Module.dataFileDownloads) {
          if (Module['setStatus']) Module['setStatus']('Downloading data...');
        }
      };
      xhr.onerror = function(event) {
        throw new Error("NetworkError for: " + packageName);
      }
      xhr.onload = function(event) {
        if (xhr.status == 200 || xhr.status == 304 || xhr.status == 206 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
          var packageData = xhr.response;
          callback(packageData);
        } else {
          throw new Error(xhr.statusText + " : " + xhr.responseURL);
        }
      };
      xhr.send(null);
    };

    function handleError(error) {
      console.error('package error:', error);
    };
  
      var fetchedCallback = null;
      var fetched = Module['getPreloadedPackage'] ? Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE) : null;

      if (!fetched) fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE, function(data) {
        if (fetchedCallback) {
          fetchedCallback(data);
          fetchedCallback = null;
        } else {
          fetched = data;
        }
      }, handleError);
    
  function runWithFS() {

    function assert(check, msg) {
      if (!check) throw msg + new Error().stack;
    }
Module['FS_createPath']('/', 'res', true, true);
Module['FS_createPath']('/res', 'maps', true, true);
Module['FS_createPath']('/res/maps', 'snowyforest_lana', true, true);
Module['FS_createPath']('/res/maps', 'snowyforest', true, true);
Module['FS_createPath']('/res', 'scripts', true, true);
Module['FS_createPath']('/res/scripts', 'formulas', true, true);

    function DataRequest(start, end, audio) {
      this.start = start;
      this.end = end;
      this.audio = audio;
    }
    DataRequest.prototype = {
      requests: {},
      open: function(mode, name) {
        this.name = name;
        this.requests[name] = this;
        Module['addRunDependency']('fp ' + this.name);
      },
      send: function() {},
      onload: function() {
        var byteArray = this.byteArray.subarray(this.start, this.end);
        this.finish(byteArray);
      },
      finish: function(byteArray) {
        var that = this;

        Module['FS_createDataFile'](this.name, null, byteArray, true, true, true); // canOwn this data in the filesystem, it is a slide into the heap that will never change
        Module['removeRunDependency']('fp ' + that.name);

        this.requests[this.name] = null;
      }
    };

        var files = metadata.files;
        for (var i = 0; i < files.length; ++i) {
          new DataRequest(files[i].start, files[i].end, files[i].audio).open('GET', files[i].filename);
        }

  
    function processPackageData(arrayBuffer) {
      Module.finishedDataFileDownloads++;
      assert(arrayBuffer, 'Loading data file failed.');
      assert(arrayBuffer instanceof ArrayBuffer, 'bad input to processPackageData');
      var byteArray = new Uint8Array(arrayBuffer);
      var curr;
      
        // copy the entire loaded file into a spot in the heap. Files will refer to slices in that. They cannot be freed though
        // (we may be allocating before malloc is ready, during startup).
        var ptr = Module['getMemory'](byteArray.length);
        Module['HEAPU8'].set(byteArray, ptr);
        DataRequest.prototype.byteArray = Module['HEAPU8'].subarray(ptr, ptr+byteArray.length);
  
          var files = metadata.files;
          for (var i = 0; i < files.length; ++i) {
            DataRequest.prototype.requests[files[i].filename].onload();
          }
              Module['removeRunDependency']('datafile_out/release/js/FoFcombat.data');

    };
    Module['addRunDependency']('datafile_out/release/js/FoFcombat.data');
  
    if (!Module.preloadResults) Module.preloadResults = {};
  
      Module.preloadResults[PACKAGE_NAME] = {fromCache: false};
      if (fetched) {
        processPackageData(fetched);
        fetched = null;
      } else {
        fetchedCallback = processPackageData;
      }
    
  }
  if (Module['calledRun']) {
    runWithFS();
  } else {
    if (!Module['preRun']) Module['preRun'] = [];
    Module["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
  }

 }
 loadPackage({"files": [{"start": 0, "audio": 0, "end": 152576, "filename": "/res/data.db"}, {"start": 152576, "audio": 0, "end": 23172376, "filename": "/res/fof.alp"}, {"start": 23172376, "audio": 0, "end": 23186108, "filename": "/res/fof.aoa"}, {"start": 23186108, "audio": 0, "end": 23186146, "filename": "/res/test.lua"}, {"start": 23186146, "audio": 0, "end": 23332402, "filename": "/res/fof.blk"}, {"start": 23332402, "audio": 0, "end": 23615513, "filename": "/res/fof.dat"}, {"start": 23615513, "audio": 0, "end": 53671462, "filename": "/res/fof.spr"}, {"start": 53671462, "audio": 0, "end": 53671495, "filename": "/res/maps/test-house.xml"}, {"start": 53671495, "audio": 0, "end": 53671528, "filename": "/res/maps/test4-audio.xml"}, {"start": 53671528, "audio": 0, "end": 53671561, "filename": "/res/maps/test-audio.xml"}, {"start": 53671561, "audio": 0, "end": 53699788, "filename": "/res/maps/test.otbm"}, {"start": 53699788, "audio": 0, "end": 53781746, "filename": "/res/maps/snowyforest_lana/snowyforest_lana3.otbm"}, {"start": 53781746, "audio": 0, "end": 53781779, "filename": "/res/maps/snowyforest_lana/snowyforest_lana3-house.xml"}, {"start": 53781779, "audio": 0, "end": 53859635, "filename": "/res/maps/snowyforest_lana/snowyforest_lana4.otbm"}, {"start": 53859635, "audio": 0, "end": 53938836, "filename": "/res/maps/snowyforest_lana/snowyforest_lana10.otbm"}, {"start": 53938836, "audio": 0, "end": 54019232, "filename": "/res/maps/snowyforest_lana/snowyforest_lana8.otbm"}, {"start": 54019232, "audio": 0, "end": 54096623, "filename": "/res/maps/snowyforest_lana/snowyforest_lana9.otbm"}, {"start": 54096623, "audio": 0, "end": 54176206, "filename": "/res/maps/snowyforest_lana/snowyforest_lana2.otbm"}, {"start": 54176206, "audio": 0, "end": 54251919, "filename": "/res/maps/snowyforest_lana/snowyforest_lana7.otbm"}, {"start": 54251919, "audio": 0, "end": 54356364, "filename": "/res/maps/snowyforest_lana/snowyforest_lana5.otbm"}, {"start": 54356364, "audio": 0, "end": 54431739, "filename": "/res/maps/snowyforest_lana/snowyforest_lana6.otbm"}, {"start": 54431739, "audio": 0, "end": 54507916, "filename": "/res/maps/snowyforest_lana/snowyforest_lana1.otbm"}, {"start": 54507916, "audio": 0, "end": 54576195, "filename": "/res/maps/snowyforest/snowyforest7.otbm"}, {"start": 54576195, "audio": 0, "end": 54644474, "filename": "/res/maps/snowyforest/snowyforest8.otbm"}, {"start": 54644474, "audio": 0, "end": 54713543, "filename": "/res/maps/snowyforest/snowyforest2.otbm"}, {"start": 54713543, "audio": 0, "end": 54713576, "filename": "/res/maps/snowyforest/snowyforest6-house.xml"}, {"start": 54713576, "audio": 0, "end": 54713609, "filename": "/res/maps/snowyforest/snowyforest11-house.xml"}, {"start": 54713609, "audio": 0, "end": 54781891, "filename": "/res/maps/snowyforest/snowyforest15.otbm"}, {"start": 54781891, "audio": 0, "end": 54850173, "filename": "/res/maps/snowyforest/snowyforest10.otbm"}, {"start": 54850173, "audio": 0, "end": 54918452, "filename": "/res/maps/snowyforest/snowyforest4.otbm"}, {"start": 54918452, "audio": 0, "end": 54918485, "filename": "/res/maps/snowyforest/snowyforest3-house.xml"}, {"start": 54918485, "audio": 0, "end": 54918518, "filename": "/res/maps/snowyforest/snowyforest10-house.xml"}, {"start": 54918518, "audio": 0, "end": 54918551, "filename": "/res/maps/snowyforest/snowyforest4-house.xml"}, {"start": 54918551, "audio": 0, "end": 54986833, "filename": "/res/maps/snowyforest/snowyforest11.otbm"}, {"start": 54986833, "audio": 0, "end": 54986866, "filename": "/res/maps/snowyforest/snowyforest8-house.xml"}, {"start": 54986866, "audio": 0, "end": 54986899, "filename": "/res/maps/snowyforest/snowyforest9-house.xml"}, {"start": 54986899, "audio": 0, "end": 55055181, "filename": "/res/maps/snowyforest/snowyforest13.otbm"}, {"start": 55055181, "audio": 0, "end": 55123460, "filename": "/res/maps/snowyforest/snowyforest6.otbm"}, {"start": 55123460, "audio": 0, "end": 55123493, "filename": "/res/maps/snowyforest/snowyforest14-house.xml"}, {"start": 55123493, "audio": 0, "end": 55191772, "filename": "/res/maps/snowyforest/snowyforest9.otbm"}, {"start": 55191772, "audio": 0, "end": 55260054, "filename": "/res/maps/snowyforest/snowyforest12.otbm"}, {"start": 55260054, "audio": 0, "end": 55260087, "filename": "/res/maps/snowyforest/snowyforest12-house.xml"}, {"start": 55260087, "audio": 0, "end": 55260120, "filename": "/res/maps/snowyforest/snowyforest7-house.xml"}, {"start": 55260120, "audio": 0, "end": 55260153, "filename": "/res/maps/snowyforest/snowyforest1-house.xml"}, {"start": 55260153, "audio": 0, "end": 55260186, "filename": "/res/maps/snowyforest/snowyforest5-house.xml"}, {"start": 55260186, "audio": 0, "end": 55328465, "filename": "/res/maps/snowyforest/snowyforest5.otbm"}, {"start": 55328465, "audio": 0, "end": 55328498, "filename": "/res/maps/snowyforest/snowyforest2-house.xml"}, {"start": 55328498, "audio": 0, "end": 55396780, "filename": "/res/maps/snowyforest/snowyforest14.otbm"}, {"start": 55396780, "audio": 0, "end": 55396813, "filename": "/res/maps/snowyforest/snowyforest13-house.xml"}, {"start": 55396813, "audio": 0, "end": 55465092, "filename": "/res/maps/snowyforest/snowyforest3.otbm"}, {"start": 55465092, "audio": 0, "end": 55534981, "filename": "/res/maps/snowyforest/snowyforest1.otbm"}, {"start": 55534981, "audio": 0, "end": 55535014, "filename": "/res/maps/snowyforest/snowyforest15-house.xml"}, {"start": 55535014, "audio": 0, "end": 55535157, "filename": "/res/scripts/formulas/magical_resistance.lua"}, {"start": 55535157, "audio": 0, "end": 55535429, "filename": "/res/scripts/formulas/magical_value.lua"}, {"start": 55535429, "audio": 0, "end": 55535505, "filename": "/res/scripts/formulas/crit.lua"}, {"start": 55535505, "audio": 0, "end": 55535658, "filename": "/res/scripts/formulas/melee_damage.lua"}, {"start": 55535658, "audio": 0, "end": 55535756, "filename": "/res/scripts/formulas/protection_physical.lua"}, {"start": 55535756, "audio": 0, "end": 55535832, "filename": "/res/scripts/formulas/full_defense.lua"}, {"start": 55535832, "audio": 0, "end": 55536202, "filename": "/res/scripts/formulas/ranged_damage.lua"}], "remote_package_size": 55536202, "package_uuid": "fde6fe9f-c1f7-42a8-b95c-e59a936a4f28"});

})();
