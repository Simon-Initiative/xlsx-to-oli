var guid = require('./guid').guid;

function summative(id, title, questions) {
  const content = questions
    .map(q => summativeQuestion(q))
    .reduce((p, c) => p + c, '');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE assessment PUBLIC "-//Carnegie Mellon University//DTD Assessment MathML 2.4//EN" "http://oli.web.cmu.edu/dtd/oli_assessment_mathml_2_4.dtd">
  <assessment xmlns:cmd="http://oli.web.cmu.edu/content/metadata/2.1/" id="${id}" recommended_attempts="3" max_attempts="3">
    <title>${title}</title>${content}</assessment>`
}

function pool(id, title, questions) {
  const content = questions
    .map(q => summativeQuestion(q))
    .reduce((p, c) => p + c, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE pool PUBLIC "-//Carnegie Mellon University//DTD Assessment Pool 2.4//EN" "http://oli.web.cmu.edu/dtd/oli_assessment_mathml_2_4.dtd">
  <pool xmlns:cmd="http://oli.web.cmu.edu/content/metadata/2.1/" id="${id}">
    <title>${title}</title>${content}</pool>`
}

function formative(id, title, questions) {
  const content = questions
    .map(q => formativeQuestion(q))
    .reduce((p, c) => p + c, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE assessment PUBLIC "-//Carnegie Mellon University//DTD Inline Assessment MathML 1.4//EN" "http://oli.cmu.edu/dtd/oli_inline_assessment_mathml_1_4.dtd">
  <assessment xmlns:cmd="http://oli.web.cmu.edu/content/metadata/2.1/" id="${id}">
    <title>${title}</title>${content}</assessment>`
}


function hint(h) {
  return `<hint>${h}</hint>`;
}

function skillref(s) {
  return `<skillref idref="${s}" />`
}

function summativeQuestion(mc) {

  const inputId = guid();
  const partId = guid();

  const choice = (c) => {
    return `<choice value="${c.value}">${c.content}</choice>\n`;
  }

  const choices = mc.choices
    .map(r => choice(r))
    .reduce((p, c) => p + c, '');

  const hints = mc.hints
    .map(r => hint(r))
    .reduce((p, c) => p + c, '');

  const skills = mc.skills
    .map(r => skillref(r))
    .reduce((p, c) => p + c, '');

  const response = (r) => {
    return `<response match="${r.match}" score="${r.score}">
              <feedback>
                  ${r.feedback}
              </feedback>
          </response>`;
  }

  const responses = mc.responses
    .map(r => response(r))
    .reduce((p, c) => p + c, '');

  return `<multiple_choice id="${mc.id}" grading="automatic" select="single">
      <body>
        ${mc.body}
      </body>
      <input shuffle="true" id="${inputId}" labels="false">
        ${choices}
      </input>
      <part id="${partId}">
        ${skills}
        ${responses}
        ${hints}
      </part>
  </multiple_choice>\n`;
}

function formativeQuestion(mc) {

  const inputId = guid();
  const partId = guid();

  const choice = (c) => {
    return `<choice value="${c.value}">${c.content}</choice>\n`;
  }

  const choices = mc.choices
    .map(r => choice(r))
    .reduce((p, c) => p + c, '');

  const hints = mc.hints
    .map(r => hint(r))
    .reduce((p, c) => p + c, '');

  const skills = mc.skills
    .map(r => skillref(r))
    .reduce((p, c) => p + c, '');

  const response = (r) => {
    return `<response match="${r.match}" score="${r.score}">
              <feedback>
                  ${r.feedback}
              </feedback>
          </response>`;
  }

  const responses = mc.responses
    .map(r => response(r))
    .reduce((p, c) => p + c, '');

  return `<question id="${mc.id}">
      <body>
        ${mc.body}
      </body>
      <multiple_choice shuffle="true" id="${inputId}" select="single">
        ${choices}
      </multiple_choice>
      <part id="${partId}">
        ${skills}
        ${responses}
        ${hints}
      </part>
  </question>`;
}

module.exports = {
  pool,
  summative,
  formative
}
