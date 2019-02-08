var ERR = require("async-stacktrace");
var securityManager = require('./db/SecurityManager');

//checks for padAccess
module.exports = async function (req, res) {
  try {
    let accessObj = await securityManager.checkAccess(req.params.pad, req.cookies.sessionID, req.cookies.token, req.cookies.password);

    //there is access, continue
    if (accessObj.accessStatus === "grant") {
      return true;
    } else {
      //no access
      res.status(403).send("403 - Can't touch this");
      return false;
    }
  } catch (err) {
    // @TODO - send internal server error here?
    throw err;
  }
}
