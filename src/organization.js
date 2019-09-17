const XLSX = require('xlsx');
const { organization } = require('./templates');

function toModel(sheet) {

  const items = [];
  try {
    let row = 1;
    while (true) {

      if (sheet['A' + row] === undefined) break;

      const key = sheet['A' + row].v;
      const id = sheet['B' + row].v;
      const title = sheet['C' + row] !== undefined
        ? sheet['C' + row].v : '';

      if (key === '') {
        break;
      } else {
        items.push({ key, id, title });
      }

      row++;
    }

  } catch (e) {
    console.log('error encountered in extracting values: ' + e);
    return null;
  }
  return items;
}

function processOrg(file, id, title) {

  const workbook = (typeof file) === 'string'
    ? XLSX.readFile(file)
    : XLSX.read(file, { type: 'buffer' });

  const sheet = workbook.Sheets[Object.keys(workbook.Sheets)[0]];
  const items = toModel(sheet);

  return organization(id, title, items);
}

module.exports = {
  processOrg,
};
