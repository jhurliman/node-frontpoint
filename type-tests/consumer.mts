import { createClient, FrontpointError, SYSTEM_STATES } from '../index.js';
const client = createClient({ timeout: 60000, fetch });
async function check() {
  const auth = await client.login('user', 'password');
  const state = await client.getCurrentState(auth.systems[0], auth);
  const id: string = state.partitions[0].id;
  await client.armStay(id, auth);
  const code: number = SYSTEM_STATES.ARMED_AWAY;
  const error: FrontpointError = new FrontpointError('failure');
}
