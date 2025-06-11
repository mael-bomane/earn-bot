import { teardownE2eDatabase } from './utils/db-test-utils';

module.exports = async () => {
  await teardownE2eDatabase();
  console.log('Global test teardown finished.');
};
