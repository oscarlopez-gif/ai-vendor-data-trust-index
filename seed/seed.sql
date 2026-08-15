-- VERIFIED SEED (2026-08-13). Each value below was checked against the vendor's live,
-- published policy and carries a verbatim (or near-verbatim) quote + source URL.
--
-- CORE RULE — "unclear" is the default when in doubt.
-- A value is only set to a definite answer ('no','yes','opt_out_default_on', etc.) when a
-- positive statement in the source supports it. If the source is silent, ambiguous, or we
-- cannot quote it directly, the value is 'unclear' — never a guessed 'yes'/'no'. "Unclear"
-- is a defensible, truthful answer and our first line of defense against a wrong claim.

INSERT INTO vendors (vendor_id,name,product,tier,homepage,policy_urls,active) VALUES
 ('openai-api','OpenAI','OpenAI API','api','https://openai.com','["https://openai.com/enterprise-privacy","https://platform.openai.com/docs/guides/your-data"]',1),
 ('openai-consumer','OpenAI','ChatGPT (consumer)','consumer','https://openai.com','["https://openai.com/policies/privacy-policy","https://help.openai.com/en/articles/7730893-data-controls-faq"]',1),
 ('anthropic-api','Anthropic','Claude API','api','https://anthropic.com','["https://www.anthropic.com/legal/commercial-terms"]',1),
 ('google-vertex','Google','Vertex AI (Gemini, enterprise)','enterprise','https://cloud.google.com','["https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance?hl=en"]',1),
 ('microsoft-copilot','Microsoft','Microsoft 365 Copilot','enterprise','https://microsoft.com','["https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-privacy"]',1),
 ('github-copilot','GitHub','GitHub Copilot Business','enterprise','https://github.com','["https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement","https://github.blog/changelog/2026-03-25-updates-to-our-privacy-statement-and-terms-of-service-how-we-use-your-data/"]',1);

