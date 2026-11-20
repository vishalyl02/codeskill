import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyExamSecurityCompositeIndexesMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'exam_security_events' AND column_name = 'createdAt'
      ) THEN
        CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_asmt_cand_created" 
          ON "exam_security_events" ("assessment_id", "candidate_id", "createdAt" DESC);
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'exam_security_events' AND column_name = 'created_at'
      ) THEN
        CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_asmt_cand_created" 
          ON "exam_security_events" ("assessment_id", "candidate_id", "created_at" DESC);
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'exam_security_events' AND column_name = 'eventType'
      ) THEN
        CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_asmt_event_type" 
          ON "exam_security_events" ("assessment_id", "eventType");
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'exam_security_events' AND column_name = 'event_type'
      ) THEN
        CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_asmt_event_type" 
          ON "exam_security_events" ("assessment_id", "event_type");
      END IF;
    END $$;
  `);
}
