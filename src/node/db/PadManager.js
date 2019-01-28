/**
 * The Pad Manager is a Factory for pad Objects
 */

/*
 * 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var ERR = require("async-stacktrace");
var customError = require("../utils/customError");
var Pad = require("../db/Pad").Pad;
var db = require("./DB").db;
const thenify = require("thenify").withCallback;

/** 
 * A cache of all loaded Pads.
 *
 * Provides "get" and "set" functions,
 * which should be used instead of indexing with brackets. These prepend a
 * colon to the key, to avoid conflicting with built-in Object methods or with
 * these functions themselves.
 *
 * If this is needed in other places, it would be wise to make this a prototype
 * that's defined somewhere more sensible.
 */
var globalPads = {
    get: function (name) { return this[':'+name]; },
    set: function (name, value) 
    {
      this[':'+name] = value;
    },
    remove: function (name) {
      delete this[':'+name];
    }
};

/**
 * A cache of the list of all pads.
 *
 * Updated without db access as new pads are created/old ones removed.
 */
let padList = {
  list: [],
  sorted : false,
  initiated: false,
  init: async function() {
    let dbData = await db.findKeys("pad:*", "*:*:*");
    if (dbData != null) {
      this.initiated = true
      for (let val of dbData) {
        this.addPad(val.replace(/pad:/,""), false);
      }
    }
    return this;
  },
  load: async function() {
    if (!this.initiated) {
      return this.init();
    }
    return this;
  },
  /**
   * Returns all pads in alphabetical order as array.
   */
  getPads: async function() {
    await this.load();
    if (!this.sorted) {
      this.list.sort();
      this.sorted = true;
    }
    return this.list;
  },
  addPad: function(name)
  {
    if (!this.initiated) return;
    if (this.list.indexOf(name) == -1){
      this.list.push(name);
      this.sorted = false;
    }
  },
  removePad: function(name)
  {
    if (!this.initiated) return;
    var index = this.list.indexOf(name);
    if (index > -1) {
      this.list.splice(index,1);
      this.sorted = false;
    }
  }
};

//initialises the allknowing data structure

/**
 * Returns a Pad Object with the callback
 * @param id A String with the id of the pad
 * @param {Function} callback 
 */
exports.getPad = thenify(function(id, text, callback)
{    
  //check if this is a valid padId
  if(!exports.isValidPadId(id))
  {
    callback(new customError(id + " is not a valid padId","apierror"));
    return;
  }
  
  //make text an optional parameter
  if(typeof text == "function")
  {
    callback = text;
    text = null;
  }
  
  //check if this is a valid text
  if(text != null)
  {
    //check if text is a string
    if(typeof text != "string")
    {
      callback(new customError("text is not a string","apierror"));
      return;
    }
    
    //check if text is less than 100k chars
    if(text.length > 100000)
    {
      callback(new customError("text must be less than 100k chars","apierror"));
      return;
    }
  }
  
  var pad = globalPads.get(id);
  
  //return pad if its already loaded
  if(pad != null)
  {
    callback(null, pad);
    return;
  }

  //try to load pad
  pad = new Pad(id);

  //initalize the pad
  pad.init(text, function(err)
  {
    if(ERR(err, callback)) return;
    globalPads.set(id, pad);
    padList.addPad(id);
    callback(null, pad);
  });
});

exports.listAllPads = async function()
{
  let padIDs = await padList.getPads();
  return { padIDs };
}

// checks if a pad exists
exports.doesPadExist = thenify(function(padId, callback)
{
  db.get("pad:"+padId, function(err, value)
  {
    if(ERR(err, callback)) return;
    if(value != null && value.atext){
      callback(null, true);
    }
    else
    {
      callback(null, false); 
    }
  });
});

// alias for backwards compatibility
exports.doesPadExists = exports.doesPadExist;

/**
 * An array of padId transformations. These represent changes in pad name policy over
 * time, and allow us to "play back" these changes so legacy padIds can be found.
 */
const padIdTransforms = [
  [/\s+/g, '_'],
  [/:+/g, '_']
];

// returns a sanitized padId, respecting legacy pad id formats
exports.sanitizePadId = async function sanitizePadId(padId)
{
  for (let i = 0, n = padIdTransforms.length; i < n; ++i) {

    let exists = await exports.doesPadExist(padId);
    if (exists) {
      return padId;
    }

    let [from, to] = padIdTransforms[i];
    padId = padId.replace(from, to);
  }

  //we're out of possible transformations, so just return it
  return padId;
}

exports.isValidPadId = function(padId)
{
  return /^(g.[a-zA-Z0-9]{16}\$)?[^$]{1,50}$/.test(padId);
}

/**
 * Removes the pad from database and unloads it.
 */
exports.removePad = function(padId){
  db.remove("pad:" + padId);
  exports.unloadPad(padId);
  padList.removePad(padId);
}

//removes a pad from the cache
exports.unloadPad = function(padId)
{
  globalPads.remove(padId);
}
