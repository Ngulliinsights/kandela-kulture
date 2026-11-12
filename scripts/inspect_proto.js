const fs = require('fs');
const proto = fs.readFileSync('prototypes/Kandela Kulture.html', 'utf8');

const idx = proto.indexOf('initMethod');
console.log('Proto initMethod:');
console.log(proto.substring(idx, idx + 1000));

const htmlIdx = proto.indexOf('id="th"');
console.log('Proto th HTML:');
console.log(proto.substring(htmlIdx - 150, htmlIdx + 400));
