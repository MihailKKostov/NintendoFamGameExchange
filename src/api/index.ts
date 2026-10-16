import { config } from '../config';
import { createDemoApi } from './demoApi';
import { createFirebaseApi } from './firebaseApi';
import type { Api } from './types';

export const api: Api = config.firebase ? createFirebaseApi() : createDemoApi();
export type { Api, Table } from './types';
