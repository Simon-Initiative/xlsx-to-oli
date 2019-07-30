var guid = require('./guid').guid;

function workbook(id, title, objectives, body, bib) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE workbook_page PUBLIC "-//Carnegie Mellon University//DTD Workbook Page MathML 3.8//EN" "http://oli.web.cmu.edu/dtd/oli_workbook_page_mathml_3_8.dtd">
  <workbook_page xmlns:bib="http://bibtexml.sf.net/" 
    xmlns:cmd="http://oli.web.cmu.edu/content/metadata/2.1/" 
    xmlns:m="http://www.w3.org/1998/Math/MathML" 
    xmlns:pref="http://oli.web.cmu.edu/preferences/" 
    xmlns:theme="http://oli.web.cmu.edu/presentation/" 
    xmlns:wb="http://oli.web.cmu.edu/activity/workbook/" id="${id}">
    <head>
      <title>${title}</title>
      ${objectives}
    </head>
    <body>
      ${body}
    </body>
    ${bib}
  </workbook_page>`
}

function summative(id, title, components) {
  const content = components
    .map(q => {
      if (q.type === 'pool') {
        return selection(q);
      }
      return summativeQuestion(q);
    })
    .reduce((p, c) => p + c, '');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE assessment PUBLIC "-//Carnegie Mellon University//DTD Assessment MathML 2.4//EN" "http://oli.web.cmu.edu/dtd/oli_assessment_mathml_2_4.dtd">
  <assessment xmlns:cmd="http://oli.web.cmu.edu/content/metadata/2.1/" id="${id}" recommended_attempts="3" max_attempts="3">
    <title>${title}</title>${content}</assessment>`
}

function pool(id, title, components) {
  const content = components
    .map(q => summativeQuestion(q))
    .reduce((p, c) => p + c, '');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE pool PUBLIC "-//Carnegie Mellon University//DTD Assessment Pool 2.4//EN" "http://oli.web.cmu.edu/dtd/oli_assessment_mathml_2_4.dtd">
  <pool xmlns:cmd="http://oli.web.cmu.edu/content/metadata/2.1/" id="${id}">
    <title>${title}</title>${content}</pool>`
}

function formative(id, title, components) {
  const content = components
    .map(q => {
      if (q.type === 'pool') {
        return selection(q);
      }
      return formativeQuestion(q);
    })
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

function selection(s) {
  return `<selection count="${s.count}" strategy="${s.strategy}" exhaustion="${s.exhaustion}" scope="${s.scope}">
    <pool_ref idref="${s.id}"/>
  </selection>
  `;
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
  formative,
  workbook
}
