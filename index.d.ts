/// <reference types="node" />
export interface Resource {
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}
export interface Authentication {
  cookie: string;
  ajaxKey: string;
  systems: string[];
  identities: { data: unknown[] };
  headers?: Record<string, string>;
  signal?: AbortSignal;
}
export interface CurrentState {
  id: string;
  attributes: Record<string, unknown>;
  partitions: Resource[];
  sensors: Resource[];
  relationships: Record<string, unknown>;
}
export interface ArmOptions { noEntryDelay?: boolean; silentArming?: boolean; }
export interface Client {
  login(username: string, password: string, options?: { signal?: AbortSignal }): Promise<Authentication>;
  getCurrentState(systemID: string, auth: Authentication): Promise<CurrentState>;
  getPartition(partitionID: string, auth: Authentication): Promise<{ data: Resource }>;
  getSensors(sensorIDs: string | string[], auth: Authentication): Promise<{ data: Resource[] }>;
  armStay(partitionID: string, auth: Authentication, options?: ArmOptions): Promise<unknown>;
  armAway(partitionID: string, auth: Authentication, options?: ArmOptions): Promise<unknown>;
  disarm(partitionID: string, auth: Authentication): Promise<unknown>;
  SYSTEM_STATES: typeof SYSTEM_STATES;
  SENSOR_STATES: typeof SENSOR_STATES;
}
export function createClient(options?: { fetch?: typeof globalThis.fetch; timeout?: number }): Client;
export class FrontpointError extends Error { constructor(message: string, status?: number); readonly status?: number; }
export const login: Client['login'];
export const getCurrentState: Client['getCurrentState'];
export const getPartition: Client['getPartition'];
export const getSensors: Client['getSensors'];
export const armStay: Client['armStay'];
export const armAway: Client['armAway'];
export const disarm: Client['disarm'];
export const SYSTEM_STATES: Readonly<{ UNKNOWN: 0; DISARMED: 1; ARMED_STAY: 2; ARMED_AWAY: 3; ARMED_NIGHT: 4 }>;
export const SENSOR_STATES: Readonly<{ UNKNOWN: 0; CLOSED: 1; OPEN: 2; IDLE: 3; ACTIVE: 4; DRY: 5; WET: 6 }>;
