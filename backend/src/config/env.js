import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const moduleUrl = typeof import.meta !== 'undefined' ? import.meta.url : undefined;
const __filename = moduleUrl ? fileURLToPath(moduleUrl) : path.resolve(process.cwd(), 'backend/src/config/env.js');
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
