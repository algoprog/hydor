import { runApp } from './src/app.mjs';
import { sink } from './src/logger.mjs';

runApp();
console.log(JSON.stringify(sink, null, 2));
