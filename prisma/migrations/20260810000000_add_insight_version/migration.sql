-- updated_at has millisecond precision, so use an explicit optimistic-lock version.
ALTER TABLE `insights`
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `insights`
    MODIFY COLUMN `type` ENUM('discovery', 'decision', 'solution', 'issue', 'caveat') NOT NULL;

ALTER TABLE `insight_relations`
    MODIFY COLUMN `type` ENUM('relates_to', 'resolves', 'supersedes') NOT NULL;

ALTER TABLE `follow_ups`
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `resolved_at` DATETIME(3) NULL;

ALTER TABLE `follow_ups`
    ALTER COLUMN `updated_at` DROP DEFAULT;

CREATE INDEX `insights_updated_at_idx` ON `insights`(`updated_at`);
CREATE INDEX `insights_repo_updated_at_idx` ON `insights`(`repo`, `updated_at`);
CREATE INDEX `insights_repo_type_updated_at_idx` ON `insights`(`repo`, `type`, `updated_at`);
CREATE INDEX `follow_ups_insight_id_resolved_idx` ON `follow_ups`(`insight_id`, `resolved`);
