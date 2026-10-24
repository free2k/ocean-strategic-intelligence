import {verifyLowCarbonEnvironment} from './runtime.mjs';
await verifyLowCarbonEnvironment();
await import('../server.mjs');
