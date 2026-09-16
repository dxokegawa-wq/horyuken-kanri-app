CREATE TABLE `month_end_photos` (
  `store` text NOT NULL,
  `month` text NOT NULL,
  `photo_key` text NOT NULL,
  `photo_type` text NOT NULL,
  `photo_name` text NOT NULL,
  `uploaded_at` text NOT NULL,
  PRIMARY KEY (`store`, `month`)
);
