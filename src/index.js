const commandLineArgs = require('command-line-args')
const fs = require('fs');

const { toOLI } = require('./convert');

const optionDefinitions = [
  { name: 'inputFile', type: String },
  { name: 'outputFile', type: String },
  { name: 'type', type: String },
  { name: 'id', type: String }
];

const options = commandLineArgs(optionDefinitions);


function outputFile(content) {

  fs.writeFile(options.outputFile, content, function (err) {
    if (err) {
      return console.log(err);
    }
    console.log("Saved to " + options.outputFile);
  });
}

function displayUsage() {
  const s = `xlsx-to-oli\n
Creates oli assessments / pools from an XLSX document\n
Command line arguments (all required):
--------------------------------------
--inputFile   path to input XLSX file
--outputFile  path to output OLI assessment XML file
--type        assessment type: either 'pool', 'summative', or 'formative'
--id          the id to assign to the created assessment

Example:

node src/index.js --inputFile sample.xlsx --outputFile test.xml --type pool --id my_pool
  `;
  console.log(s);
}

function main() {

  const argsPresent = options.inputFile !== undefined
    && options.outputFile !== undefined
    && options.type !== undefined
    && options.id !== undefined;

  if (!argsPresent) {
    displayUsage();
    return;
  }

  const content = toOLI(options.inputFile);
  outputFile(content);

}

main();
