// Isolated real-Electron entry point. Production paths and IPC remain unchanged.
const {app}=require('electron');const path=require('node:path');
if(!process.env.BOKMAL_TEST_USER_DATA)throw Error('Temporary test userData path is required');
app.setPath('userData',process.env.BOKMAL_TEST_USER_DATA);
require(path.join(__dirname,'../../dist-electron/main/index.js'));

