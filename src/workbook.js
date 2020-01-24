const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const { encodeXml, checkImageTag } = require('./utils');
const { workbook } = require('./templates');
var guid = require('./guid').guid;
const fetchIt = require('node-fetch');
var JSZip = require("jszip");


// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/documents.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
//fs.readFile('credentials.json', (err, content) => {
//  if (err) return console.log('Error loading client secret file:', err);
// Authorize a client with credentials, then call the Google Docs API.
//  authorize(JSON.parse(content), parsePage);
//});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}


/**
 * Prints the title of a sample doc:
 * https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth 2.0 client.
 */
function parsePage(auth) {
  const docs = google.docs({ version: 'v1', auth });
  docs.documents.get({
    documentId: '1URR7Ii4LFQwhHllqYtV3sHaU7tQMeIUzG0iU6qm27Z0',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);

    console.log(processPage(res.data).xml);


  });
}

function base64_encode(file) {
  // read binary data
  var bitmap = fs.readFileSync(file);
  // convert binary data to base64 encoded string
  return new Buffer(bitmap).toString('base64');
}

function processPage(data) {

  const parts = data.title.split(':');
  const id = data.title.indexOf(':') !== -1 ? parts[0] : guid();
  const title = data.title.indexOf(':') !== -1 ? parts[1] : data.title;

  const context = parseBody(id, data);
  console.log(context.objrefs);
  const objectives = context.objrefs.length === 0
    ? ''
    : context.objrefs.map(o => `<objref>${o}</objref>`).reduce((p, c) => p + c + '\n', '');

  const body = context.lines.reduce((p, c) => p + c + '\n', '')
  const xml = workbook(id, title, objectives, body, '');

  return new Promise(function (resolve, reject) {

    downloadImages(context.imagesToFetch)
      .then(images => zip({ name: id + '.xml', content: xml }, images, id + '.zip', context))
      .then(file => resolve({ zip: base64_encode(file), errors: context.errors }))
      .catch(e => reject(e));
  });


}

function zip(xml, images, output, context) {
  return new Promise(function (resolve, reject) {

    try {
      var zip = new JSZip();

      zip.folder('x-oli-workbook_page').file(xml.name, xml.content);

      images.forEach(image => {
        zip.folder('webcontent').file(image.name, image.content);
      });

      zip
        .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
        .pipe(fs.createWriteStream(output))
        .on('finish', function () {
          resolve(output);
        });
    } catch (e) {
      context.errors.push(e);
      reject(e);
    }

  });

}

function retrieveImage(image) {

  return fetchIt(image.href)
    .then(response => response.arrayBuffer())
    .then((blob) => {
      return { name: image.name, content: blob };
    })
    .catch((err) => {
      console.log(err);
      resolve(false);
    });


}

function downloadImages(images) {

  if (images.length === 0) Promise.resolve([]);

  const fetches = images.map(image => retrieveImage(image));
  return Promise.all(fetches);

}

function toId(id) {
  return id.replace(/\./g, '-');
}

function extractCustomElementName(t) {

  const text = (cell) => {
    if (cell.content.length === 1 && cell.content[0].paragraph) {
      const p = cell.content[0].paragraph;
      if (p.elements.length > 0) {
        if (p.elements[0].textRun) {
          return p.elements[0].textRun.content.trim();
        }
      }
    }
    return null;
  }

  const row = t.tableRows[0];
  if (row.tableCells.length > 1) {
    const first = text(row.tableCells[0]);

    if (first.trim() === 'CustomElement') {
      return text(row.tableCells[1]);
    }
  }
  return null;
}

function getKeyValues(table, keys) {

  const k = keys.reduce((p, c) => {
    if (c.endsWith(':s')) {
      p[c.substr(0, c.length - 2)] = getStructuredText
    } else {
      p[c] = getBasicText;
    }
    return p;
  }, {});

  const o = {};

  table.tableRows.forEach((r, ri) => {
    const key = getTableText(table, getBasicText, ri, 0);
    const processor = k[key];
    if (processor !== undefined) {
      const value = getTableText(table, processor, ri, 1);
      o[key] = value;
    }
  });

  return o;
}


function getTableText(table, processor, row, col) {
  if (table.tableRows.length > row) {
    const r = table.tableRows[row];
    if (r.tableCells.length > col) {
      const c = r.tableCells[col];
      return processor(c);

    }
  }
  return null;
}

