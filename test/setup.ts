import { setupE2eDatabase } from './utils/db-test-utils';

module.exports = async () => {
  await setupE2eDatabase();
  console.log('Global test setup finished.');
};
