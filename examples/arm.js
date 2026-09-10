'use strict';
const frontpoint = require('..');
async function main() {
  const method = { stay: 'armStay', away: 'armAway', disarm: 'disarm' }[process.argv[2]];
  const partition = process.env.FRONTPOINT_PARTITION_ID;
  if (!method || !partition) throw new Error('Use: FRONTPOINT_PARTITION_ID=<id> node examples/arm.js stay|away|disarm');
  const auth = await frontpoint.login(process.env.FRONTPOINT_USERNAME, process.env.FRONTPOINT_PASSWORD);
  await frontpoint[method](partition, auth);
  console.log('Command request completed; query current state to confirm the panel state.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
