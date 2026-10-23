// Starts the API on port 4001 with configuration forced to the isolated test database.
import '../tests/setup/loadTestEnv.js';

process.env.PORT = '4001';

const env = (await import('../src/config/env.js')).default;
const testName = env.database.testName;
if (
  !testName
  || env.database.name !== testName
  || testName === env.database.maintenanceName
  || !testName.endsWith('_test')
  || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(testName)
) {
  throw new Error('Refusing test server startup: target must equal DB_NAME_TEST, differ from DB_NAME, and end with _test.');
}

await import('../src/server.js');