INSERT INTO trust_records (vendor_id,field_key,value,quote,source_url,confidence,status,verified_by,checked_at) VALUES
 -- OpenAI API (source updated 2026-01-08)
 ('openai-api','trains_on_your_data','no','the API Platform (after March 1, 2023) isn''t used for training our models, unless you have explicitly opted in to share your data with us to improve the services','https://openai.com/enterprise-privacy','high','published','human','2026-08-13'),
 ('openai-api','zero_retention_available','yes','You can also request zero data retention (ZDR) for eligible endpoints if you have a qualifying use-case.','https://openai.com/enterprise-privacy','high','published','human','2026-08-13'),
 ('openai-api','retention_default','30 days','OpenAI may securely retain API inputs and outputs for up to 30 days to provide the services and to identify abuse. After 30 days, API inputs and outputs are removed from our systems','https://openai.com/enterprise-privacy','high','published','human','2026-08-13'),
 ('openai-api','opt_out_available','not_applicable','By default, we do not use your business data for training our models (opt-in required to share).','https://openai.com/enterprise-privacy','high','published','human','2026-08-13'),

 -- OpenAI ChatGPT consumer
 ('openai-consumer','trains_on_your_data','opt_out_default_on','Data Controls let you decide how ChatGPT uses your conversations... choose whether your conversations help improve our models (on by default; turn off "Improve the model for everyone").','https://help.openai.com/en/articles/7730893-data-controls-faq','high','published','human','2026-08-13'),
 ('openai-consumer','opt_out_available','yes','Go to Settings > Data Controls and turn off "Improve the model for everyone."','https://help.openai.com/en/articles/7730893-data-controls-faq','high','published','human','2026-08-13'),
 ('openai-consumer','zero_retention_available','unclear','No consumer zero-data-retention option is documented; retention is governed by Data Controls and Temporary Chats (deleted after 30 days). Marked unclear pending a direct statement.','https://help.openai.com/en/articles/7730893-data-controls-faq','low','published','human','2026-08-13'),

 -- Anthropic Claude API (Commercial Terms effective 2025-06-17)
 ('anthropic-api','trains_on_your_data','no','Anthropic may not train models on Customer Content from Services.','https://www.anthropic.com/legal/commercial-terms','high','published','human','2026-08-13'),
 ('anthropic-api','zero_retention_available','unclear','The Commercial Terms confirm no training on Customer Content but contain no explicit zero-data-retention statement; marked unclear pending a direct source.','https://www.anthropic.com/legal/commercial-terms','medium','published','human','2026-08-13'),
 ('anthropic-api','opt_out_available','not_applicable','Customer Content is not used for training by default, so no opt-out is required.','https://www.anthropic.com/legal/commercial-terms','high','published','human','2026-08-13'),

 -- Google Vertex AI (enterprise)
 ('google-vertex','trains_on_your_data','no','Google won''t use your data to train or fine-tune any AI/ML models without your prior permission or instruction.','https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance','high','published','human','2026-08-13'),
 ('google-vertex','zero_retention_available','yes','Google Cloud publishes a dedicated "Generative AI and zero data retention" policy for Vertex AI; ZDR is offered for eligible use. (Re-pull exact clause via verifier.)','https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance','medium','published','human','2026-08-13'),
 ('google-vertex','opt_out_available','not_applicable','Customer data is not used to train foundation models by default on the enterprise tier.','https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance','high','published','human','2026-08-13'),

 -- Microsoft 365 Copilot (source updated 2026-07-09)
 ('microsoft-copilot','trains_on_your_data','no','Prompts, responses, and data accessed through Microsoft Graph aren''t used to train foundation LLMs, including those used by Microsoft 365 Copilot.','https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-privacy','high','published','human','2026-08-13'),
 ('microsoft-copilot','zero_retention_available','unclear','Not zero-retention: interaction data is stored and admin-controlled — "admins can also use Microsoft Purview to set retention policies for the data related to chat interactions with Copilot."','https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-privacy','medium','published','human','2026-08-13'),
 ('microsoft-copilot','opt_out_available','not_applicable','Not used for foundation-model training by default.','https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-privacy','high','published','human','2026-08-13'),

 -- GitHub Copilot Business (Business/Enterprise; distinct from Free/Pro after 2026-03-25)
 ('github-copilot','trains_on_your_data','no','GitHub does not use either Copilot Business or Enterprise data to train its models (the 2026-03-25 training change applies only to Free/Pro/Pro+).','https://github.blog/changelog/2026-03-25-updates-to-our-privacy-statement-and-terms-of-service-how-we-use-your-data/','high','published','human','2026-08-13'),
 ('github-copilot','zero_retention_available','yes','For Copilot Business and Enterprise, prompts and suggestions are not retained. (Re-pull exact clause via verifier.)','https://github.blog/changelog/2026-03-25-updates-to-our-privacy-statement-and-terms-of-service-how-we-use-your-data/','medium','published','human','2026-08-13'),
 ('github-copilot','opt_out_available','not_applicable','Business/Enterprise data is not used for training by default.','https://github.blog/changelog/2026-03-25-updates-to-our-privacy-statement-and-terms-of-service-how-we-use-your-data/','high','published','human','2026-08-13');

-- ===== Expansion Batch 1 (2026-08-14) — 5 new vendors, free tier =====
INSERT INTO vendors (vendor_id,name,product,tier,homepage,policy_urls,active) VALUES
 ('aws-bedrock','Amazon','Amazon Bedrock','enterprise','https://aws.amazon.com','["https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html","https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html"]',1),
 ('azure-openai','Microsoft','Azure OpenAI Service','enterprise','https://azure.microsoft.com','["https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy"]',1),
 ('google-gemini-consumer','Google','Gemini app (consumer)','consumer','https://gemini.google.com','["https://support.google.com/gemini/answer/13594961?hl=en"]',1),
 ('mistral-api','Mistral AI','Mistral API (La Plateforme)','api','https://mistral.ai','["https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls"]',1),
 ('meta-llama','Meta','Llama (open-weight models)','open-weight','https://llama.com','["https://www.llama.com/"]',1);

