-- Re-pin the two sources that didn't fetch server-side, without wiping verified data.
-- OpenAI-consumer: the help-center page is JavaScript-rendered; the US privacy policy is static and states
--   the consumer training-by-default + opt-out clearly.
-- Google Vertex: the plain data-governance URL 404s; the ?hl=en variant returns content.
UPDATE vendors
  SET policy_urls = '["https://openai.com/policies/privacy-policy","https://help.openai.com/en/articles/7730893-data-controls-faq"]'
  WHERE vendor_id = 'openai-consumer';

UPDATE vendors
  SET policy_urls = '["https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance?hl=en"]'
  WHERE vendor_id = 'google-vertex';
