-- The flow runner looked for new events only every 15 minutes, so a message "3 minutes after a new lead"
-- could really go out up to 18 minutes after it. One run takes about 0.2 seconds, so it now runs every
-- minute. Nothing else changes: the same rules decide what is queued, and the same limits (daily cap,
-- gap, hours, pause) decide what is sent.

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'automation-run-rules'),
  schedule := '* * * * *'
);
