import * as all from 'yahoo-finance2';
console.log('Keys:', Object.keys(all));
try {
  const def = all.default;
  console.log('Default:', def);
  console.log('Default type:', typeof def);
  if (typeof def === 'function') console.log('Default is valid constructor');
} catch(e) { console.log(e); }