function extractParagraph(p) {
  let line = '';
  p.elements.forEach(e => {
    if (e.textRun !== undefined) {
      const { textStyle } = e.textRun;
      let content = e.textRun.content;

      if (content.endsWith('\n')) {
        content = content.substr(0, content.length - 1);
      }

      if (textStyle.link) {
        content = '<a href="' + textStyle.link.url + '">' + content + '</a>';
      } else {

        content = encodeXml(content);

        if (textStyle.bold) {
          content = '<em style="bold">' + content + '</em>';
        }
        if (textStyle.italic) {
          content = '<em style="italic">' + content + '</em>';
        }
      }
      
      line += content;

    } else if (e.footnoteReference !== undefined) {
      line += '<cite entry="' + toId(e.footnoteReference.footnoteId) + '"/> ';
    }
  });
  return line;
}

function toArrayBuffer(buf) {
  var ab = new ArrayBuffer(buf.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }
  return ab;
}


function getBasicText(cell) {
  if (cell.content.length === 1 && cell.content[0].paragraph) {
    const p = cell.content[0].paragraph;
    if (p.elements.length > 0) {
      if (p.elements[0].textRun) {
        return encodeXml(p.elements[0].textRun.content.trim());
      }
    }
  }
  return '';
}

function getStructuredText(cell) {
  if (cell.content.length === 1 && cell.content[0].paragraph) {
    const p = cell.content[0].paragraph;
    if (p.elements.length > 0) {
      return extractParagraph(p);
    }
  }
  return '';
}



function parseBody(id, data) {

  const context = {
    id,
    lines: [],
    objrefs: [],
    bib: [],
    inSection: false,
    inlines: data.inlineObjects,
    lists: data.lists,
    imagesToFetch: [],
    activeLists: [],
    errors: [],
  };

  try {
    data.body.content.forEach(processContent.bind(this, context));
    if (context.inSection) {
      context.lines.push('</body></section>');
    }
  } catch (e) {
    context.errors.push(e)
  }

  return context;
}

function processStructuredText(context, parentOpening, parentClosing, p) {
  const line = parentOpening + extractParagraph(p);
  context.lines.push(line + parentClosing);
}

function processParagraph(context, p) {
  processStructuredText(context, '<p>', '</p>', p);
}

function processSection(context, p) {
  if (context.inSection) {
    context.lines.push('</body></section>');
  }
  context.inSection = true;
  context.lines.push('<section>');
  processStructuredText(context, '<title>', '</title>', p);
  context.lines.push('<body>');
}

function processTable(context, t) {
  context.lines.push('<table>');
  t.tableRows.forEach(r => {
    context.lines.push('<tr>');
    r.tableCells.forEach(c => {

      const colspan = 'colspan="' + c.tableCellStyle.columnSpan + '" ';
      const rowspan = 'rowspan="' + c.tableCellStyle.rowSpan + '"';

      const opening = `<td ${colspan}${rowspan}>`;

      processNested(context, opening, '</td>', c.content);

    });
    context.lines.push('</tr>');
  });
  context.lines.push('</table>');
}


function isImage(c) {
  return c.paragraph !== undefined
    && c.paragraph.paragraphStyle.namedStyleType === 'NORMAL_TEXT'
    && c.paragraph.elements[0].inlineObjectElement;
}

function processFormative(context, t) {

  const params = getKeyValues(t, ['idref', 'purpose']);
  const purpose = params.purpose
    ? `purpose="${params.purpose}"`
    : '';
  context.lines.push(`<wb:inline idref="${params.idref}" ${purpose}/>`);

}

function processSummative(context, c) {
  const params = getKeyValues(c, ['idref', 'purpose']);
  const purpose = params.purpose
    ? `purpose="${params.purpose}"`
    : '';
  context.lines.push(`<activity idref="${params.idref}" ${purpose}/>`);
}


function processObjectives(context, c) {
  const params = getKeyValues(c, ['ids']);
  context.objrefs = params.ids.split(',').map(o => o.trim());
}

function attr(name, value) {
  return value === undefined
    ? ''
    : ' ' + name + `="${value}"`;
}

function processYoutube(context, c) {

  const params = getKeyValues(c, ['id', 'src', 'caption:s', 'height', 'width']);
  const caption = params.caption
    ? `<caption>${params.caption}</caption>`
    : '';
  const id = attr('id', params.id);
  const height = attr('height', params.height);
  const width = attr('width', params.width);

  const youtube = `<youtube${id}${height}${width} src="${params.src}">
    ${caption}
  </youtube>
  `;
  context.lines.push(youtube);
}

