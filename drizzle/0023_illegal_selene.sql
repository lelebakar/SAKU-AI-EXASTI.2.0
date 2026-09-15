CREATE TABLE `saku_rate_limit_buckets` (
	`bucketKey` varchar(255) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`resetAt` bigint NOT NULL,
	CONSTRAINT `saku_rate_limit_buckets_bucketKey` PRIMARY KEY(`bucketKey`)
);