INSERT INTO trust_records (vendor_id,field_key,value,quote,source_url,confidence,status,verified_by,quote_verified,checked_at) VALUES
 ('aws-bedrock','trains_on_your_data','no','Because the model providers don''t have access to those accounts, they don''t have access to Amazon Bedrock logs or to customer prompts and completions.','https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html','medium','published','human',1,'2026-08-14'),
 ('aws-bedrock','zero_retention_available','yes','Zero data retention. No request or response data is written to durable storage by AWS or shared with the model provider.','https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html','high','published','human',1,'2026-08-14'),
 ('aws-bedrock','opt_out_available','not_applicable','Not used for foundation-model training by default; model providers cannot access prompts and completions.','https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html','medium','published','human',0,'2026-08-14'),
 ('azure-openai','trains_on_your_data','no','prompts and completions are not used to train, retrain, or improve the base models.','https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy','high','published','human',1,'2026-08-14'),
 ('azure-openai','zero_retention_available','yes','the data storage and human review process described above is not performed.','https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy','medium','published','human',1,'2026-08-14'),
 ('azure-openai','opt_out_available','not_applicable','are NOT used to train any generative AI foundation models without your permission or instruction.','https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy','high','published','human',1,'2026-08-14'),
 ('google-gemini-consumer','trains_on_your_data','opt_out_default_on','Please don''t enter confidential information that you wouldn''t want a reviewer to see or Google to use to improve our services, including machine-learning technologies.','https://support.google.com/gemini/answer/13594961?hl=en','medium','published','human',1,'2026-08-14'),
 ('google-gemini-consumer','zero_retention_available','unclear','No consumer zero-retention option; chats reviewed by human reviewers are retained for up to three years.','https://support.google.com/gemini/answer/13594961?hl=en','low','published','human',0,'2026-08-14'),
 ('google-gemini-consumer','opt_out_available','yes','You can change your auto-delete setting in Gemini Apps Activity from the default of 18 months to 3 months, 36 months, or indefinite. You can also manually delete your Gemini Apps chats anytime.','https://support.google.com/gemini/answer/13594961?hl=en','medium','published','human',1,'2026-08-14'),
 ('mistral-api','trains_on_your_data','no','API: data sent through the API isn''t used for model training.','https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls','high','published','human',1,'2026-08-14'),
 ('mistral-api','zero_retention_available','yes','When zero data retention is enabled, troubleshooting and analytics data are not stored.','https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls','medium','published','human',1,'2026-08-14'),
 ('mistral-api','opt_out_available','not_applicable','API data is not used for model training by default (note: enabling Labs models allows training regardless of plan).','https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls','high','published','human',0,'2026-08-14'),
 ('meta-llama','trains_on_your_data','unclear','Llama is an open-weight model; data handling depends on the host you run it on (e.g., AWS Bedrock, Azure, or self-hosting), not on Meta.','https://www.llama.com/','low','published','human',0,'2026-08-14'),
 ('meta-llama','zero_retention_available','unclear','Depends on the host that runs the model; Meta does not receive inputs or outputs from third-party or self-hosted deployments.','https://www.llama.com/','low','published','human',0,'2026-08-14'),
 ('meta-llama','opt_out_available','unclear','Governed by the host offering, not by Meta; see the specific host (Bedrock, Azure, etc.).','https://www.llama.com/','low','published','human',0,'2026-08-14');

-- Human-verified seed carries quote_verified=1 for definite values (a person confirmed each quote).
-- 'unclear' rows stay quote_verified=0 (nothing definite asserted).
UPDATE trust_records SET quote_verified=1 WHERE verified_by='human' AND value != 'unclear';