function processImage(context, c) {
  const id = c.paragraph.elements[0].inlineObjectElement.inlineObjectId;

  if (id && context.inlines[id] !== undefined) {

    const inline = context.inlines[id];

    if (inline.inlineObjectProperties
      && inline.inlineObjectProperties.embeddedObject
      && inline.inlineObjectProperties.embeddedObject.imageProperties) {

      const obj = inline.inlineObjectProperties.embeddedObject;

      const href = obj.imageProperties.contentUri;
      const height = Math.round(+obj.size.height.magnitude);
      const width = Math.round(+obj.size.width.magnitude);
      const name = 'image-' + context.id + '-' + (context.imagesToFetch.length + 1) + '.png';
      const path = `../webcontent/${name}`;

      context.imagesToFetch.push({
        href,
        name,
        path,
      });
      context.lines.push(`<image src="${path}" height="${height}" width="${width}"/>`);

    }
  }
}

function processListItem(context, c) {
  const listId = c.paragraph.bullet.listId;
  const level = c.paragraph.bullet.nestingLevel === undefined
    ? 0
    : c.paragraph.bullet.nestingLevel;
  const isOrdered = context.lists[listId].listProperties.nestingLevels[level].glyphSymbol === undefined;
  const currentLevel = context.activeLists.length - 1;

  // Handle these cases:
  // 1. First list item
  // 2. New nested list
  // 3. List item back up one level from nested
  // 4. List item as a sibling (do nothing, just add the <li>)

  if (currentLevel === -1) {
    context.lines.push(isOrdered ? '<ol>' : '<ul>');
    context.activeLists.push({
      listId,
      isOrdered,
    });
  } else if (currentLevel < level) {
    context.lines.push(isOrdered ? '<ol>' : '<ul>');
    context.activeLists.push({
      listId,
      isOrdered,
    });
  } else if (currentLevel > level) {
    const previous = context.activeLists.pop();
    context.lines.push(previous.isOrdered ? '</ol>' : '</ul>');
  }
  processStructuredText(context, '<li>', '</li>', c.paragraph);

}

function isListItem(c) {
  return c.paragraph !== undefined
    && c.paragraph.paragraphStyle.namedStyleType === 'NORMAL_TEXT'
    && c.paragraph.bullet !== undefined;
}

function processContent(context, c) {

  if (!isListItem(c) && context.activeLists.length > 0) {

    while (context.activeLists.length > 0) {
      const list = context.activeLists.pop();
      context.lines.push(list.isOrdered ? '</ol>' : '</ul>');
    }
  }


  if (c.sectionBreak !== undefined) {

  } else if (c.paragraph !== undefined && c.paragraph.paragraphStyle.namedStyleType.startsWith('HEADING')) {
    processSection(context, c.paragraph);

  } else if (isImage(c) && isListItem(c)) {
    context.lines.push('<li>');
    processImage(context, c);
    context.lines.push('</li>');

  } else if (isImage(c)) {
    processImage(context, c);

  } else if (isListItem(c)) {
    processListItem(context, c);

  } else if (c.paragraph !== undefined && c.paragraph.paragraphStyle.namedStyleType === 'NORMAL_TEXT') {
    processParagraph(context, c.paragraph);

  } else if (c.paragraph !== undefined && c.paragraph.paragraphStyle.namedStyleType === 'SUBTITLE') {
    let currentIdx = context.lines.length;
    let s = context.lines[currentIdx-1];
    processParagraph(context, c.paragraph);
    if (checkImageTag(s)) {
      // modify the last line, which is an image tag to add alt text
      // assume alt text only span 1 line
      context.lines[currentIdx-1] = s.substring(0, s.indexOf('>')) + "alt=\"" + context.lines[currentIdx] + "\">";
    }

  } else if (c.table !== undefined) {

    const customElement = extractCustomElementName(c.table);
    if (customElement === null) {
      processTable(context, c.table);
    } else if (customElement === 'formative') {
      processFormative(context, c.table);
    } else if (customElement === 'youtube') {
      processYoutube(context, c.table);
    } else if (customElement === 'summative') {
      processSummative(context, c.table);
    } else if (customElement === 'objectives') {
      processObjectives(context, c.table);
    }


  } else {
    console.log(c);
  }
}


function processNested(context, parentOpening, parentClosing, nested) {

  if (nested.length === 1) {
    const item = nested[0];
    if (item.paragraph) {
      if (isImage(item)) {
        context.lines.push(parentOpening);
        processImage(context, item);
        context.lines.push(parentClosing);
      } else {
        processStructuredText(context, parentOpening, parentClosing, nested[0].paragraph);
      }
    }

  } else {
    context.lines.push(parentOpening);
    nested.forEach(c => processContent(context, c));
    context.lines.push(parentClosing);
  }

}

module.exports = {
  processPage
};
