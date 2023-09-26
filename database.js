var sqlite3 = require('sqlite3').verbose()

const DBSOURCE = "test.db"

let db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
      // Cannot open database
      console.error(err.message)
      throw err
    }
    else{
        db.run("CREATE TABLE IF NOT EXISTS ret_codes (codeId INTEGER PRIMARY KEY, code TEXT NOT NULL);");
    }
});


module.exports = db