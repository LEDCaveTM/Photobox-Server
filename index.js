const express = require("express");
const multer = require("multer");
const PORT = process.env.PORT || 3000;
const fs = require('fs');
const qrCode = require('qrcode');

const DEBUGGINGENABLED = false;
const downloadName = "Photobox_RET"
const serverURL = "https://video.ret.de/"


// DATABASE INITIALIZATION
const db = require('better-sqlite3')('videos.db');
db.prepare("CREATE TABLE IF NOT EXISTS ret_codes (codeId INTEGER PRIMARY KEY, code TEXT NOT NULL)").run();

const insertCode = db.prepare("INSERT INTO ret_codes (code) VALUES (?)");
const getNumCodes = db.prepare("SELECT COUNT(*) as 'count' FROM ret_codes");
const getLastCode = db.prepare("SELECT * FROM ret_codes ORDER BY codeId DESC LIMIT 1");
const deleteCodes = db.prepare("delete from ret_codes");

// SERVER INITIALIZATION
const app = express ();

app.use(express.json());

const server = app.listen(PORT, () => {
  console.log("Server Listening on PORT:", PORT);
});



// GETTING THE NEXT CODE
app.get(["/nextCode/*"], (request, response) =>{
  numCodes = getNumCodes.get();

  // Generate next code
  if ( !("count" in numCodes) || request.params[0] == numCodes.count + 1){
    // Check if previous video has been uploaded
    lastCode = getLastCode.get()
    if (lastCode){
      filePath = "./uploads/" + lastCode.code + ".mp4"
      if ( !fs.existsSync(filePath) ){
        console.log("Attempting to retreive new code without first uploading a video")
        response.status(404).send("Upload a video to the previous code first");
        return;
      }
    }


    // Generate new code by turning milliseconds since epoch into Radix36
    insertCode.run(Math.round(Date.now()).toString(36));

    lastCode = getLastCode.get();
    // Return result
    response.status(200)
    response.setHeader('content-type','image/png');
    response.setHeader('content-disposition','attachment; filename="'  + lastCode.code + '.png"');
    qrCode.toFileStream(response, serverURL + "video/" + lastCode.code);
    console.log("Returned new code " + lastCode.code)
  }

  // Get current code
  else if (request.params[0] == numCodes.count){
    if (numCodes.count == 0){
      response.status(403).send("No permission to access this page");

      console.log("Incorrectly requested row 0 while there are no entries in the table");
      return;
    }
    lastCode = getLastCode.get();
    response.status(200)
    response.setHeader('content-type','image/png');
    response.setHeader('content-disposition','attachment; filename="'  + lastCode.code + '.png"');
    qrCode.toFileStream(response, serverURL + "video/" + lastCode.code);

    console.log("Returned current code for ID " + numCodes.count + " with new Code " + lastCode.code);
  }
  else {
    console.log("Illegal code requested!");
    console.log("Current row: "+  numCodes.count);
    console.log("Received: "+ request.params[0]);
    response.status(403).send("No permission to access this page");
  }
  console.log();
});



// UPLOAD 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("Requesting upload");
    const path = `./uploads/tmp/`;
    fs.mkdirSync(path, { recursive: true });
    cb(null, path);
  },
  filename: (req, file, cb) => {
    const fileExtension = file["originalname"].split('.').pop();
    const newFileName = req.path.substring(1).replaceAll('\\', "-").replaceAll('/', "-") + "." + fileExtension
    cb(null, newFileName);
  },
});
const upload = multer({ storage });

app.post(["/upload/*/*"], upload.single('file'), (request, response) =>{
  console.log("Processing upload");
  const id = request.params[0];
  const code = request.params[1];
  const lastCode = getLastCode.get();
  const numCodes = getNumCodes.get();

  if (!("count" in numCodes)){
    console.log("Attempted upload without existing upload code. That's SUPER ILLEGAL! Do gooder!");
    response.status(403).send("No permission to access this page");
    return;
  }

  if (id == numCodes.count && code == lastCode.code){
    console.log("Legal file upload. Saving to uploads");
    
    const fileExtension = "." + request.file["originalname"].split('.').pop();
    const oldFilePath = "./uploads/tmp/" + request.path.substring(1).replaceAll('\\', "-").replaceAll('/', "-") + fileExtension;
    const newFilePath = "./uploads/" + code + fileExtension;


    fs.rename(oldFilePath, newFilePath, function (err) {
      if (err){
        console.log("Error while moving file:")
        console.log(err);
        console.log();
      }
    });

    response.status(200);
    response.send("You successfully uploaded a file for ID " + id + " with Code " + code);  
  }
  else {
    console.log("Illegal file upload. Deleting file");
    response.status(403).send("No permission to access this page");

    const fileExtension = "." + request.file["originalname"].split('.').pop();
    const filePath = "./uploads/tmp/" + request.path.substring(1).replaceAll('\\', "-").replaceAll('/', "-") + fileExtension;
    fs.unlinkSync(filePath);
  }
  console.log();
});



// DOWNLOAD
app.get(["/video/*"], (request, response) =>{
  var filePath = "./uploads/" + request.params[0] + ".mp4";

  if ( !fs.existsSync(filePath) ){
    response.status(404).send("Video konnte nicht gefunden werden.\nVideo could not be found.");
    return;
  }

  response.download(filePath , downloadName + "_" + request.params[0] + ".mp4");
});

app.get(["/qrcode/*"], (request, response) =>{
  response.setHeader('content-type','image/png');
  response.setHeader('content-disposition','attachment; filename="'  + request.params[0] + '.png"');
  qrCode.toFileStream(response, serverURL + "video/" + request.params[0]);
});

// DEBUG INTERFACES
if (DEBUGGINGENABLED){
  app.get(["/deleteCodes"], (request, response) =>{
    console.log("Requested to delete all codes from table");
    deleteCodes.run();

    try {
      fs.rmSync("./uploads/", { recursive: true, force: true });
    } catch (error) {
      console.log("Error while deleting download folder");
      console.log(error);
    }
      

    response.status(200)
    response.send("<p>Poof! Gone!</p><br><a href='/'>Back to index</a>");
    console.log();
  });
}

app.get("/", (request, response) =>{
  response.redirect(301, 'https://www.guestastic.com/')
});

app.post('*', function(req, res){
  res.status(403).send("No permission to access this page");
});

app.get('*', function(req, res){
  res.status(403).send("No permission to access this page");
});


// GRACEFUL SHUTDOWN
process.on('exit', () => {
  console.log("Exit request received");
  db.close()
  console.log("Database colsed & saved");
});
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));
