const express = require("express");
const multer  = require('multer');
const {mergePdfs} = require('./merge');

const upload = multer({ dest: 'uploads/' })
const app = express();

app.use('/static', express.static('public'));

app.get('/',(req,res)=>{
    res.sendFile(__dirname+"/temp/index.html");
})
app.post('/merge', upload.array('pdfs', 12), async (req, res, next)=> {
   let d = await mergePdfs(__dirname+"/"+req.files[0].path,__dirname+"/"+req.files[1].path);
    res.redirect(`http://localhost:2000/static/${d}.pdf`);
})

app.listen(2000, ()=>{
    console.log("Server started on port 2000");
})