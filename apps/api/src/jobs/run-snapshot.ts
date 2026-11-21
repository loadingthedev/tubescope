import { runDailySnapshot } from './scheduler.ts';
runDailySnapshot()
  .then(s => {
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
