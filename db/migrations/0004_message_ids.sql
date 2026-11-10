-- PRD 9.1: process inbound webhooks idempotently by WhatsApp message id, stored in message_log.
alter table message_log add column wa_message_id text unique;
