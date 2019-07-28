const XLSX = require('xlsx');
const guid = require('./guid').guid;
const { formative, summative, pool } = require('./templates');

function sheetToQuestion(sheet) {

  const q = { choices: [], skills: [], responses: [], hints: [], body: '', type: 'mc' };
  try {
    let row = 1;
    while (true) {

      if (sheet['A' + row] === undefined) break;

      const k = sheet['A' + row].v;
      const v = sheet['B' + row].v;

      if (k === '') {
        break;
      } else if (k === 'Question ID') {
        q.id = v;
      } else if (k === 'Question Text') {
        q.body = v;
      } else if (k === 'Question Hint') {
        q.hints.push(v);
      } else if (k === 'Skill ID') {
        q.skills.push(v);
      } else if (k.startsWith('Choice')) {
        const feedback = sheet['D' + row].v;
        const choice = { content: v, value: guid() };

        if (feedback === 'Correct') {
          const score = '1';
          const response = { match: choice.value, score, feedback };
          q.responses.push(response);
        }
        q.choices.push(choice);

      }

      row++;
    }

    q.responses.push({ match: '*', score: '0', feedback: 'Incorrect' });

  } catch (e) {
    console.log('error encountered in extracting values: ' + e);
    return null;
  }
  return q;
}

function extractQuestions(file) {

  const workbook = (typeof file) === 'string'
    ? XLSX.readFile(file)
    : XLSX.read(file, { type: 'buffer' });

  const questions = [];

  Object.keys(workbook.Sheets).map(key => {

    const s = workbook.Sheets[key];
    const q = sheetToQuestion(s);

    if (q !== null && q.id !== undefined) {
      questions.push(q);
    } else {
      console.log('error in sheet ' + key);
    }
  });

  return questions;
}



function toOLI(inputFile, id, type, title) {
  const questions = extractQuestions(inputFile);
  let content;
  if (type === 'pool') {
    content = pool(id, title, questions);
  } else if (type === 'summative') {
    content = summative(id, title, questions);
  } else {
    content = formative(id, title, questions);
  }
  return content;
}

module.exports = {
  toOLI,
};
