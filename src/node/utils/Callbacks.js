/*
 *  Module to re-expose the callback API to the Etherpad internals
 */

function addCallback(f) {

  // check that the function hasn't already been wrapped
  if (f._hasCallback) {
    return f;
  }

  // naïve regex to get parameter names
  let params = f.toString().match(/\((.*?)\)/m)[1].replace(/\s/g, '');
  const param_array = params ? params.split(',') : [];

  // check we parsed correctly
  if (param_array.length !== f.length) {
    return f;
  }

  // add the callback param
  param_array.push('cb');
  params = param_array.join(', ');

  const body = `new_fn =
    function ${f.name}(${params}) {
      const args = [].slice.call(arguments, 0, f.length);
      if (typeof cb === 'function') {
        f.apply(this, args).then(function(result) {
          cb(null, result);
        }).catch(function(err) {
          cb(err, null);
        });
      } else {
        return f.apply(this, args);
      }
    };
  `;

  eval(body);
  Object.defineProperties(new_fn, {
    _hasCallback: { value: true },
    _originalFn: { value: f }
  });

  return new_fn;
}

exports.addCallbacks = function(module, functions) {
  for (let f of functions) {
    if (!module[f]) {
      console.error(`attempt to add callback handler to unknown function ${f}`);
      process.exit(1);
    }
    module[f] = addCallback(module[f]);
  }
}
