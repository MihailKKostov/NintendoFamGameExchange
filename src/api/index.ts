import { config } from '../config';
import { createDemoApi } from './demoApi';
import { createSupabaseApi } from './supabaseApi';
import type { Api } from './types';

export const api: Api = config.demo ? createDemoApi() : createSupabaseApi();
export type { Api, Table } from './types';
