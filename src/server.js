
const express = require('express');
const multer = require('multer');
const path = require('path');
const { toOLI } = require('./convert');
const { processPage } = require('./workbook');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

const port = 9001;
const host = '0.0.0.0';

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname + '/index.html'));
});

app.get('/workbook', function (req, res) {
  res.sendFile(path.join(__dirname + '/workbook.html'));
});


app.get('/xlsx', function (req, res) {
  res.sendFile(path.join(__dirname + '/xlsx.html'));
});


app.post('/workbook', express.json(), function (req, res, next) {

  const doc = req.body.doc;

  processPage(doc)
    .then(result => {

      res.setHeader('Content-type', 'text/plain');
      res.charset = 'UTF-8';
      res.send(result.zip);
    })


});

app.post('/upload', upload.single('file'), function (req, res, next) {

  const file = req.file
  if (!file) {
    const error = new Error('Please upload a file')
    error.httpStatusCode = 400
    return next(error)
  }

  const xlsx = file.buffer;

  const id = req.body.id;
  const title = req.body.title;
  const type = req.body.type;

  const content = toOLI(xlsx, id, type, title);

  res.setHeader('Content-disposition', 'attachment; filename=' + id + '.txt');
  res.setHeader('Content-type', 'text/plain');
  res.charset = 'UTF-8';
  res.send(content);

});

app.listen(port, host, () => console.log('xlsx-to-oli listening on port ' + port));

