import { config } from '../config';
import { createDemoApi } from './demoApi';
import { createFirebaseApi } from './firebaseApi';
import type { Api } from './types';

export const api: Api = config.demo ? createDemoApi() : createFirebaseApi();
export type { Api, Table } from './types';
