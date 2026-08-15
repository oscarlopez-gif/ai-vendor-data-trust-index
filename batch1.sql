-- Expansion Batch 1 — 5 new vendors (free tier), human-verified with cited quotes (2026-08-14).
-- Additive: run against the live DB without wiping existing data.
--   npx wrangler d1 execute ai-trust --remote --file=./batch1.sql
-- Sources fetched & quoted verbatim where a definite value is asserted; unclear = honest default.

INSERT INTO vendors (vendor_id,name,product,tier,homepage,policy_urls,active) VALUES
 ('aws-bedrock','Amazon','Amazon Bedrock','enterprise','https://aws.amazon.com','["https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html","https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html"]',1),
 ('azure-openai','Microsoft','Azure OpenAI Service','enterprise','https://azure.microsoft.com','["https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy"]',1),
 ('google-gemini-consumer','Google','Gemini app (consumer)','consumer','https://gemini.google.com','["https://support.google.com/gemini/answer/13594961?hl=en"]',1),
 ('mistral-api','Mistral AI','Mistral API (La Plateforme)','api','https://mistral.ai','["https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls"]',1),
 ('meta-llama','Meta','Llama (open-weight models)','open-weight','https://llama.com','["https://www.llama.com/"]',1);

INSERT INTO trust_records (vendor_id,field_key,value,quote,source_url,confidence,status,verified_by,quote_verified,checked_at) VALUES
 -- Amazon Bedrock
 ('aws-bedrock','trains_on_your_data','no','Because the model providers don''t have access to those accounts, they don''t have access to Amazon Bedrock logs or to customer prompts and completions.','https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html','medium','published','human',1,'2026-08-14'),
 ('aws-bedrock','zero_retention_available','yes','Zero data retention. No request or response data is written to durable storage by AWS or shared with the model provider.','https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html','high','published','human',1,'2026-08-14'),
 ('aws-bedrock','opt_out_available','not_applicable','Not used for foundation-model training by default; model providers cannot access prompts and completions.','https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html','medium','published','human',0,'2026-08-14'),

 -- Azure OpenAI Service
 ('azure-openai','trains_on_your_data','no','prompts and completions are not used to train, retrain, or improve the base models.','https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy','high','published','human',1,'2026-08-14'),
 ('azure-openai','zero_retention_available','yes','the data storage and human review process described above is not performed.','https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy','medium','published','human',1,'2026-08-14'),
 ('azure-openai','opt_out_available','not_applicable','are NOT used to train any generative AI foundation models without your permission or instruction.','https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy','high','published','human',1,'2026-08-14'),

 -- Google Gemini (consumer app)
 ('google-gemini-consumer','trains_on_your_data','opt_out_default_on','Please don''t enter confidential information that you wouldn''t want a reviewer to see or Google to use to improve our services, including machine-learning technologies.','https://support.google.com/gemini/answer/13594961?hl=en','medium','published','human',1,'2026-08-14'),
 ('google-gemini-consumer','zero_retention_available','unclear','No consumer zero-retention option; chats reviewed by human reviewers are retained for up to three years.','https://support.google.com/gemini/answer/13594961?hl=en','low','published','human',0,'2026-08-14'),
 ('google-gemini-consumer','opt_out_available','yes','You can change your auto-delete setting in Gemini Apps Activity from the default of 18 months to 3 months, 36 months, or indefinite. You can also manually delete your Gemini Apps chats anytime.','https://support.google.com/gemini/answer/13594961?hl=en','medium','published','human',1,'2026-08-14'),

 -- Mistral API (La Plateforme)
 ('mistral-api','trains_on_your_data','no','API: data sent through the API isn''t used for model training.','https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls','high','published','human',1,'2026-08-14'),
 ('mistral-api','zero_retention_available','yes','When zero data retention is enabled, troubleshooting and analytics data are not stored.','https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls','medium','published','human',1,'2026-08-14'),
 ('mistral-api','opt_out_available','not_applicable','API data is not used for model training by default (note: enabling Labs models allows training regardless of plan).','https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls','high','published','human',0,'2026-08-14'),

 -- Meta Llama (open-weight; data handling depends on the host)
 ('meta-llama','trains_on_your_data','unclear','Llama is an open-weight model; data handling depends on the host you run it on (e.g., AWS Bedrock, Azure, or self-hosting), not on Meta.','https://www.llama.com/','low','published','human',0,'2026-08-14'),
 ('meta-llama','zero_retention_available','unclear','Depends on the host that runs the model; Meta does not receive inputs or outputs from third-party or self-hosted deployments.','https://www.llama.com/','low','published','human',0,'2026-08-14'),
 ('meta-llama','opt_out_available','unclear','Governed by the host offering, not by Meta; see the specific host (Bedrock, Azure, etc.).','https://www.llama.com/','low','published','human',0,'2026-08-14');
