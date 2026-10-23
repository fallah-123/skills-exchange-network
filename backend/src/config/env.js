// Loads and validates backend environment configuration without exposing secrets.
import 'dotenv/config';

const REQUIRED_VALUES = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME_TEST',
  'SESSION_SECRET'
];

function parsePort(name, value, errors) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

const errors = REQUIRED_VALUES
  .filter((name) => !process.env[name])
  .map((name) => `${name} is required`);

if (process.env.NODE_ENV && !['development', 'test', 'production'].includes(process.env.NODE_ENV)) {
  errors.push('NODE_ENV must be development, test, or production');
}

const port = parsePort('PORT', process.env.PORT, errors);
const databasePort = parsePort('DB_PORT', process.env.DB_PORT, errors);

if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
  errors.push('SESSION_SECRET must be at least 32 characters');
}

if (process.env.NODE_ENV === 'test') {
  if (process.env.DB_NAME_TEST === process.env.DB_NAME) {
    errors.push('DB_NAME_TEST must differ from DB_NAME when NODE_ENV is test');
  }
  if (process.env.DB_NAME_TEST && !process.env.DB_NAME_TEST.endsWith('_test')) {
    errors.push('DB_NAME_TEST must end with _test when NODE_ENV is test');
  }
}

if (errors.length > 0) {
  throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
}

const nodeEnv = process.env.NODE_ENV;

/** Validated, immutable configuration shared by backend modules. */
const env = Object.freeze({
  nodeEnv,
  port,
  database: Object.freeze({
    host: process.env.DB_HOST,
    port: databasePort,
    name: nodeEnv === 'test' ? process.env.DB_NAME_TEST : process.env.DB_NAME,
    maintenanceName: process.env.DB_NAME,
    testName: process.env.DB_NAME_TEST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }),
  sessionSecret: process.env.SESSION_SECRET
});

export default env;
