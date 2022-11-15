const express = require("express");
const multer  = require('multer');
const {mergePdfs} = require('./merge');

const upload = multer({ dest: 'uploads/' })
const app = express();

app.use('/static', express.static('public'));

app.get('/',(req,res)=>{
    res.sendFile(__dirname+"/temp/index.html");
})
let d;
app.post('/merge', upload.array('pdfs', 12), async (req, res, next)=> {
   d = await mergePdfs(__dirname+"/"+req.files[0].path,__dirname+"/"+req.files[1].path);
    res.redirect('/result');
})

app.get('/result',(req,res)=>{
    res.sendFile(__dirname+`/public/${d}.pdf`);
})

const PORT = process.env.PORT|| 5000;

app.listen(PORT, ()=>{
    console.log(`Server started on port ${PORT}`);
});