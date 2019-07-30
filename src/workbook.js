const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const { workbook } = require('./templates');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/documents.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Docs API.
  authorize(JSON.parse(content), parsePage);
});

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
    const docTitle = res.data.title.split(':');
    const id = docTitle[0].trim();
    const title = docTitle[1].trim();

    const objectives = '';
    const { body, bib } = parseBody(res.data);

    console.log(workbook(id, title, objectives, body, ''));

  });
}

function toId(id) {
  return id.replace(/\./g, '-');
}

function parseBody(data) {

  const context = {
    lines: [],
    bib: [],
    inSection: false,
    inlines: data.inlineObjects,
    lists: data.lists,
    imagesToFetch: [],
    activeLists: [],
  };

  data.body.content.forEach(processContent.bind(this, context));
  if (context.inSection) {
    context.lines.push('</body></section>');
  }

  return { body: context.lines.reduce((p, c) => p + c + '\n', ''), bib: context.bib };
}

function processStructuredText(context, parentOpening, parentClosing, p) {
  let line = parentOpening;
  p.elements.forEach(e => {
    if (e.textRun !== undefined) {
      const { textStyle } = e.textRun;
      let content = e.textRun.content;

      if (content.endsWith('\n')) {
        content = content.substr(0, content.length - 1);
      }
      if (textStyle.link) {
        content = '<a href="' + textStyle.link.url + '">' + content + '</a>';
      }
      if (textStyle.bold) {
        content = '<em style="bold">' + content + '</em>';
      }
      if (textStyle.italic) {
        content = '<em style="italic">' + content + '</em>';
      }

      line += content;

    } else if (e.footnoteReference !== undefined) {
      line += '<cite entry="' + toId(e.footnoteReference.footnoteId) + '"/> ';
    }
  });
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
      const name = 'image-' + (Object.keys(context.imagesToFetch).length + 1) + '.png';

      context.imagesToFetch[toId(id)] = {
        href,
        name,
      };
      context.lines.push(`<image src="../webcontent/${name}" height="${height}" width="${width}"/>`);

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

  } else if (c.table !== undefined) {
    processTable(context, c.table);

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

