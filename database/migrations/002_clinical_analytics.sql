-- Clinical analytics support for doctor monitoring
BEGIN;

-- Helpful composite index for trend queries by device/time
CREATE INDEX IF NOT EXISTS idx_health_data_device_time_desc
  ON health_data (device_id, time DESC);

-- Aggregate trend function (bucket in minutes)
CREATE OR REPLACE FUNCTION get_health_trends(
  p_device_id TEXT,
  p_hours INTEGER DEFAULT 24,
  p_bucket_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
  bucket_time TIMESTAMPTZ,
  avg_heart_rate DOUBLE PRECISION,
  min_spo2 DOUBLE PRECISION,
  avg_temperature DOUBLE PRECISION,
  ecg_samples BIGINT,
  abnormal_count BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    time_bucket(make_interval(mins => GREATEST(p_bucket_minutes, 1)), time) AS bucket_time,
    AVG(heart_rate) AS avg_heart_rate,
    MIN(spo2) AS min_spo2,
    AVG(temperature) AS avg_temperature,
    COUNT(ecg_value) AS ecg_samples,
    COUNT(*) FILTER (WHERE is_abnormal = true) AS abnormal_count
  FROM health_data
  WHERE device_id = p_device_id
    AND time >= NOW() - make_interval(hours => GREATEST(p_hours, 1))
  GROUP BY 1
  ORDER BY 1 ASC;
$$;

COMMIT;
