/*
  Warnings:

  - You are about to drop the column `entry_id` on the `follow_ups` table. All the data in the column will be lost.
  - You are about to drop the `entries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `entry_tags` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `insight_id` to the `follow_ups` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `entry_tags` DROP FOREIGN KEY `entry_tags_entry_id_fkey`;

-- DropForeignKey
ALTER TABLE `entry_tags` DROP FOREIGN KEY `entry_tags_tag_id_fkey`;

-- DropForeignKey
ALTER TABLE `follow_ups` DROP FOREIGN KEY `follow_ups_entry_id_fkey`;

-- DropIndex
DROP INDEX `follow_ups_entry_id_fkey` ON `follow_ups`;

-- AlterTable
ALTER TABLE `follow_ups` DROP COLUMN `entry_id`,
    ADD COLUMN `insight_id` INTEGER NOT NULL;

-- DropTable
DROP TABLE `entries`;

-- DropTable
DROP TABLE `entry_tags`;

-- CreateTable
CREATE TABLE `insights` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(20) NOT NULL,
    `content` TEXT NOT NULL,
    `detail` MEDIUMTEXT NULL,
    `rationale` TEXT NULL,
    `agent` VARCHAR(50) NOT NULL,
    `repo` VARCHAR(200) NULL,
    `branch` VARCHAR(200) NULL,
    `session_id` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `insights_agent_idx`(`agent`),
    INDEX `insights_type_idx`(`type`),
    INDEX `insights_repo_idx`(`repo`),
    INDEX `insights_created_at_idx`(`created_at`),
    FULLTEXT INDEX `insights_content_idx`(`content`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_tags` (
    `insight_id` INTEGER NOT NULL,
    `tag_id` INTEGER NOT NULL,

    PRIMARY KEY (`insight_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insight_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_id` INTEGER NOT NULL,
    `target_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,

    INDEX `insight_relations_target_id_idx`(`target_id`),
    UNIQUE INDEX `insight_relations_source_id_target_id_type_key`(`source_id`, `target_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `insight_tags` ADD CONSTRAINT `insight_tags_insight_id_fkey` FOREIGN KEY (`insight_id`) REFERENCES `insights`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insight_tags` ADD CONSTRAINT `insight_tags_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_insight_id_fkey` FOREIGN KEY (`insight_id`) REFERENCES `insights`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insight_relations` ADD CONSTRAINT `insight_relations_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `insights`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insight_relations` ADD CONSTRAINT `insight_relations_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `insights`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
