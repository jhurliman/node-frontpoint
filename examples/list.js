'use strict';
const frontpoint = require('..');
async function main() {
  const auth = await frontpoint.login(process.env.FRONTPOINT_USERNAME, process.env.FRONTPOINT_PASSWORD);
  if (!auth.systems.length) throw new Error('No systems were returned for this account');
  const state = await frontpoint.getCurrentState(auth.systems[0], auth);
  for (const partition of state.partitions) {
    console.log('Partition:', partition.id, partition.attributes.description, partition.attributes.state);
  }
  for (const sensor of state.sensors) {
    console.log('Sensor:', sensor.id, sensor.attributes.description, sensor.attributes.stateText);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
