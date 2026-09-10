'use strict';

const LOGIN = 'https://my.frontpointsecurity.com/login';
const FRONTPOINT = 'https://my.frontpointsecurity.com/api/';
const ALARM = 'https://www.alarm.com';
const UA = `node-frontpoint/${require('./package.json').version}`;
const SYSTEM_STATES = Object.freeze({ UNKNOWN: 0, DISARMED: 1, ARMED_STAY: 2, ARMED_AWAY: 3, ARMED_NIGHT: 4 });
const SENSOR_STATES = Object.freeze({ UNKNOWN: 0, CLOSED: 1, OPEN: 2, IDLE: 3, ACTIVE: 4, DRY: 5, WET: 6 });

class FrontpointError extends Error {
  constructor(message, status) { super(message); this.name = 'FrontpointError'; this.status = status; }
}

function createClient({ fetch: transport = globalThis.fetch, timeout = 60000 } = {}) {
  if (typeof transport !== 'function') throw new TypeError('fetch must be a function');
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 2147483647) throw new RangeError('timeout must be positive milliseconds no greater than 2147483647');

  async function request(method, url, options = {}) {
    const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])]);
    try {
      const response = await transport(url, {
        method, redirect: 'manual', signal,
        headers: { 'User-Agent': UA, ...options.headers },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      if (!response.ok && !(options.allowRedirect && response.status >= 300 && response.status < 400)) {
        if (response.body) await response.body.cancel().catch(() => {});
        throw new FrontpointError(`${method} ${new URL(url).origin} returned HTTP ${response.status}`, response.status);
      }
      const text = await response.text();
      let body = text;
      if (text && (response.headers.get('content-type') || '').includes('json')) {
        try { body = JSON.parse(text); }
        catch { throw new FrontpointError('Server returned invalid JSON', response.status); }
      }
      return { body, headers: response.headers };
    } catch (error) {
      if (error instanceof FrontpointError) throw error;
      // Do not include server bodies, cookies, authorization headers, SSO URLs,
      // or transport exception text in errors intended for application logs.
      throw new FrontpointError(signal.aborted ? 'Request aborted or timed out' : 'Network request failed');
    }
  }

  function headers(auth = {}) {
    if (typeof auth.cookie !== 'string' || typeof auth.ajaxKey !== 'string') throw new TypeError('A login authentication object is required');
    return { ...auth.headers, Accept: 'application/vnd.api+json',
      AjaxRequestUniqueKey: auth.ajaxKey, Cookie: auth.cookie,
      Referer: `${ALARM}/web/system/home`, 'Content-Type': 'application/json; charset=UTF-8' };
  }
  async function authenticated(method, path, auth, body) {
    return (await request(method, ALARM + path, { headers: headers(auth), body, signal: auth.signal })).body;
  }
  function id(value) {
    if (typeof value !== 'string' || !value) throw new TypeError('Resource IDs must be non-empty strings');
    return encodeURIComponent(value);
  }

  async function login(username, password, options = {}) {
    if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
      throw new TypeError('Username and password must be non-empty strings');
    }
    const tokenResponse = await request('POST', FRONTPOINT + 'Login/token', {
      signal: options.signal,
      headers: { 'Content-Type': 'application/json;charset=UTF-8', Referer: LOGIN },
      body: { Username: username, Password: password, RememberMe: false },
    });
    const token = tokenResponse.headers.get('x-fpsso');
    if (!token) throw new FrontpointError('Login response did not contain X-FPSSO');
    const sso = await request('POST', FRONTPOINT + 'Account/AdcRedirectUrl', {
      signal: options.signal,
      headers: { 'Content-Type': 'application/json;charset=UTF-8', Cookie: `FPTOKEN=${token}`, Authorization: `Bearer ${token}`, Referer: LOGIN },
      body: { Href: LOGIN },
    });
    let redirect;
    try { redirect = new URL(sso.body); } catch { throw new FrontpointError('Login response did not contain a valid SSO URL'); }
    if (redirect.protocol !== 'https:' || !(redirect.hostname === 'alarm.com' || redirect.hostname.endsWith('.alarm.com')) || redirect.username || redirect.password) {
      throw new FrontpointError('Login SSO URL must use HTTPS on alarm.com');
    }
    const session = await request('GET', redirect.href, { allowRedirect: true, signal: options.signal });
    const cookies = new Map(session.headers.getSetCookie().map(cookie => {
      const pair = cookie.split(';', 1)[0]; const separator = pair.indexOf('=');
      return [pair.slice(0, separator).trim(), pair.slice(separator + 1)];
    }));
    const ajaxKey = cookies.get('afg');
    if (!ajaxKey) throw new FrontpointError('Alarm.com response did not contain an afg cookie');
    const auth = { cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ajaxKey };
    const identities = await authenticated('GET', '/web/api/identities', { ...auth, signal: options.signal });
    if (!Array.isArray(identities?.data)) throw new FrontpointError('Identity response did not contain a data array');
    const systems = [...new Set(identities.data.map(item => item?.relationships?.selectedSystem?.data?.id)
      .filter(value => typeof value === 'string' && value.length))];
    return { ...auth, systems, identities };
  }

  async function getPartition(partitionID, auth) {
    return authenticated('GET', '/web/api/devices/partitions/' + id(partitionID), auth);
  }
  async function getSensors(sensorIDs, auth) {
    const values = Array.isArray(sensorIDs) ? sensorIDs : [sensorIDs];
    const query = new URLSearchParams();
    for (const sensorID of values) { id(sensorID); query.append('ids[]', sensorID); }
    if (!values.length) return { data: [] };
    return authenticated('GET', '/web/api/devices/sensors?' + query, auth);
  }
  async function getCurrentState(systemID, auth) {
    const response = await authenticated('GET', '/web/api/systems/systems/' + id(systemID), auth);
    if (!response?.data || !response.data.relationships) throw new FrontpointError('System response is missing relationships');
    const relationships = response.data.relationships;
    const partitionRefs = relationships.partitions?.data ?? [];
    const sensorRefs = relationships.sensors?.data ?? [];
    if (!Array.isArray(partitionRefs) || !Array.isArray(sensorRefs)) throw new FrontpointError('System relationships must be arrays');
    const [partitions, sensors] = await Promise.all([
      Promise.all(partitionRefs.map(partition => getPartition(partition.id, auth))),
      getSensors(sensorRefs.map(sensor => sensor.id), auth),
    ]);
    return { id: response.data.id, attributes: response.data.attributes,
      partitions: partitions.map(partition => partition.data), sensors: sensors.data, relationships };
  }
  async function arm(partitionID, verb, auth, options = {}) {
    const body = verb === 'disarm' ? { statePollOnly: false } : {
      noEntryDelay: Boolean(options?.noEntryDelay), silentArming: Boolean(options?.silentArming), statePollOnly: false,
    };
    return authenticated('POST', `/web/api/devices/partitions/${id(partitionID)}/${verb}`, auth, body);
  }
  return { login, getCurrentState, getPartition, getSensors,
    armStay: (partitionID, auth, options) => arm(partitionID, 'armStay', auth, options),
    armAway: (partitionID, auth, options) => arm(partitionID, 'armAway', auth, options),
    disarm: (partitionID, auth) => arm(partitionID, 'disarm', auth),
    SYSTEM_STATES, SENSOR_STATES };
}

exports.createClient = createClient;
exports.FrontpointError = FrontpointError;
const defaultClient = createClient();
exports.login = defaultClient.login;
exports.getCurrentState = defaultClient.getCurrentState;
exports.getPartition = defaultClient.getPartition;
exports.getSensors = defaultClient.getSensors;
exports.armStay = defaultClient.armStay;
exports.armAway = defaultClient.armAway;
exports.disarm = defaultClient.disarm;
exports.SYSTEM_STATES = defaultClient.SYSTEM_STATES;
exports.SENSOR_STATES = defaultClient.SENSOR_STATES;
