
function encodeXml (s) {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
};

function checkImageTag (s) {
  if (typeof s === 'string' || s instanceof String) {
    s = s.trim();
    s = s.substring(0, s.indexOf(' '));
    if (s === '<image') {
      return true;
    }
  }
  return false;
};

module.exports = {
  encodeXml,
  checkImageTag,
}
