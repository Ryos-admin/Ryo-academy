
BEGIN;

CREATE TYPE "DayOfWeek_new" AS ENUM (
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY'
);

CREATE FUNCTION pg_temp.convert_day_of_week(old_days "DayOfWeek"[])
RETURNS "DayOfWeek_new"[]
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN old_days IS NULL THEN NULL
        ELSE ARRAY(
            SELECT CASE day
                WHEN 'MON' THEN 'MONDAY'
                WHEN 'TUE' THEN 'TUESDAY'
                WHEN 'WED' THEN 'WEDNESDAY'
                WHEN 'THU' THEN 'THURSDAY'
                WHEN 'FRI' THEN 'FRIDAY'
                WHEN 'SAT' THEN 'SATURDAY'
                WHEN 'SUN' THEN 'SUNDAY'
            END::"DayOfWeek_new"
            FROM unnest(old_days) WITH ORDINALITY AS d(day, ord)
            ORDER BY ord
        )
    END;
$$;

ALTER TABLE "Program"
ALTER COLUMN "daysOfWeek"
TYPE "DayOfWeek_new"[]
USING pg_temp.convert_day_of_week("daysOfWeek");

-- Remove the function dependency on the old enum.
DROP FUNCTION pg_temp.convert_day_of_week("DayOfWeek"[]);

ALTER TYPE "DayOfWeek" RENAME TO "DayOfWeek_old";

ALTER TYPE "DayOfWeek_new" RENAME TO "DayOfWeek";

DROP TYPE "public"."DayOfWeek_old";

COMMIT;